/**
 * Google API 呼び出し（サービスアカウントJWT → OAuthアクセストークン、FCM HTTP v1 送信）。
 * Firestore と FCM の両方で同じトークンを使う。
 */

export interface GoogleEnv {
  FCM_PROJECT_ID: string
  GOOGLE_CLIENT_EMAIL?: string
  GOOGLE_PRIVATE_KEY?: string
}

let cachedToken: { token: string; expiresAt: number } | null = null

function base64UrlFromJson(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDerBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, '\n').replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(normalized)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

export function hasServiceAccount(env: GoogleEnv): boolean {
  return !!env.GOOGLE_CLIENT_EMAIL && !!env.GOOGLE_PRIVATE_KEY
}

export async function getAccessToken(env: GoogleEnv): Promise<string> {
  if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error('サービスアカウント未設定（GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY）')
  }
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token

  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64UrlFromJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlFromJson({
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDerBuffer(env.GOOGLE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  let sigBin = ''
  for (const b of new Uint8Array(sigBuf)) sigBin += String.fromCharCode(b)
  const signature = btoa(sigBin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })
  if (!res.ok) throw new Error(`OAuth失敗: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 }
  return data.access_token
}

export async function sendFcm(
  env: GoogleEnv,
  token: string,
  title: string,
  body: string,
  link: string,
): Promise<void> {
  const accessToken = await getAccessToken(env)
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        webpush: { fcmOptions: { link }, headers: { Urgency: 'high' } },
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    // アプリの削除・再インストール等で二度と使えなくなった通知先（再送しても届かない）
    const tokenGone = text.includes('UNREGISTERED') || text.includes('not a valid FCM registration token')
    throw new FcmError(`FCM送信失敗(${token.slice(0, 8)}…): ${res.status} ${text}`, tokenGone)
  }
}

export class FcmError extends Error {
  tokenGone: boolean

  constructor(message: string, tokenGone: boolean) {
    super(message)
    this.tokenGone = tokenGone
  }
}
