import { useEffect, useState } from 'react'
import './ActiveAlertCard.css'
import type { ActiveAlert } from '../lib/alerts'
import { formatElapsed, formatSentTime } from '../lib/time'

interface Props {
  alert: ActiveAlert
  /** 自分がすでに別の要請に対応中で、この要請には対応できない場合 */
  busyElsewhere: boolean
  /** 「対応します」タップ中（連打防止用） */
  responding: boolean
  onRespond: (alert: ActiveAlert) => void
}

/** 支援要請1件分のカード。応答者数・経過時間・自分の応答状況を表示する */
export default function ActiveAlertCard({ alert, busyElsewhere, responding, onRespond }: Props) {
  const [, setTick] = useState(0)

  // 経過時間表示を定期的に更新する
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // 人数と自分の応答有無は一覧APIが返す（他の応答者の名前や位置はパートナーには渡さない）
  const iResponded = !!alert.iResponded
  const otherCount = (alert.activeResponderCount ?? 0) - (iResponded ? 1 : 0)

  return (
    <div className="active-alert-card">
      <div className="active-alert-card__row">
        <p className="active-alert-card__name">{alert.nickname}さんが助けを求めています</p>
      </div>
      <p className="active-alert-card__time">
        {formatSentTime(alert.createdAtMs)}送信・{formatElapsed(alert.createdAtMs)}
      </p>
      {otherCount > 0 && (
        <p className="active-alert-card__others">ほかに{otherCount}人が対応中</p>
      )}

      {iResponded ? (
        <p className="active-alert-card__responded">✓ 対応中です</p>
      ) : (
        <>
          <button
            type="button"
            className="active-alert-card__respond-btn"
            disabled={busyElsewhere || responding}
            onClick={() => onRespond(alert)}
          >
            対応します
          </button>
          {busyElsewhere ? (
            <p className="active-alert-card__reason">すでに別の要請に対応中のため対応できません</p>
          ) : (
            <p className="active-alert-card__consent">
              押すと、到着するまで位置が相手におおまかに共有されます
            </p>
          )}
        </>
      )}
    </div>
  )
}
