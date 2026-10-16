import { useEffect, useState } from 'react'
import { Pict } from '../components/Pictogram'
import { HelpCardModal } from '../components/HelpCardModal'
import './SupportActivePage.css'
import type { PageName } from '../App'
import {
  subscribeAlertById,
  subscribeResponder,
  completeAlertByResponder,
  closedMessage,
  fetchEmergencyContact,
  verifyTag,
  EXTRA_HELP_THROTTLE_MS,
  type ActiveAlert,
  type ResponderEntry,
} from '../lib/alerts'
import { CONSIDERATION_CATEGORIES, getOrCreateProfileId, type ConsiderationCategoryId } from '../lib/profile'
import { NAV_FILTER_KEY } from '../lib/mapFilter'
import { ApiError } from '../lib/api'
import { clearResponderState, getChecklist, getNavigatingAlertId, setChecklist } from '../lib/session'
import { useResponderLocationSharing } from '../hooks/useResponderLocationSharing'
import { useNearestAed } from '../hooks/useNearestAed'
import { AED_MAP_NOTE, NEAR_AED_MAX_M, aedMapUrl } from '../lib/aedMap'
import { loadStationFacilities } from '../lib/stations'
import { useHelpCard } from '../hooks/useHelpCard'
import { EXTRA_HELP_TYPES, requestExtraHelp, type ExtraHelpTypeId } from '../lib/extraHelp'

interface Props {
  navigate: (page: PageName) => void
}

interface ChecklistItem {
  id: string
  label: string
}

/** 「（はなこ・母）」のように、名前と続柄を括弧でまとめる */
function contactLabel(c: { name: string; relation?: string }): string {
  const parts = [c.name, c.relation].filter(Boolean)
  return parts.length ? `（${parts.join('・')}）` : ''
}

