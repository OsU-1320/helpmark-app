/**
 * ヘルプマークNET — 支援要請API（Cloudflare Worker）
 *
 * ブラウザはFirestoreに直接アクセスせず（ルールで全拒否）、すべてこのAPIを経由する。
 * 通知は登録済みパートナー全員に送る（距離による絞り込みはしない。不特定多数には送らない）。
 * 緊急連絡先・健康に関わる情報・タグのトークンは、保存時に暗号化する（DATA_ENCRYPTION_KEY）。
 *
 * 設定（server/wrangler.jsonc の vars）:
 *   - FCM_PROJECT_ID   : Firebaseのプロジェクト ID
 *   - APP_ORIGIN       : アプリのURL（通知のリンク先）
 *   - ALLOWED_ORIGINS  : APIを呼べるオリジン（カンマ区切り）
 *   - STORE            : "memory" にするとFirestoreの代わりにメモリへ保存（ローカル開発用）
 * Secrets（wrangler secret put で設定）:
 *   - GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY : サービスアカウント
 *   - DATA_ENCRYPTION_KEY : 保存時の暗号化の鍵（32バイトをbase64にしたもの。失うと、暗号化したデータは読めなくなる）
 *   - DATA_ENCRYPTION_KEY_PREVIOUS : 鍵の入れ替え中だけ。前の鍵（vars の DATA_ENCRYPTION_KEY_ID / DATA_ENCRYPTION_KEY_PREVIOUS_ID で名前を付ける）
 * レート制限（server/wrangler.jsonc の ratelimits）:
 *   - API_LIMITER / NEW_DEVICE_LIMITER : 接続元ごとのリクエスト数／新しい端末の作成数
 */
import * as api from './api'
import { FirestoreStore } from './firestoreStore'
import { FcmError, hasServiceAccount, sendFcm, type GoogleEnv } from './google'
import { MemoryStore, type Data, type Store } from './store'
import { createEphemeralVault, createVault, type Vault } from './vault'

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

interface Env extends GoogleEnv {
  APP_ORIGIN: string
  ALLOWED_ORIGINS?: string
  STORE?: string
  DATA_ENCRYPTION_KEY?: string
  /** 今の鍵の名前（暗号文に入る）。省略すると "1" */
  DATA_ENCRYPTION_KEY_ID?: string
  /** 鍵の入れ替え中だけ設定する、前の鍵と、その名前 */
  DATA_ENCRYPTION_KEY_PREVIOUS?: string
  DATA_ENCRYPTION_KEY_PREVIOUS_ID?: string
  API_LIMITER?: RateLimiter
  NEW_DEVICE_LIMITER?: RateLimiter
  /** 'on' のときだけ、緊急連絡先を、到着した応答者に渡す。省略・それ以外は、渡さない（パートナーの承認制が入るまで） */
  EMERGENCY_CONTACT_DISCLOSURE?: string
}

let vaultPromise: Promise<Vault> | null = null

/** 暗号化の部品。本番では鍵が必須（無ければ、平文で保存せずに、エラーにする）。ローカル開発（メモリ保存）だけ、使い捨ての鍵 */
function vaultFor(env: Env): Promise<Vault> {
  if (env.DATA_ENCRYPTION_KEY) {
    const previous = env.DATA_ENCRYPTION_KEY_PREVIOUS
      ? [{ id: env.DATA_ENCRYPTION_KEY_PREVIOUS_ID ?? '', key: env.DATA_ENCRYPTION_KEY_PREVIOUS }]
      : []
    return (vaultPromise ??= createVault({ id: env.DATA_ENCRYPTION_KEY_ID || '1', key: env.DATA_ENCRYPTION_KEY }, previous))
  }
  if (env.STORE === 'memory') return (vaultPromise ??= createEphemeralVault())
  throw new Error('DATA_ENCRYPTION_KEY が設定されていません')
}

let memoryStore: MemoryStore | null = null

function storeFor(env: Env): Store {
  if (env.STORE === 'memory') return (memoryStore ??= new MemoryStore())
  return new FirestoreStore(env)
}

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? ''
  const allowed = (env.ALLOWED_ORIGINS ?? env.APP_ORIGIN).split(',').map((s) => s.trim())
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : ''
  return {
    ...(allow ? { 'Access-Control-Allow-Origin': allow } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Profile-Id, X-Device-Secret',
    Vary: 'Origin',
  }
}

