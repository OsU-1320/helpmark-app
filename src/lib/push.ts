import { getMessaging, getToken, isSupported } from '@firebase/messaging'
import { app, isFirebaseConfigured } from './firebase'
import { loadProfile } from './profile'
import { saveSupporterToken } from './supporters'

/**
 * 通知受信用SWの登録範囲。PWAのSW（/sw.js・範囲 /）と同じ範囲に置くと、
 * アプリ更新のたびにどちらかが上書きされ、通知先の取得や表示に失敗するため分ける。
 * （プッシュは購読を持つSWに届くので、範囲が画面と違っても受信できる）
 */
const PUSH_SW_SCOPE = '/firebase-cloud-messaging-push-scope'

async function waitUntilActive(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.active) return
  const sw = reg.installing ?? reg.waiting
  if (!sw) return
  await new Promise<void>((resolve) => {
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated') resolve()
    })
  })
}

const PUSH_SW_URL = '/firebase-messaging-sw.js'

/**
 * 通知用SWを先に登録しておく（通知の許可は求めない）。
 * 登録ボタンを押してからSWのインストールを待つ時間を省き、登録完了までを短くする。
 */
export function prepareMessagingWorker(): void {
  if (!isFirebaseConfigured || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE }).catch(() => {})
}

/** 通知の許可を求め、FCMトークンを取得する */
export async function requestPushSubscription(): Promise<string> {
  if (!isFirebaseConfigured || !app) throw new Error('通知の設定が見つかりません（Firebase未設定）')
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('この画面では通知を受け取れません。ホーム画面に追加したアイコンから開いてください')
  }
  if (!(await isSupported())) throw new Error('この端末・ブラウザは通知に対応していません')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('通知が許可されていません。設定アプリで通知を許可してください')

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) throw new Error('通知の設定が見つかりません（VAPIDキー未設定）')

  const registration = await navigator.serviceWorker.register(PUSH_SW_URL, { scope: PUSH_SW_SCOPE })
  await waitUntilActive(registration)
  return await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration })
}

/** パートナーとして通知を受け取れるようにする（通知先をサーバーへ登録）。失敗時は理由つきで例外 */
export async function registerPushForPartner(): Promise<void> {
  const token = await requestPushSubscription()
  await saveSupporterToken({ token, nickname: loadProfile()?.nickname ?? '' })
}
