import './BottomNav.css'
import type { NavProps } from '../App'

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26" aria-hidden="true">
    <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v1h20v-1c0-3.33-6.67-5-10-5z" />
  </svg>
)

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" aria-hidden="true">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
)

const MapPinIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="26" height="26" aria-hidden="true">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
)

export default function BottomNav({ navigate, currentPage, alarmActive }: NavProps) {
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <button
        className={`bottom-nav__item${currentPage === 'my-page' ? ' is-active' : ''}`}
        onClick={() => navigate('my-page')}
        aria-label="マイページ"
        aria-current={currentPage === 'my-page' ? 'page' : undefined}
      >
        <span className="bottom-nav__icon-wrap"><PersonIcon /></span>
        <span>マイページ</span>
      </button>

      {/* ナビ中央ボタン：ホームへ戻るのみ。アラームのON/OFFはホーム画面の大ボタン専用 */}
      <button
        className="bottom-nav__item bottom-nav__item--buzzer"
        onClick={() => navigate('home')}
        aria-label={alarmActive ? 'ブザー鳴動中 – ホームへ戻って停止' : 'ホーム（緊急ブザー）'}
      >
        <span className={`bottom-nav__buzzer-circle${currentPage === 'home' ? ' is-home' : ''}`}>
          <HeartIcon />
        </span>
        <span>助けるブザー</span>
      </button>

      <button
        className={`bottom-nav__item${currentPage === 'nearby' ? ' is-active' : ''}`}
        onClick={() => navigate('nearby')}
        aria-label="近くの施設"
        aria-current={currentPage === 'nearby' ? 'page' : undefined}
      >
        <span className="bottom-nav__icon-wrap"><MapPinIcon /></span>
        <span>近く</span>
      </button>
    </nav>
  )
}
