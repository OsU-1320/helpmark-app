/**
 * 支援要請の取得・操作。Firestoreには直接触れず、すべてAPI（Cloudflare Worker）経由。
 * 以前のリアルタイム購読（onSnapshot）と同じ形の subscribe* 関数を、
 * 5秒間隔のポーリングで提供する（同じ要請を複数画面が見ても通信は1本にまとめる）。
 */
import { ApiError, apiFetch } from './api'
import type { HelpProfile } from './profile'
import { getProfileRoles, loadProfile } from './profile'

/** リアルタイム位置共有の自動停止時間（対応記録からこの時間で書き込みを止める） */
export const SHARING_TIMEOUT_MS = 30 * 60 * 1000
/** 位置共有の書き込み間隔（ミリ秒） */
export const SHARING_INTERVAL_MS = 15 * 1000
/** 応答がない場合に駅員・119番の案内を出すまでの時間（送信から） */
export const NO_RESPONSE_TIMEOUT_MS = 3 * 60 * 1000
/** 追加支援の同一種別の再送信を抑止する間隔（サーバーでも同じ制限をかけている） */
export const EXTRA_HELP_THROTTLE_MS = 60 * 1000
/** 画面の更新間隔 */
const POLL_INTERVAL_MS = 5 * 1000

/**
 * 要請全体の状態。「応答者0人＝active、1人以上＝responded」という区別や「到着済み」は保存せず、
 * 応答者一覧から都度導出する。expired は送信から1時間を過ぎて自動的に終了扱いになったもの。
 */
export type AlertStatus = 'active' | 'completed' | 'cancelled' | 'expired'

/** 要請が終わったときの説明（パートナー側の画面で使う） */
export function closedMessage(status: AlertStatus): { title: string; note: string } {
  if (status === 'cancelled') return { title: '取り下げられました', note: '要請した方から取り消されました。ご協力ありがとうございました。' }
  if (status === 'expired') return { title: '要請は終了しました', note: '送信から1時間が過ぎたため、この要請は終了しました。ご協力ありがとうございました。' }
  return { title: '対応済みになりました', note: '他のパートナーが対応を完了しました。ご協力ありがとうございました。' }
}

export interface ActiveAlert {
  id: string
  nickname: string
  considerations: string[]
  createdAtMs: number
  status: AlertStatus
  lat?: number
  lng?: number
  /** 追加支援の依頼履歴（種別は伏せて件数・時刻のみ画面に使う） */
  extraRequests?: Array<{ type: string; atMs: number }>
  /** 一覧用：対応中（向かっている・到着済み）の人数 */
  activeResponderCount?: number
  /** 一覧用：自分がすでに対応しているか */
  iResponded?: boolean
}

export type ResponderStatus = 'going' | 'arrived' | 'completed' | 'left'

export interface ResponderEntry {
  /** 応答したパートナーのprofileId */
  id: string
  nickname: string
  /** 相手のNFCタグを読み取り済み（対応完了が押せる） */
  tagVerified?: boolean
  status: ResponderStatus
  lat?: number
  lng?: number
  locationUpdatedAt?: number
  respondedAtMs: number
  arrivedAtMs?: number
}

/** 要請1件の見え方。送信した端末・応答者・その他のパートナーで返る内容が違う */
export interface AlertView {
  role: 'owner' | 'responder' | 'viewer'
  alert: ActiveAlert
  /** 送信した端末にだけ返る */
  responders?: ResponderEntry[]
  /** 送信した端末にだけ返る。到着したパートナーがタグを読めないときに、本人の画面から伝える確認コード（数字6桁） */
  code?: string | null
  /** 応答者にだけ返る */
  myResponder?: ResponderEntry
  /** 応答者にだけ返る。電話番号は含まない */
  helpCard?: Pick<HelpProfile, 'id' | 'nickname' | 'categories' | 'subOptions' | 'categoryNotes' | 'note'> & {
    hasEmergencyContact: boolean
  }
  activeResponderCount?: number
}

