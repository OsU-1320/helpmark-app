/* ヘルプマークNET — 通知受信用Service Worker
 * Firebase SDK に頼らず Web Push の生イベントを処理する。
 * （iOSではSDK経由だとフォアグラウンド中の表示が落ちるため）
 * アプリを開いていても・閉じていても、必ずOS通知を出す。 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let title = '支援要請'
  let body = ''
  try {
    const payload = event.data ? event.data.json() : {}
    if (payload.notification) {
      title = payload.notification.title || title
      body = payload.notification.body || body
    }
  } catch (_) {
    /* JSONでない場合はテキストとして扱う */
    if (event.data) body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: 'helpmark-alert',
      renotify: true,
      requireInteraction: true,
      data: {},
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    }),
  )
})
