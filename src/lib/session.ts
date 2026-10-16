/**
 * アプリを閉じても消えてはいけない状態（localStorage）をまとめて扱う。
 * iPhoneのホーム画面アプリは閉じるとsessionStorageが消えるため、進行中の要請や対応はここに置く。
 * localStorageが使えない環境（プライベートモード等）でも落ちないよう、失敗は握りつぶす。
 */

const KEYS = {
  myAlertId: 'helpmark:myAlertId',
  navigatingAlertId: 'helpmark:navigatingAlertId',
  deviceSecret: 'helpmark:deviceSecret',
} as const

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 保存できなくてもアプリは動かし続ける */
  }
}

/** 自分が送った支援要請 */
export const getMyAlertId = () => read(KEYS.myAlertId)
export const setMyAlertId = (id: string | null) => write(KEYS.myAlertId, id)

/** パートナーとして対応中の支援要請 */
export const getNavigatingAlertId = () => read(KEYS.navigatingAlertId)
export const setNavigatingAlertId = (id: string | null) => write(KEYS.navigatingAlertId, id)

/** 到着後画面のチェックリスト */
export function getChecklist(alertId: string): Record<string, boolean> {
  try {
    return JSON.parse(read(`helpmark:checklist:${alertId}`) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}
export const setChecklist = (alertId: string, v: Record<string, boolean> | null) =>
  write(`helpmark:checklist:${alertId}`, v ? JSON.stringify(v) : null)

/** 対応が終わった要請に紐づく端末内の情報を消す */
export function clearResponderState(alertId: string): void {
  setChecklist(alertId, null)
  if (getNavigatingAlertId() === alertId) setNavigatingAlertId(null)
}

/** APIの端末認証に使うシークレット（初回に生成して端末に保存） */
export function getDeviceSecret(): string {
  let s = read(KEYS.deviceSecret)
  if (!s) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    s = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    write(KEYS.deviceSecret, s)
  }
  return s
}
