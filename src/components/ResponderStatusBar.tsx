import { useEffect, useState } from 'react'
import './ResponderStatusBar.css'
import type { PageName } from '../App'
import { subscribeAlertView, type AlertView } from '../lib/alerts'
import { clearResponderState, getNavigatingAlertId } from '../lib/session'

interface Props {
  navigate: (page: PageName) => void
  currentPage: PageName
}

/**
 * 自分が対応中(going/arrived)の要請がある間、どの画面にいても表示する固定バナーと外縁の枠線。
 * 完了・取り消し・離脱（自分のresponderがgoing/arrivedでなくなる）のいずれでも両方消える。
 * コンパス画面・到着後画面自体では、そちらのローカルな表示と二重になるため出さない。
 */
export default function ResponderStatusBar({ navigate, currentPage }: Props) {
  // undefined = 読み込み中、null = 見る権限が無い（対応が終わった等）
  const [view, setView] = useState<AlertView | null | undefined>(undefined)
  const alertId = getNavigatingAlertId()

  useEffect(() => {
    setView(undefined)
    if (!alertId) return
    return subscribeAlertView(alertId, setView)
  }, [alertId])

  const target = view?.alert
  const myResponder = view?.myResponder
  const isActive =
    !!alertId &&
    (myResponder?.status === 'going' || myResponder?.status === 'arrived') &&
    target?.status === 'active'

  // 完了・取り消し・離脱、または要請が見られなくなったら、対応中の情報を端末から消す
  useEffect(() => {
    if (!alertId || view === undefined) return
    const finished =
      view === null ||
      view.alert.status !== 'active' ||
      (myResponder != null && myResponder.status !== 'going' && myResponder.status !== 'arrived')
    if (finished) clearResponderState(alertId)
  }, [alertId, view, myResponder])

  const onOwnScreen = currentPage === 'help-nav' || currentPage === 'help-support'
  if (!isActive || onOwnScreen) return null

  const name = target?.nickname || '支援を求めている方'

  return (
    <>
      <div className="responder-status-border" aria-hidden="true" />
      <button
        type="button"
        className="responder-status-banner"
        onClick={() => navigate(myResponder?.status === 'arrived' ? 'help-support' : 'help-nav')}
      >
        {name}さんに対応中です
      </button>
    </>
  )
}
