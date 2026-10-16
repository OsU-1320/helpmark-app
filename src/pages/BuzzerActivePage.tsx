import { useEffect } from 'react'
import './BuzzerActivePage.css'
import type { PageName } from '../App'
import { startAlarm, stopAlarm, resumeAlarmContext } from '../lib/alarm'

interface Props {
  navigate: (page: PageName) => void
}

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="white" width="64" height="64" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
)

export default function BuzzerActivePage({ navigate }: Props) {
  useEffect(() => {
    startAlarm()

    // NFC起動はユーザー操作なしで開くため、初回タップで音声を解禁する
    const unlock = () => resumeAlarmContext()
    window.addEventListener('pointerdown', unlock, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlock)
      stopAlarm()
    }
  }, [])

  function handleStop() {
    stopAlarm()
    navigate('home')
  }

  return (
    <div className="buzzer-active">
      <p className="buzzer-active__instruction">
        今すぐ周囲の人に<br />
        助けを求めてください
      </p>

      <div className="buzzer-active__pulse-ring">
        <button
          className="buzzer-active__stop"
          aria-label="ブザーを停止する"
          onClick={handleStop}
        >
          <StopIcon />
          <span className="buzzer-active__stop-label">停止</span>
        </button>
      </div>

      <p className="buzzer-active__sub">ボタンをタップすると止まります</p>
    </div>
  )
}
