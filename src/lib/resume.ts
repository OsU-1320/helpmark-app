import type { PageName } from '../App'
import { ApiError } from './api'
import { getAlertView, type AlertView } from './alerts'
import { fetchMe, loadProfile } from './profile'
import { clearResponderState, getMyAlertId, getNavigatingAlertId, setMyAlertId } from './session'

/** 要請を確認する。見られない（終了・権限なし）なら 'gone'、通信できなければ 'offline' */
async function check(alertId: string): Promise<AlertView | 'gone' | 'offline'> {
  try {
    return await getAlertView(alertId)
  } catch (err) {
    return err instanceof ApiError && (err.status === 403 || err.status === 404) ? 'gone' : 'offline'
  }
}

/**
 * アプリを開き直したときに、進行中の対応・要請の画面へ戻す。
 * 端末に残した要請IDをサーバーで確かめ、終わっていれば端末から消す（通信できないときは消さない）。
 * 端末に何も残っていなくても（別のブラウザで開いた等）、自分の要請はサーバーから探す。
 */
export async function findResumePage(): Promise<PageName | null> {
  const navId = getNavigatingAlertId()
  if (navId) {
    const r = await check(navId)
    if (r === 'offline') return null
    const status = r !== 'gone' && r.alert.status === 'active' ? r.myResponder?.status : undefined
    if (status === 'going') return 'help-nav'
    if (status === 'arrived') return 'help-support'
    clearResponderState(navId)
  }

  const myId = getMyAlertId()
  if (myId) {
    const r = await check(myId)
    if (r === 'offline') return null
    if (r !== 'gone' && r.role === 'owner' && r.alert.status === 'active') return 'wait-support'
    setMyAlertId(null)
  }

  if (!loadProfile()) return null
  const me = await fetchMe().catch(() => null)
  if (me?.activeAlertId) {
    setMyAlertId(me.activeAlertId)
    return 'wait-support'
  }
  return null
}
