import './HomePage.css'
import { useEffect, useState } from 'react'
import BottomNav from '../components/BottomNav'
import ActiveAlertCard from '../components/ActiveAlertCard'
import PushSetupNotice from '../components/PushSetupNotice'
import type { NavProps } from '../App'
import { getOrCreateProfileId, getProfileRoles, loadProfile } from '../lib/profile'
import {
  subscribeActiveAlerts,
  subscribeAlertById,
  respondToAlert,
  type ActiveAlert,
} from '../lib/alerts'
import { requestCompassPermission } from '../lib/compass'
import { getMyAlertId, getNavigatingAlertId, setNavigatingAlertId } from '../lib/session'
import { getCurrentPosition } from '../lib/location'

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="white" width="88" height="88" aria-hidden="true">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
)

export default function HomePage({ navigate, currentPage, alarmActive, toggleAlarm }: NavProps) {
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([])
  const [myAlert, setMyAlert] = useState<ActiveAlert | null>(null)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  // undefined = 確認中、false = サーバーに通知先が無い（支援要請を受け取れない）
  const [pushRegistered, setPushRegistered] = useState<boolean | undefined>(undefined)
  const [listKey, setListKey] = useState(0)

  const profile = loadProfile()
  const { isUser: isRegisteredUser, isSupporter } = getProfileRoles(profile)
  const myProfileId = getOrCreateProfileId()
  const myAlertId = getMyAlertId()
  // 自分がすでに対応中の要請（同時に対応できる要請は1件のみ）
  const myRespondingAlertId = getNavigatingAlertId()

  // 直近1時間の未完了の支援要請一覧を購読（パートナー登録済みの端末のみ）
  useEffect(() => {
    return subscribeActiveAlerts(myProfileId, (alerts, registered) => {
      setActiveAlerts(alerts)
      setPushRegistered(registered)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey])

  // 自分が送信した要請を購読（「支援を要請中」バナー表示用）
  useEffect(() => {
    if (!myAlertId) return
    return subscribeAlertById(myAlertId, setMyAlert)
  }, [myAlertId])

  async function handleRespond(alert: ActiveAlert) {
    if (myRespondingAlertId || respondingId) return
    setRespondingId(alert.id)
    // iOSのコンパス許可はユーザー操作直後しか要求できないため、awaitの前に呼ぶ
    await requestCompassPermission()
    try {
      // 対応時点で一度だけ位置情報を取得（被支援者画面の方角矢印に使う）
      let helperCoords: { latitude: number; longitude: number } | null = null
      try {
        const pos = await getCurrentPosition(5000)
        helperCoords = { latitude: pos.latitude, longitude: pos.longitude }
      } catch {
        /* 位置なしで続行 */
      }
      const myName = loadProfile()?.nickname || 'パートナー'
      await respondToAlert(alert.id, myName, helperCoords)
      setNavigatingAlertId(alert.id)
      navigate('help-nav')
    } catch (err) {
      console.error('[HomePage] respond failed', err)
    } finally {
      setRespondingId(null)
    }
  }

  const requestingHelp = myAlert?.status === 'active'

  return (
    <div className="home-page">
      <header className="home-page__header">
        <img className="home-page__logo-mark" src="/icons/icon-192.png" alt="" width="32" height="32" />
        <span className="home-page__logo-text">ヘルプマークNET</span>
      </header>

      {/* 自分の要請が応答待ち・対応中の間、常に表示するバナー。タップで支援待ち画面に戻れる */}
      {requestingHelp && (
        <button type="button" className="home-page__requesting-banner" onClick={() => navigate('wait-support')}>
          支援を要請中 ・ タップで状況を見る
        </button>
      )}

      <main className="home-page__main">
        <p className="home-page__label">
          {alarmActive ? 'ブザー鳴動中' : '緊急・助けを呼ぶ'}
        </p>

        <button
          className={`home-page__buzzer${alarmActive ? ' is-active' : ''}`}
          aria-label={alarmActive ? 'ブザーを停止する' : '緊急ブザーを鳴らす'}
          onClick={toggleAlarm}
        >
          {alarmActive
            ? <span className="home-page__stop-label">停止</span>
            : <HeartIcon />
          }
        </button>

        <p className="home-page__note">
          {alarmActive ? 'もう一度タップすると止まります' : '※大きな音が鳴ります'}
        </p>

        {/* 要支援者登録済みの場合：支援要請ボタン */}
        {isRegisteredUser && (
          <button
            type="button"
            className="home-page__sos-btn"
            onClick={() => navigate('countdown')}
          >
            今すぐ支援を要請する
          </button>
        )}

        {/* パートナー向け：現在進行中の支援要請一覧（完了・取り消しのみ一覧から外れる） */}
        {isSupporter && pushRegistered === false && (
          <PushSetupNotice onRegistered={() => setListKey((k) => k + 1)} />
        )}
        {isSupporter && pushRegistered && activeAlerts.length === 0 && (
          <p className="home-page__no-alerts">現在、支援要請はありません</p>
        )}
        {activeAlerts.map((alert) => (
          <ActiveAlertCard
            key={alert.id}
            alert={alert}
            busyElsewhere={!!myRespondingAlertId && myRespondingAlertId !== alert.id}
            responding={respondingId === alert.id}
            onRespond={handleRespond}
          />
        ))}
      </main>

      <BottomNav navigate={navigate} currentPage={currentPage} alarmActive={alarmActive} toggleAlarm={toggleAlarm} />
    </div>
  )
}