export function getAlertView(alertId: string): Promise<AlertView> {
  return apiFetch<AlertView>(`/api/alerts/${encodeURIComponent(alertId)}`)
}

// ── 要請ごとの共有ポーリング ───────────────────────────────────────────

interface Poller {
  subs: Set<(v: AlertView | null) => void>
  last: AlertView | null | undefined
  refresh: () => void
  stop: () => void
}

const pollers = new Map<string, Poller>()

/** fetcher をすぐ1回、以後は一定間隔で呼ぶ（画面が非表示の間は止め、表示に戻ったらすぐ更新）。戻り値は停止関数 */
function startPolling(fetcher: () => Promise<void>, intervalMs = POLL_INTERVAL_MS): () => void {
  const onVisible = () => {
    if (!document.hidden) void fetcher()
  }
  document.addEventListener('visibilitychange', onVisible)
  void fetcher()
  const timer = setInterval(() => {
    if (!document.hidden) void fetcher()
  }, intervalMs)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/** 要請1件を購読する。見る権限が無い・存在しない場合は null を渡す。戻り値は解除関数 */
export function subscribeAlertView(alertId: string, cb: (v: AlertView | null) => void): () => void {
  let p = pollers.get(alertId)
  if (!p) {
    const subs = new Set<(v: AlertView | null) => void>()
    const poller: Poller = { subs, last: undefined, refresh: () => {}, stop: () => {} }
    const fetcher = async () => {
      try {
        poller.last = await getAlertView(alertId)
      } catch (err) {
        // 通信の一時的な失敗では直前の表示を保つ。権限なし・存在しないときだけ null
        if (!(err instanceof ApiError) || (err.status !== 403 && err.status !== 404)) return
        poller.last = null
      }
      subs.forEach((s) => s(poller.last ?? null))
    }
    poller.refresh = () => void fetcher()
    poller.stop = startPolling(fetcher)
    pollers.set(alertId, poller)
    p = poller
  } else if (p.last !== undefined) {
    cb(p.last)
  }
  p.subs.add(cb)
  const target = p
  return () => {
    target.subs.delete(cb)
    if (target.subs.size === 0) {
      target.stop()
      pollers.delete(alertId)
    }
  }
}

/** 操作の直後に表示を即時更新する */
function refreshAlert(alertId: string): void {
  pollers.get(alertId)?.refresh()
}

export function subscribeAlertById(alertId: string, onChange: (alert: ActiveAlert | null) => void): () => void {
  return subscribeAlertView(alertId, (v) => onChange(v?.alert ?? null))
}

/** 応答者一覧（要請を送った端末だけが見られる） */
export function subscribeResponders(alertId: string, onChange: (responders: ResponderEntry[]) => void): () => void {
  return subscribeAlertView(alertId, (v) => onChange(v?.responders ?? []))
}

/** 自分の応答状況 */
export function subscribeResponder(
  alertId: string,
  profileId: string,
  onChange: (responder: ResponderEntry | null) => void,
): () => void {
  return subscribeAlertView(alertId, (v) =>
    onChange(v?.myResponder ?? v?.responders?.find((r) => r.id === profileId) ?? null),
  )
}

/** ホーム画面の要請一覧の更新間隔。新しい要請はプッシュ通知で知らせるので、支援中の画面より長くする */
const ACTIVE_LIST_INTERVAL_MS = 30 * 1000

/**
 * 未完了の支援要請（直近1時間・自分以外が発信したもの）を購読する。
 * registered=false は「サーバーにパートナー（通知先）として登録されていない」ことを表し、
 * 「要請が無い」とは区別する（未登録の端末にはサーバーが一覧を返さない）。
 */
export function subscribeActiveAlerts(
  _myProfileId: string,
  onChange: (alerts: ActiveAlert[], registered: boolean) => void,
): () => void {
  if (!getProfileRoles(loadProfile()).isSupporter) {
    onChange([], false)
    return () => {}
  }
  return startPolling(async () => {
    try {
      const { alerts } = await apiFetch<{ alerts: ActiveAlert[] }>('/api/alerts/active')
      onChange(alerts, true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) onChange([], false)
    }
  }, ACTIVE_LIST_INTERVAL_MS)
}

// ── 操作 ──────────────────────────────────────────────────────────────

async function act(alertId: string, action: string, body: unknown = {}): Promise<void> {
  await apiFetch(`/api/alerts/${encodeURIComponent(alertId)}/${action}`, { method: 'POST', body })
  refreshAlert(alertId)
}

/**
 * 「対応します」：自分の応答記録を作る（二重タップしても1件だけ）。
 * helperCoordsを渡すと最初の位置として保存される。年代・性別はサーバーが登録済みプロフィールから付ける。
 */
export function respondToAlert(
  alertId: string,
  helperName: string,
  helperCoords?: { latitude: number; longitude: number } | null,
): Promise<void> {
  return act(alertId, 'respond', { nickname: helperName, coords: helperCoords ?? null })
}

/** 向かっている間の現在地を更新（15秒間隔で呼ばれる想定） */
export function updateHelperLocation(
  alertId: string,
  _profileId: string,
  coords: { latitude: number; longitude: number },
): Promise<void> {
  return act(alertId, 'location', { coords })
}

/** 「到着しました」：自分の応答だけを到着済みにする */
export function arriveAtResponder(alertId: string, _profileId: string): Promise<void> {
  return act(alertId, 'arrive')
}

/** 「対応できなくなりました」：自分の応答を離脱にする（位置もサーバーから消える） */
export function leaveResponder(alertId: string, _profileId: string): Promise<void> {
  return act(alertId, 'leave')
}

/** 「対応完了」（到着済みの応答者）：要請全体を完了にする */
export function completeAlertByResponder(alertId: string, _profileId: string): Promise<void> {
  return act(alertId, 'complete')
}

/** 要請した本人が支援完了を記録 */
export function completeAlert(alertId: string): Promise<void> {
  return act(alertId, 'complete')
}

/** 「もう大丈夫です」：要請した本人が取り消す */
export function cancelAlert(alertId: string): Promise<void> {
  return act(alertId, 'cancel')
}

/** 送信時に位置が取れていなかったとき、要請した本人の位置をあとから届ける */
export function updateRequesterLocation(alertId: string, coords: { latitude: number; longitude: number }): Promise<void> {
  return act(alertId, 'requester-location', { coords })
}

/** NFCタグを読んだとき、自分のタグか・持ち主の要請がすでに進行中かを確かめる（トークンは通信の本文で送る） */
export function checkTagStatus(token: string): Promise<{ isOwn: boolean; open: boolean; alertId: string | null; nickname: string }> {
  return apiFetch('/api/tag-status', { body: { token } })
}

/**
 * 到着後、相手のNFCタグ（トークン）または確認コードを示して、本人の確認をする。
 * 成功すると、対応完了が押せるようになり、緊急連絡先（登録があれば）が受け取れる。
 */
export function verifyTag(alertId: string, proof: { token: string } | { code: string }): Promise<void> {
  return act(alertId, 'verify-tag', proof)
}

/** 確認済みの応答者が、緊急連絡先を受け取る */
export function fetchEmergencyContact(alertId: string): Promise<{ name: string; relation?: string; phone: string }> {
  return apiFetch(`/api/alerts/${encodeURIComponent(alertId)}/emergency-contact`, { method: 'POST', body: {} })
}

/** 本人が、確認コードを作り直す（入力の失敗回数が上限に達したとき、コードが人に知られたときなど） */
export async function renewAlertCode(alertId: string): Promise<string> {
  return (await apiFetch<{ code: string }>(`/api/alerts/${encodeURIComponent(alertId)}/new-code`, { method: 'POST', body: {} })).code
}

/** 追加支援を呼ぶ（同じ種類は60秒に1回まで。サーバーでも判定する） */
export function postExtraHelp(alertId: string, type: string): Promise<void> {
  return act(alertId, 'extra-help', { type })
}
