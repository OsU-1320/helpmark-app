import { getOrCreateProfileId } from './profile'
import { getDeviceSecret } from './session'

/** 支援要請APIのベースURL。未設定なら同一オリジン */
export const API_BASE = import.meta.env.VITE_ALERT_API_BASE ?? ''

/** サーバーが、端末シークレットの不一致のときに返す文言（server/src/api.ts の authenticate と同じ） */
const DEVICE_MISMATCH_MESSAGE = '端末情報が一致しません'
/** この端末が使えなくなったことを、画面に知らせるイベント */
export const DEVICE_REVOKED_EVENT = 'helpmark:device-revoked'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** APIを呼ぶ。端末ID・端末シークレットを必ず付ける（サーバー側で端末を識別・認証する） */
export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      'X-Profile-Id': getOrCreateProfileId(),
      'X-Device-Secret': getDeviceSecret(),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  // 端末の照合に失敗した（この端末の登録が、別の端末に引き継がれた等）：画面に知らせる
  if (res.status === 401 && data.error === DEVICE_MISMATCH_MESSAGE) window.dispatchEvent(new Event(DEVICE_REVOKED_EVENT))
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`)
  return data as T
}
