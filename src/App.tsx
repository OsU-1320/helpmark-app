import { useEffect, useRef, useState } from 'react'
import HomePage from './pages/HomePage'
import NearbyPage from './pages/NearbyPage'
import ProfileWizard from './pages/ProfileWizard'
import SupporterForm from './pages/SupporterForm'
import MyPage from './pages/MyPage'
import BuzzerActivePage from './pages/BuzzerActivePage'
import CountdownPage from './pages/CountdownPage'
import HelpNavPage from './pages/HelpNavPage'
import SupportActivePage from './pages/SupportActivePage'
import SupportWaitPage from './pages/SupportWaitPage'
import ResponderStatusBar from './components/ResponderStatusBar'
import { startAlarm, stopAlarm } from './lib/alarm'
import { isLegacyNfcLaunch, isNfcLaunch } from './lib/nfc'
import { findResumePage } from './lib/resume'
import { prepareMessagingWorker } from './lib/push'
import { DEVICE_REVOKED_EVENT } from './lib/api'
import { getDemoLocation, stopDemoLocation } from './lib/location'
import { getProfileRoles, loadProfile } from './lib/profile'

export type PageName =
  | 'home'
  | 'my-page'
  | 'help-wizard'
  | 'supporter-form'
  | 'nearby'
  | 'buzzer-active'
  | 'countdown'
  | 'help-nav'
  | 'help-support'
  | 'wait-support'

export interface AlarmState {
  alarmActive: boolean
  toggleAlarm: () => void
}

export interface NavProps extends AlarmState {
  navigate: (page: PageName) => void
  currentPage: PageName
}

export default function App() {
  // NFCタグ（?src=nfc）経由の起動ならカウントダウン（自動送信）ページからスタート
  const [page, setPage] = useState<PageName>(isNfcLaunch() ? 'countdown' : 'home')
  const [alarmActive, setAlarmActive] = useState(false)
  const userNavigatedRef = useRef(false)
  // 古い形式のタグ（?n=… など）で開かれたときは、書き直しを案内する
  const [legacyTag, setLegacyTag] = useState(isLegacyNfcLaunch)
  // デモ用の位置（?loc=tokyo）を使っているあいだは、本物の位置と取り違えないよう、必ず表示する
  const [demoLoc] = useState(getDemoLocation)
  // この端末の登録が、別の端末に引き継がれたとき
  const [revoked, setRevoked] = useState(false)
  useEffect(() => {
    const onRevoked = () => setRevoked(true)
    window.addEventListener(DEVICE_REVOKED_EVENT, onRevoked)
    return () => window.removeEventListener(DEVICE_REVOKED_EVENT, onRevoked)
  }, [])

  // 開き直したとき、進行中の要請・対応があればその画面へ戻す（利用者が先に画面を移動していれば何もしない）
  useEffect(() => {
    // パートナーは通知用SWを起動時に用意しておく（再設定のときに待たずに済む）
    if (getProfileRoles(loadProfile()).isSupporter) prepareMessagingWorker()
    if (isNfcLaunch()) return
    void findResumePage().then((resume) => {
      if (resume && !userNavigatedRef.current) setPage(resume)
    })
  }, [])

  function navigate(next: PageName) {
    userNavigatedRef.current = true
    setPage(next)
  }

  function toggleAlarm() {
    if (alarmActive) {
      stopAlarm()
      setAlarmActive(false)
    } else {
      startAlarm()
      setAlarmActive(true)
    }
  }

  const nav: NavProps = { navigate, currentPage: page, alarmActive, toggleAlarm }

  return (
    <>
      {demoLoc && (
        <div className="demo-loc-notice" role="status">
          <p>デモ用の位置（{demoLoc.name}）を使っています。実際の現在地ではありません</p>
          <button type="button" onClick={stopDemoLocation}>やめる</button>
        </div>
      )}
      {revoked && (
        <div className="legacy-tag-notice" role="alert">
          <p>この端末は、別の端末に引き継がれたため、使えなくなりました。この端末でもう一度使うには、アプリを削除して入れ直し、新しい端末のマイページにある「引き継ぎコード」で、引き継いでください。</p>
        </div>
      )}
      {legacyTag && (
        <div className="legacy-tag-notice" role="alert">
          <p>このNFCタグは、古い形式のため使えません。持ち主の方は、マイページで新しいタグ用URLを確認して、タグに書き直してください。</p>
          <button type="button" onClick={() => setLegacyTag(false)}>閉じる</button>
        </div>
      )}
      <ResponderStatusBar navigate={navigate} currentPage={page} />
      {renderPage(page, nav)}
    </>
  )
}

function renderPage(page: PageName, nav: NavProps) {
  const { navigate } = nav
  switch (page) {
    case 'home':
      return <HomePage {...nav} />
    case 'my-page':
      return <MyPage {...nav} />
    case 'help-wizard':
      return <ProfileWizard onBack={() => navigate('my-page')} onSaved={() => navigate('my-page')} />
    case 'supporter-form':
      return <SupporterForm onBack={() => navigate('my-page')} onSaved={() => navigate('home')} />
    case 'nearby':
      return <NearbyPage {...nav} />
    case 'buzzer-active':
      return <BuzzerActivePage navigate={navigate} />
    case 'countdown':
      return <CountdownPage navigate={navigate} />
    case 'help-nav':
      return <HelpNavPage navigate={navigate} />
    case 'help-support':
      return <SupportActivePage navigate={navigate} />
    case 'wait-support':
      return <SupportWaitPage navigate={navigate} />
    default:
      return <HomePage {...nav} />
  }
}