function makeNotify(env: Env, store: Store): api.Notify {
  return async (title, body, excludeIds) => {
    const supporters = (await store.list<{ token?: string }>('supporters')).filter(
      (s) => s.data.token && !excludeIds.includes(s.id),
    )
    if (!hasServiceAccount(env)) {
      console.log(`[notify] サービスアカウント未設定のため送信を省略（対象${supporters.length}人）: ${title}`)
      return supporters.length
    }
    let sent = 0
    for (const s of supporters) {
      try {
        await sendFcm(env, s.data.token!, title, body, env.APP_ORIGIN)
        sent++
      } catch (err) {
        // 1人のトークンが無効でも他の人には送り続ける。二度と使えない通知先は削除する
        if (err instanceof FcmError && err.tokenGone) {
          console.warn(`[notify] 無効な通知先を削除: ${s.id}`)
          await store.delete(`supporters/${s.id}`).catch(() => {})
        } else {
          console.warn(`FCM send failed for ${s.id}`, err)
        }
      }
    }
    return sent
  }
}

async function route(ctx: api.Ctx, method: string, path: string, body: Data): Promise<unknown> {
  if (method === 'GET' && path === '/api/me') return api.getMe(ctx)
  if (method === 'PUT' && path === '/api/profile') return api.putProfile(ctx, body)
  if (method === 'GET' && path === '/api/profile') return api.getOwnProfile(ctx)
  if (method === 'POST' && path === '/api/recovery/reissue') return api.reissueRecoveryCode(ctx)
  if (method === 'POST' && path === '/api/recover') return api.recoverProfile(ctx, body)
  if (method === 'PUT' && path === '/api/supporter') return api.putSupporter(ctx, body)
  if (method === 'POST' && path === '/api/alert') return api.postAlert(ctx, body)
  if (method === 'POST' && path === '/api/tag-status') return api.tagStatus(ctx, body)
  if (method === 'POST' && path === '/api/tag/reissue') return api.reissueTagToken(ctx)
  if (method === 'GET' && path === '/api/alerts/active') return api.listActiveAlerts(ctx)

  const m = path.match(/^\/api\/alerts\/([^/]+)(?:\/([a-z-]+))?$/)
  if (m) {
    const [, id, action] = m
    if (method === 'GET' && !action) return api.getAlert(ctx, id)
    if (method === 'POST') {
      switch (action) {
        case 'respond':
          return api.respond(ctx, id, body)
        case 'location':
          return api.updateLocation(ctx, id, body)
        case 'arrive':
          return api.arrive(ctx, id)
        case 'leave':
          return api.leave(ctx, id)
        case 'complete':
          return api.complete(ctx, id)
        case 'cancel':
          return api.cancel(ctx, id)
        case 'requester-location':
          return api.updateRequesterLocation(ctx, id, body)
        case 'extra-help':
          return api.extraHelp(ctx, id, body)
        case 'verify-tag':
          return api.verifyAlertTag(ctx, id, body)
        case 'new-code':
          return api.renewAlertCode(ctx, id)
        case 'emergency-contact':
          return api.emergencyContact(ctx, id)
      }
    }
  }
  throw new api.HttpError(404, 'Not Found')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request)
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } })

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const url = new URL(request.url)
    if (url.pathname === '/healthz') return json({ ok: true })

    try {
      // 接続元ごとのリクエスト数の上限（ブラウザ以外からの連続アクセスや、端末の大量作成を止める）
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: ip })).success) {
        throw new api.HttpError(429, 'リクエストが多すぎます。しばらくしてからお試しください')
      }
      const store = storeFor(env)
      const vault = await vaultFor(env)
      const now = Date.now()
      const callerId = await api.authenticate(
        store,
        request.headers.get('X-Profile-Id'),
        request.headers.get('X-Device-Secret'),
        now,
        async () => !env.NEW_DEVICE_LIMITER || (await env.NEW_DEVICE_LIMITER.limit({ key: ip })).success,
      )
      let body: Data = {}
      if (request.method === 'POST' || request.method === 'PUT') {
        const text = await request.text()
        if (text.length > 20_000) throw new api.HttpError(413, 'リクエストが大きすぎます')
        body = text ? (JSON.parse(text) as Data) : {}
      }
      const ctx: api.Ctx = { store, vault, callerId, notify: makeNotify(env, store), now: () => now, contactDisclosure: env.EMERGENCY_CONTACT_DISCLOSURE === 'on' }
      return json(await route(ctx, request.method, url.pathname, body))
    } catch (err) {
      if (err instanceof api.HttpError) return json({ ok: false, error: err.message }, err.status)
      if (err instanceof SyntaxError) return json({ ok: false, error: 'JSONが正しくありません' }, 400)
      console.error(`${request.method} ${url.pathname} error`, err)
      return json({ ok: false, error: 'サーバーでエラーが発生しました' }, 500)
    }
  },
}
