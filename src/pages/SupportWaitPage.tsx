import { useEffect, useRef, useState } from 'react'
import { Pict } from '../components/Pictogram'
import {
  IllustSending,
  IllustStaff,
  IllustTogether,
  IllustWalking,
} from '../components/SupportIllustrations'
import './SupportWaitPage.css'
import type { PageName } from '../App'
import {
  subscribeAlertById,
  subscribeAlertView,
  renewAlertCode,
  subscribeResponders,
  cancelAlert,
  updateRequesterLocation,
  NO_RESPONSE_TIMEOUT_MS,
  type ActiveAlert,
  type ResponderEntry,
} from '../lib/alerts'
import { getMyAlertId, setMyAlertId } from '../lib/session'
import { getCurrentPosition, bearingDegrees, bearingToCompass8, bearingToCompassLabel, distanceMeters } from '../lib/location'

interface Props {
  navigate: (page: PageName) => void
}

type Stage = 'notified' | 'coming' | 'arrived'

const STEPS: Array<{ id: Stage; label: string }> = [
  { id: 'notified', label: '知らせた' },
  { id: 'coming', label: '向かっている' },
  { id: 'arrived', label: '到着' },
]

/** 距離を50m単位に丸めて表示（50m未満は「すぐ近く」・厳密な座標は出さない） */
function formatBeaconDistance(m: number): string {
  if (m < 50) return 'すぐ近く'
  return `約${Math.round(m / 50) * 50}m`
}

function responderLine(r: ResponderEntry): string {
  if (r.status === 'completed') return `${r.nickname}さんが対応完了しました`
  if (r.status === 'arrived') return `${r.nickname}さんが到着しました`
  if (r.status === 'left') return `${r.nickname}さんは対応できなくなりました`
  return `${r.nickname}さんが対応します`
}

const STALE_LOCATION_MS = 60 * 1000

