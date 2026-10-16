import { useEffect, useMemo, useState } from 'react'
import { HelpCardModal } from '../components/HelpCardModal'
import './HelpNavPage.css'
import type { PageName } from '../App'
import {
  distanceMeters,
  bearingDegrees,
  bearingToCompassLabel,
  getCurrentPosition,
  watchPosition,
  type Coords,
} from '../lib/location'
import { subscribeHeading, requestCompassPermission } from '../lib/compass'
import {
  subscribeAlertById,
  subscribeResponder,
  arriveAtResponder,
  leaveResponder,
  closedMessage,
  type ActiveAlert,
  type ResponderEntry,
} from '../lib/alerts'
import { CONSIDERATION_CATEGORIES, getOrCreateProfileId } from '../lib/profile'
import { clearResponderState, getNavigatingAlertId } from '../lib/session'
import { isMedicalConsideration } from '../lib/mapFilter'
import { useResponderLocationSharing } from '../hooks/useResponderLocationSharing'
import { useNearestAed } from '../hooks/useNearestAed'
import { AED_MAP_NOTE, NEAR_AED_MAX_M, aedMapUrl } from '../lib/aedMap'
import { useHelpCard } from '../hooks/useHelpCard'

interface Props {
  navigate: (page: PageName) => void
}

const CATEGORY_LABELS = new Set(CONSIDERATION_CATEGORIES.map((c) => c.label))

function formatDistanceBig(m: number): string {
  if (m < 50) return 'すぐ近く'
  return m < 1000 ? `約${Math.round(m)}m` : `約${(m / 1000).toFixed(1)}km`
}

function formatAedDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
}