export default function SupportActivePage({ navigate }: Props) {
  const [target, setTarget] = useState<ActiveAlert | null>(null)
  const [myResponder, setMyResponder] = useState<ResponderEntry | null>(null)
  const [showHelpCard, setShowHelpCard] = useState(false)
  const [showExtraHelp, setShowExtraHelp] = useState(false)
  const [extraHelpSent, setExtraHelpSent] = useState<ExtraHelpTypeId | null>(null)
  const [alertId] = useState(getNavigatingAlertId)
  const [checked, setChecked] = useState<Record<string, boolean>>(() => (alertId ? getChecklist(alertId) : {}))
  const [contact, setContact] = useState<{ name: string; relation?: string; phone: string } | null>(null)
  const [manualKey, setManualKey] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  const [tagVerified, setTagVerified] = useState(false)

  const myProfileId = getOrCreateProfileId()

  useEffect(() => {
    if (!alertId) return
    return subscribeAlertById(alertId, setTarget)
  }, [alertId])

  useEffect(() => {
    if (!alertId) return
    return subscribeResponder(alertId, myProfileId, setMyResponder)
  }, [alertId, myProfileId])

  // 到着後は自分のresponder.statusが'arrived'になっており、このフック内で位置共有は自動的に止まる
  useResponderLocationSharing(alertId, myProfileId, myResponder?.status, target?.status)
  const { aed: nearestAed, pos: myPos } = useNearestAed()
  // 「近くのAED」は、近いものだけ。遠いもの（別の区のAEDなど）は、近くとは言えないので、出さない
  const aed = nearestAed && nearestAed.distanceM <= NEAR_AED_MAX_M ? nearestAed : null
  const { profile: helpCardProfile, loading: helpCardLoading } = useHelpCard(alertId)

  // チェックリストの進捗はパートナー端末内のみ保持（他端末への同期はしない）
  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      if (alertId) setChecklist(alertId, next)
      return next
    })
  }

  // 相手のNFCタグ、または本人の画面に出ている確認コード（数字6桁）で、本人の確認をする。
  // 確認できると、対応完了が押せるようになる。緊急連絡先が登録されていれば、電話番号も受け取れる
  async function submitCode(code: string) {
    if (!alertId || !code.trim()) return
    setUnlocking(true)
    setUnlockError(null)
    try {
      await verifyTag(alertId, { code })
      setTagVerified(true)
      setManualKey('')
    } catch (err) {
      setUnlockError(err instanceof ApiError ? err.message : '通信できませんでした。もう一度お試しください')
    } finally {
      setUnlocking(false)
    }
  }

  // 確認済み（タグを読んだ・コードを入力した）で、緊急連絡先が登録されていれば、電話番号を受け取る
  const hasEmergencyContact = !!helpCardProfile?.hasEmergencyContact
  const arrived = myResponder?.status === 'arrived'
  const verified = tagVerified || !!myResponder?.tagVerified
  useEffect(() => {
    if (!alertId || !arrived || !verified || !hasEmergencyContact || contact) return
    fetchEmergencyContact(alertId)
      .then(setContact)
      .catch(() => {})
  }, [alertId, arrived, verified, hasEmergencyContact, contact])

  const categories: ConsiderationCategoryId[] = helpCardProfile?.categories ?? []
  const checklistItems: ChecklistItem[] = CONSIDERATION_CATEGORIES.filter((c) =>
    categories.includes(c.id),
  ).flatMap((cat) =>
    cat.subOptions
      .filter((o) => helpCardProfile?.subOptions?.includes(o.id))
      .map((o) => ({ id: o.id, label: o.label })),
  )

  const isMedical = categories.includes('medical')
  const isMobility = categories.includes('mobility')
  const isAnxiety = categories.includes('anxiety')
  const showStationMapPlaceholder = isMedical || isMobility || isAnxiety
  // 駅の施設データが入っているときは、「未整備」とは言わず、「近く」の一覧を案内する（構内図の画像は出さない）
  const [hasStationData, setHasStationData] = useState(false)
  useEffect(() => {
    if (showStationMapPlaceholder) loadStationFacilities().then((l) => setHasStationData(l.length > 0))
  }, [showStationMapPlaceholder])

  // alert全体が(他の応答者によって)先に完了・取り消しになった：自分はまだ到着後の作業中だった
  // 要請全体が(他の応答者・ビーコナー・時間切れで)先に終了した
  const closedByOthers = !!target && target.status !== 'active'
  const tagRead = verified
  const canComplete = myResponder?.status === 'arrived' && tagRead && !closedByOthers

  function openMapWithFilter() {
    sessionStorage.setItem(NAV_FILTER_KEY, JSON.stringify(target?.considerations ?? []))
    navigate('nearby')
  }

  function isExtraHelpThrottled(type: ExtraHelpTypeId): boolean {
    const last = (target?.extraRequests ?? [])
      .filter((r) => r.type === type)
      .reduce((max, r) => Math.max(max, r.atMs), 0)
    return last > 0 && Date.now() - last < EXTRA_HELP_THROTTLE_MS
  }

  async function handleExtraHelp(type: ExtraHelpTypeId) {
    if (!alertId || isExtraHelpThrottled(type)) return
    try {
      await requestExtraHelp(alertId, type, target?.nickname || 'ヘルプマーク所持者')
      setExtraHelpSent(type)
      setShowExtraHelp(false)
    } catch (err) {
      console.warn('[SupportActive] extra help failed', err)
    }
  }

  function handleComplete() {
    if (!canComplete || !alertId) return
    void completeAlertByResponder(alertId, myProfileId)
    clearResponderState(alertId)
    navigate('home')
  }

  if (closedByOthers && target) {
    const msg = closedMessage(target.status)
    return (
      <div className="support-active support-active--cancelled">
        <p className="support-active__cancelled-title">{msg.title}</p>
        <p className="support-active__cancelled-note">{msg.note}</p>
        <button type="button" className="support-active__complete-btn" onClick={() => navigate('home')}>
          ホームへ戻る
        </button>
      </div>
    )
  }

  return (
    <div className="support-active">
      <header className="support-active__header">
        <h1 className="support-active__title">
          {target ? `${target.nickname}さんの支援中` : '読み込み中…'}
        </h1>
        {target && (
          <button type="button" className="support-active__card-btn" onClick={() => setShowHelpCard(true)}>
            ヘルプカードを表示
          </button>
        )}
      </header>

      {checklistItems.length > 0 && (
        <section className="support-active__section">
          <h2 className="support-active__heading">してほしいこと</h2>
          <ul className="support-active__checklist">
            {checklistItems.map((item) => (
              <li key={item.id}>
                <label className={`support-active__check-item${checked[item.id] ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!checked[item.id]}
                    onChange={() => toggleChecked(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isMedical && (
        <section className="support-active__section support-active__section--urgent">
          <a href="tel:119" className="support-active__call119-btn">
            <Pict name="phone" size={20} /> 119番へ発信
          </a>
          <p className="support-active__hint">その場で安全を確保し、動かさずに待っていてほしい</p>
          {!aed && (
            <div className="support-active__aed">
              <p className="support-active__aed-label"><Pict name="aed" size={16} /> 近くのAED</p>
              <p className="support-active__aed-meta">このアプリのデータには、近くのAEDがありません（一部の地域のデータだけです）</p>
            </div>
          )}
          {aed && (
            <div className="support-active__aed">
              <p className="support-active__aed-label"><Pict name="aed" size={16} /> 近くのAED</p>
              <p className="support-active__aed-name">{aed.n}</p>
              <p className="support-active__aed-meta">
                約{aed.distanceM < 1000 ? `${Math.round(aed.distanceM)}m` : `${(aed.distanceM / 1000).toFixed(1)}km`}
                {aed.w ? ` ・${aed.w}` : ''}
                {aed.f ? ` ／ ${aed.f}` : ''}
              </p>
              <p className="support-active__aed-src">出典：東京都オープンデータカタログ（各区AED設置箇所一覧）</p>
            </div>
          )}
          <a className="support-active__aed-map" href={aedMapUrl(myPos)} target="_blank" rel="noreferrer">
            日本全国AEDマップで、近くのAEDを探す
          </a>
          <p className="support-active__aed-external">{AED_MAP_NOTE}</p>
        </section>
      )}

      {(isMobility || isAnxiety) && (
        <section className="support-active__section">
          {isMobility && (
            <button type="button" className="support-active__map-link-btn" onClick={openMapWithFilter}>
              <Pict name="elevator" size={18} /> エレベーター・スロープを探す
            </button>
          )}
          {isAnxiety && (
            <button type="button" className="support-active__map-link-btn" onClick={openMapWithFilter}>
              <Pict name="pin" size={18} /> 落ち着ける場所を探す
            </button>
          )}
        </section>
      )}

      {showStationMapPlaceholder && (
        <section className="support-active__section">
          <div className="support-active__station-map">
            <p className="support-active__station-map-title"><Pict name="map" size={16} /> 駅構内図</p>
            <p className="support-active__station-map-note">
              {hasStationData
                ? '構内図の画像は表示しません。駅のエレベーター・トイレなどは「近く」の一覧で確認できます'
                : 'データ未整備のためデモ用プレースホルダーです'}
            </p>
          </div>
        </section>
      )}

      {arrived && (
        <section className="support-active__section">
          {tagRead && (
            <p className="support-active__unlock-done">
              ✓ {target?.nickname ?? '相手'}さんのタグを確認しました
            </p>
          )}
          {contact && (
            <a href={`tel:${contact.phone}`} className="support-active__emergency-btn">
              <Pict name="phone" size={18} /> 緊急連絡先{contactLabel(contact)}に電話する
            </a>
          )}
          {!tagRead && (
            <div className="support-active__unlock">
              <p className="support-active__heading">対応を終えるとき</p>
              <p className="support-active__unlock-text">
                {target?.nickname ?? '相手'}さんのヘルプマーク（NFCタグ）にスマホをかざすと、「対応完了」が押せるようになります。
              </p>
              <form
                className="support-active__unlock-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submitCode(manualKey)
                }}
              >
                <label className="support-active__unlock-label">
                  読み取れないときは、本人の画面に出ているコード（数字6桁）を入力
                  <input
                    className="support-active__unlock-input"
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    placeholder="例：123456"
                  />
                </label>
                <button type="submit" className="support-active__unlock-btn" disabled={unlocking || !manualKey.trim()}>
                  確認する
                </button>
              </form>
              {unlockError && <p className="support-active__unlock-error" role="alert">{unlockError}</p>}
            </div>
          )}
        </section>
      )}

      <section className="support-active__section">
        <button type="button" className="support-active__extra-btn" onClick={() => setShowExtraHelp(true)}>
          追加支援を呼ぶ
        </button>
        {extraHelpSent && (
          <p className="support-active__extra-sent">
            送信しました：{EXTRA_HELP_TYPES.find((t) => t.id === extraHelpSent)?.label}
          </p>
        )}
      </section>

      <button
        type="button"
        className="support-active__complete-btn"
        disabled={!canComplete}
        onClick={handleComplete}
      >
        {canComplete ? '対応完了' : '対応完了（相手のタグを読むと押せます）'}
      </button>

      {showHelpCard && (
        <HelpCardModal
          profile={helpCardProfile}
          loading={helpCardLoading}
          onClose={() => setShowHelpCard(false)}
        />
      )}

      {showExtraHelp && (
        <div className="support-active__overlay" role="dialog" aria-modal="true" aria-label="追加支援を呼ぶ">
          <div className="support-active__choice-modal">
            <button
              type="button"
              className="support-active__choice-close"
              onClick={() => setShowExtraHelp(false)}
              aria-label="閉じる"
            >
              ✕
            </button>
            <p className="support-active__choice-title">何が必要ですか？</p>
            {EXTRA_HELP_TYPES.map((t) => {
              const throttled = isExtraHelpThrottled(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  className="support-active__choice-item"
                  disabled={throttled}
                  onClick={() => handleExtraHelp(t.id)}
                >
                  {t.label}
                  {throttled && <span className="support-active__choice-throttled">60秒以内に送信済みです</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