export default function SupportWaitPage({ navigate }: Props) {
  const [myAlert, setMyAlert] = useState<ActiveAlert | null>(null)
  const [responders, setResponders] = useState<ResponderEntry[]>([])
  const [showNoResponseHelp, setShowNoResponseHelp] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [justCancelled, setJustCancelled] = useState(false)
  const [extraHelpNotice, setExtraHelpNotice] = useState(false)
  const prevExtraCountRef = useRef(0)
  const vibratedArrivalsRef = useRef<Set<string>>(new Set())

  const [myAlertId] = useState(getMyAlertId)

  useEffect(() => {
    if (!myAlertId) return
    return subscribeAlertById(myAlertId, setMyAlert)
  }, [myAlertId])

  useEffect(() => {
    if (!myAlertId) return
    return subscribeResponders(myAlertId, setResponders)
  }, [myAlertId])

  // 確認コード（要請ごと・数字6桁）。到着したパートナーがタグを読み取れないときに、この数字を伝える
  const [code, setCode] = useState<string | null>(null)
  const [renewing, setRenewing] = useState(false)
  useEffect(() => {
    if (!myAlertId) return
    return subscribeAlertView(myAlertId, (v) => setCode(v?.code ?? null))
  }, [myAlertId])

  const activeResponders = responders.filter((r) => r.status !== 'left')

  // 要請に本人の位置が入っていない（送信時に位置の許可を待っていた等）なら、1回だけ取得して届ける。
  // 位置が無いとパートナーの画面で距離・方角が出せないため
  const locationFilledRef = useRef(false)
  useEffect(() => {
    if (!myAlertId || !myAlert || myAlert.status !== 'active' || myAlert.lat != null || locationFilledRef.current) return
    locationFilledRef.current = true
    getCurrentPosition(15000)
      .then((c) => updateRequesterLocation(myAlertId, c))
      .catch(() => {
        locationFilledRef.current = false
      })
  }, [myAlertId, myAlert])

  // 完了・取り消しになった要請は端末から消す（次の要請を送れるように）
  useEffect(() => {
    if (myAlert && myAlert.status !== 'active') setMyAlertId(null)
  }, [myAlert])

  // 応答者0人のまま3分経過したら、「見つからないとき」のカードを強調する（カード自体は最初から表示）
  useEffect(() => {
    if (!myAlert || myAlert.status !== 'active' || activeResponders.length > 0) {
      setShowNoResponseHelp(false)
      return
    }
    const elapsed = Date.now() - myAlert.createdAtMs
    if (elapsed >= NO_RESPONSE_TIMEOUT_MS) {
      setShowNoResponseHelp(true)
      return
    }
    const t = setTimeout(() => setShowNoResponseHelp(true), NO_RESPONSE_TIMEOUT_MS - elapsed)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myAlert?.status, myAlert?.createdAtMs, activeResponders.length])

  // 応答者が「到着しました」に変わった瞬間だけ振動で知らせる（1人につき1回）
  useEffect(() => {
    for (const r of activeResponders) {
      if (r.status !== 'arrived' && r.status !== 'completed') continue
      if (vibratedArrivalsRef.current.has(r.id)) continue
      vibratedArrivalsRef.current.add(r.id)
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(200)
        } catch {
          /* 未対応・失敗時は何もしない */
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responders])

  // 追加支援の依頼が増えたら、種類は伏せて一時的にバナー表示する
  useEffect(() => {
    const count = myAlert?.extraRequests?.length ?? 0
    if (count > prevExtraCountRef.current) {
      setExtraHelpNotice(true)
      const t = setTimeout(() => setExtraHelpNotice(false), 6000)
      prevExtraCountRef.current = count
      return () => clearTimeout(t)
    }
    prevExtraCountRef.current = count
  }, [myAlert?.extraRequests?.length])

  async function handleCancelConfirmed() {
    setShowCancelConfirm(false)
    setCancelling(true)
    try {
      if (myAlertId) await cancelAlert(myAlertId)
    } catch (err) {
      console.error('[SupportWait] cancel failed', err)
    } finally {
      setCancelling(false)
    }
    setMyAlertId(null)
    setJustCancelled(true)
    setTimeout(() => {
      setJustCancelled(false)
      navigate('home')
    }, 2500)
  }

  const isActive = myAlert?.status === 'active'
  const stage: Stage = activeResponders.some((r) => r.status === 'arrived')
    ? 'arrived'
    : activeResponders.some((r) => r.status === 'going')
      ? 'coming'
      : 'notified'
  const stageIndex = STEPS.findIndex((s) => s.id === stage)

  // 距離・方角は「まだ向かっている(going)」応答者のうち最も近い1人のみ表示する
  const going = activeResponders.filter((r) => r.status === 'going' && r.lat != null && r.lng != null)
  const nearest =
    myAlert?.lat != null && myAlert?.lng != null && going.length > 0
      ? going.reduce((best, r) => {
          const d = distanceMeters({ latitude: myAlert.lat!, longitude: myAlert.lng! }, { latitude: r.lat!, longitude: r.lng! })
          return !best || d < best.d ? { r, d } : best
        }, null as { r: ResponderEntry; d: number } | null)
      : null
  const nearestStale =
    nearest != null &&
    (nearest.r.locationUpdatedAt == null || Date.now() - nearest.r.locationUpdatedAt > STALE_LOCATION_MS)
  const nearestBearing =
    nearest && myAlert?.lat != null && myAlert?.lng != null
      ? bearingDegrees({ latitude: myAlert.lat, longitude: myAlert.lng }, { latitude: nearest.r.lat!, longitude: nearest.r.lng! })
      : null

  return (
    <div className="support-wait">
      <header className="support-wait__header">
        <h1 className="support-wait__title">支援の状況</h1>
        <button type="button" className="support-wait__back" onClick={() => navigate('home')}>
          ホームへ
        </button>
      </header>

      <main className="support-wait__main">
        {!myAlert && !justCancelled && (
          <p className="support-wait__empty">現在、進行中の支援要請はありません</p>
        )}

        {isActive && (
          <>
            <ol className="support-wait__steps" aria-label="支援の進み具合">
              {STEPS.map((s, i) => (
                <li
                  key={s.id}
                  className={`support-wait__step${i < stageIndex ? ' is-done' : ''}${i === stageIndex ? ' is-current' : ''}`}
                  aria-current={i === stageIndex ? 'step' : undefined}
                >
                  <span className="support-wait__step-dot" aria-hidden="true">
                    {i < stageIndex ? '✓' : i + 1}
                  </span>
                  <span className="support-wait__step-label">{s.label}</span>
                </li>
              ))}
            </ol>

            <section className="support-wait__hero" aria-live="polite">
              {stage === 'notified' && (
                <>
                  <IllustSending size={150} className="support-wait__illust" />
                  <p className="support-wait__hero-title">登録しているパートナーに知らせました</p>
                  <p className="support-wait__hero-sub">
                    応答を待っています。
                    <br />
                    この画面のままで大丈夫です
                  </p>
                </>
              )}
              {stage === 'coming' && (
                <>
                  <IllustWalking size={150} className="support-wait__illust" />
                  <p className="support-wait__hero-title">パートナーが向かっています</p>
                  {nearest &&
                    (nearestStale ? (
                      <p className="support-wait__waiting">
                        位置を確認中（最終更新
                        {nearest.r.locationUpdatedAt
                          ? `${Math.max(1, Math.round((Date.now() - nearest.r.locationUpdatedAt) / 60000))}分前`
                          : '不明'}
                        ）
                      </p>
                    ) : (
                      nearestBearing != null && (
                        <div className="support-wait__direction">
                          <span
                            className="support-wait__arrow"
                            aria-hidden="true"
                            style={{ transform: `rotate(${bearingToCompass8(nearestBearing)}deg)` }}
                          >
                            ↑
                          </span>
                          <div>
                            <p className="support-wait__distance">{formatBeaconDistance(nearest.d)}</p>
                            <p className="support-wait__compass-label">
                              {bearingToCompassLabel(nearestBearing)}の方角から
                            </p>
                          </div>
                        </div>
                      )
                    ))}
                  <p className="support-wait__hero-sub">到着したら、この画面でお知らせします</p>
                </>
              )}
              {stage === 'arrived' && (
                <>
                  <IllustTogether size={150} className="support-wait__illust" />
                  <p className="support-wait__hero-title">パートナーが到着しました</p>
                  <p className="support-wait__hero-sub">困っていることを伝えてください</p>
                  {code && (
                    <div className="support-wait__key">
                      <p className="support-wait__key-label">確認コード</p>
                      <p className="support-wait__key-value">{code}</p>
                      <p className="support-wait__key-note">
                        パートナーがタグを読み取れないときは、この数字を伝えてください
                      </p>
                      <button
                        type="button"
                        className="support-wait__key-renew"
                        disabled={renewing}
                        onClick={() => {
                          if (!myAlertId) return
                          setRenewing(true)
                          renewAlertCode(myAlertId)
                            .then(setCode)
                            .catch(() => {})
                            .finally(() => setRenewing(false))
                        }}
                      >
                        {renewing ? '作り直しています…' : '知らない人に聞かれたときは、新しいコードにする'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {activeResponders.length > 0 && (
                <ul className="support-wait__timeline">
                  {activeResponders.map((r) => (
                    <li key={r.id} className={`support-wait__timeline-item is-${r.status}`}>
                      <Pict name="pin" size={14} /> {responderLine(r)}
                    </li>
                  ))}
                </ul>
              )}
              {extraHelpNotice && (
                <p className="support-wait__extra-notice">追加の支援を呼んでいます</p>
              )}
            </section>

            {stage === 'notified' && (
              <>
                <p className="support-wait__next-label">このあとの流れ</p>
                <section className="support-wait__branch">
                  <p className="support-wait__branch-title">パートナーが見つかったら</p>
                  <div className="support-wait__branch-row">
                    <IllustWalking size={64} className="support-wait__branch-illust" />
                    <p className="support-wait__branch-text">向かってくる方角と距離が、この画面に出ます</p>
                  </div>
                  <div className="support-wait__branch-row">
                    <IllustTogether size={64} className="support-wait__branch-illust" />
                    <p className="support-wait__branch-text">到着したら、振動とこの画面でお知らせします</p>
                  </div>
                </section>

                <section className={`support-wait__branch support-wait__branch--fallback${showNoResponseHelp ? ' is-now' : ''}`}>
                  <p className="support-wait__branch-title">
                    {showNoResponseHelp ? 'まだ見つかっていません' : '3分たっても見つからないとき'}
                  </p>
                  <div className="support-wait__branch-row">
                    <IllustStaff size={64} className="support-wait__branch-illust" />
                    <p className="support-wait__branch-text">近くの駅員や、周りの人に直接声をかけてください</p>
                  </div>
                  <a href="tel:119" className="support-wait__call-btn">
                    <Pict name="phone" size={18} /> 119番に電話する
                  </a>
                </section>
              </>
            )}
          </>
        )}

        {myAlert?.status === 'completed' && (
          <section className="support-wait__hero" aria-live="polite">
            <IllustTogether size={150} className="support-wait__illust" />
            <p className="support-wait__hero-title">対応が完了しました</p>
          </section>
        )}

        {myAlert?.status === 'expired' && (
          <section className="support-wait__hero" aria-live="polite">
            <p className="support-wait__hero-title">この支援要請は終了しました</p>
            <p className="support-wait__hero-sub">
              送信から1時間が過ぎたため、自動で終了しました。
              <br />
              まだ助けが必要なときは、もう一度要請してください
            </p>
            <button type="button" className="support-wait__complete-btn" onClick={() => navigate('countdown')}>
              もう一度支援を要請する
            </button>
          </section>
        )}

        {justCancelled && (
          <section className="support-wait__hero" aria-live="polite">
            <p className="support-wait__hero-title">取り消しました</p>
          </section>
        )}

        {isActive && (
          <div className="support-wait__cancel">
            <button
              type="button"
              className="support-wait__cancel-btn"
              disabled={cancelling}
              onClick={() => setShowCancelConfirm(true)}
            >
              もう大丈夫です
            </button>
            <p className="support-wait__cancel-note">支援要請が取り消されます</p>
          </div>
        )}
      </main>

      {showCancelConfirm && (
        <div className="support-wait__overlay" role="dialog" aria-modal="true" aria-label="取り消しますか？">
          <div className="support-wait__confirm-modal">
            <p className="support-wait__confirm-title">取り消しますか？</p>
            <button
              type="button"
              className="support-wait__confirm-continue"
              onClick={() => setShowCancelConfirm(false)}
            >
              取り消さない
            </button>
            <button
              type="button"
              className="support-wait__confirm-cancel"
              onClick={handleCancelConfirmed}
            >
              取り消す
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