export default function HelpNavPage({ navigate }: Props) {
  const [target, setTarget] = useState<ActiveAlert | null>(null)
  const [myResponder, setMyResponder] = useState<ResponderEntry | null>(null)
  const [myPos, setMyPos] = useState<Coords | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [posError, setPosError] = useState(false)
  const [showHelpCard, setShowHelpCard] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [arriveError, setArriveError] = useState(false)

  const [alertId] = useState(getNavigatingAlertId)
  const myProfileId = getOrCreateProfileId()

  // 要請ドキュメントを購読（alert全体の状態：他の応答者による完了・ビーコナーによる取り消し）
  useEffect(() => {
    if (!alertId) return
    return subscribeAlertById(alertId, setTarget)
  }, [alertId])

  // 自分のresponderドキュメントを購読（自分の状態：going/arrived/left）
  useEffect(() => {
    if (!alertId) return
    return subscribeResponder(alertId, myProfileId, setMyResponder)
  }, [alertId, myProfileId])

  // 自分の現在地を継続取得（距離・矢印表示用）。going でなくなったら停止
  useEffect(() => {
    if (myResponder && myResponder.status !== 'going') return
    // まず精度より速さ優先で位置を出し、そのあと高精度の追跡で上書きする（最初の表示までの待ちを短く）
    getCurrentPosition(5000, true)
      .then((p) => setMyPos((prev) => prev ?? p))
      .catch(() => {})
    return watchPosition(
      (c) => {
        setPosError(false)
        setMyPos(c)
      },
      (e) => {
        if (e.denied) setPosError(true)
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
  }, [myResponder?.status])

  // コンパス（許可は「対応します」ボタン押下時に取得済み。iOSで未許可の場合は下のボタンから再取得できる）
  useEffect(() => {
    void requestCompassPermission().then(() => subscribeHeading(setHeading))
  }, [])

  // iOS 13+はrequestPermissionをユーザー操作直後にしか呼べないため、ここではボタンの要否だけ判定する
  const needsCompassPermissionButton =
    typeof window !== 'undefined' &&
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission ===
      'function' &&
    heading == null

  async function handleRequestCompass() {
    const granted = await requestCompassPermission()
    if (granted) subscribeHeading(setHeading)
  }

  const { sharingEnded } = useResponderLocationSharing(
    alertId,
    myProfileId,
    myResponder?.status,
    target?.status,
  )
  const { aed: nearestAed, pos: aedPos, done: aedDone } = useNearestAed()
  // 「最寄りAED」は、近いものだけ。遠いもの（別の区のAEDなど）は、近くとは言えないので、案内しない
  const aed = nearestAed && nearestAed.distanceM <= NEAR_AED_MAX_M ? nearestAed : null
  const { profile: helpCardProfile, loading: helpCardLoading } = useHelpCard(alertId)

  async function handleArrive() {
    if (!alertId) return
    setArriveError(false)
    try {
      await arriveAtResponder(alertId, myProfileId)
    } catch (err) {
      console.warn('[HelpNav] arrive failed', err)
      // 書き込みが失敗した場合は遷移せず、この画面に留めて再試行できるようにする
      // （navigateを無条件に呼ぶと「到着」が反映されないまま到着後画面に進んでしまうため）
      setArriveError(true)
      return
    }
    navigate('help-support')
  }

  async function handleLeave() {
    if (!alertId) return
    try {
      await leaveResponder(alertId, myProfileId)
    } catch (err) {
      console.warn('[HelpNav] leave failed', err)
    }
    clearResponderState(alertId)
    navigate('home')
  }

  const targetCoords =
    target && target.lat != null && target.lng != null
      ? { latitude: target.lat, longitude: target.lng }
      : null

  const dist = myPos && targetCoords ? distanceMeters(myPos, targetCoords) : null
  const bearing = myPos && targetCoords ? bearingDegrees(myPos, targetCoords) : null
  const canShowArrow = bearing != null && heading != null
  const rotation = canShowArrow ? bearing - heading : 0

  const aedBearing = myPos && aed ? bearingDegrees(myPos, { latitude: aed.lat, longitude: aed.lng }) : null

  const chips = useMemo(
    () => (target?.considerations ?? []).filter((label) => !CATEGORY_LABELS.has(label)).slice(0, 2),
    [target?.considerations],
  )
  const isMedical = isMedicalConsideration(target?.considerations ?? [])
  const showAccuracyNote = myPos != null && myPos.accuracy > 50
  const isSharing = myResponder?.status === 'going' && !sharingEnded

  // 要請全体が(他の応答者・ビーコナー・時間切れで)終了した：自分はまだ向かっている途中だった
  if (myResponder?.status === 'going' && target && target.status !== 'active') {
    const msg = closedMessage(target.status)
    return (
      <div className="help-nav help-nav--cancelled">
        <p className="help-nav__cancelled-title">{msg.title}</p>
        <p className="help-nav__cancelled-note">{msg.note}</p>
        <button type="button" className="help-nav__back-btn" onClick={() => navigate('home')}>
          ホームへ戻る
        </button>
      </div>
    )
  }

  return (
    <div className={`help-nav${isSharing ? ' help-nav--sharing' : ''}`}>
      <header className="help-nav__top">
        <span className="help-nav__top-title">
          {target ? `${target.nickname}さんのもとへ` : '読み込み中…'}
        </span>
        {isSharing && <span className="help-nav__badge">位置を共有中</span>}
      </header>

      <div className="help-nav__distance-block">
        {dist != null ? (
          <p className="help-nav__distance-big">{formatDistanceBig(dist)}</p>
        ) : (
          <p className="help-nav__distance-loading">
            {!targetCoords
              ? '相手の位置がまだ届いていません（届きしだい表示します）'
              : posError
                ? 'あなたの位置を取得できません。位置情報の許可を確認してください'
                : 'あなたの位置を取得しています…'}
          </p>
        )}
      </div>

      {needsCompassPermissionButton && (
        <button type="button" className="help-nav__compass-permission-btn" onClick={handleRequestCompass}>
          コンパスの利用を許可する
        </button>
      )}

      <div className="help-nav__compass-block">
        <div className="help-nav__compass" aria-hidden="true">
          {canShowArrow ? (
            <svg viewBox="0 0 200 200" width="100%" height="100%">
              <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '100px 100px', transition: 'transform 0.3s ease-out' }}>
                <path d="M100 24 L134 130 L100 108 L66 130 Z" fill="var(--teal)" />
              </g>
            </svg>
          ) : (
            <div className="help-nav__compass-spinner" />
          )}
        </div>
        {canShowArrow && bearing != null && (
          <p className="help-nav__compass-label">{bearingToCompassLabel(bearing)}</p>
        )}
        {!canShowArrow && bearing != null && (
          // 距離は出せているがコンパス（端末の向き）がまだ取れていない
          <p className="help-nav__compass-label">{bearingToCompassLabel(bearing)}の方向（矢印は向きを確認中）</p>
        )}
      </div>

      <div className="help-nav__considerations-block">
        {chips.length > 0 && (
          <div className="help-nav__considerations" aria-label="希望支援内容（一部）">
            {chips.map((label) => (
              <span key={label} className="help-nav__consideration">
                {label}
              </span>
            ))}
          </div>
        )}
        <button type="button" className="help-nav__card-btn" onClick={() => setShowHelpCard(true)}>
          ヘルプカードを表示
        </button>
      </div>

      {isMedical && (
        <div className="help-nav__warning" role="alert">
          <p className="help-nav__warning-title">安全を確保し、動かさずにお待ちください</p>
          <p className="help-nav__warning-aed">
            {aed
              ? `最寄りAED「${aed.n}」まで約${formatAedDistance(aed.distanceM)}${aedBearing != null ? `・${bearingToCompassLabel(aedBearing)}方向` : ''}`
              : aedDone
                ? 'このアプリのデータには、近くのAEDがありません（一部の地域のデータだけです）'
                : 'AED情報を取得中…'}
          </p>
          {aedDone && (
            <a className="help-nav__warning-aed-link" href={aedMapUrl(myPos ?? aedPos)} target="_blank" rel="noreferrer">
              日本全国AEDマップで、近くのAEDを探す
            </a>
          )}
          {aedDone && (
            <p className="help-nav__warning-aed-external">{AED_MAP_NOTE}</p>
          )}
        </div>
      )}

      {showAccuracyNote && <p className="help-nav__accuracy-note">位置の誤差が大きい場所です</p>}

      {myResponder?.status === 'going' && (
        <div className="help-nav__bottom">
          {arriveError && (
            <p className="help-nav__arrive-error">記録できませんでした。もう一度お試しください</p>
          )}
          <button type="button" className="help-nav__arrive-btn" onClick={handleArrive}>
            到着しました
          </button>
          <button type="button" className="help-nav__leave-btn" onClick={() => setShowLeaveConfirm(true)}>
            対応できなくなりました
          </button>
        </div>
      )}

      {showHelpCard && (
        <HelpCardModal
          profile={helpCardProfile}
          loading={helpCardLoading}
          onClose={() => setShowHelpCard(false)}
        />
      )}

      {showLeaveConfirm && (
        <div className="help-nav__overlay" role="dialog" aria-modal="true" aria-label="対応できなくなりましたか？">
          <div className="help-nav__confirm-modal">
            <p className="help-nav__confirm-title">本当に対応できなくなりましたか？</p>
            <button
              type="button"
              className="help-nav__confirm-continue"
              onClick={() => setShowLeaveConfirm(false)}
            >
              続ける
            </button>
            <button type="button" className="help-nav__confirm-leave" onClick={handleLeave}>
              対応できない
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
