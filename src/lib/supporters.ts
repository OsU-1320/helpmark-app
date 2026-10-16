import { apiFetch } from './api'

/** パートナーの通知先（FCMトークン）をサーバーへ登録する。同じ端末の再登録は上書き */
export async function saveSupporterToken(reg: { token: string; nickname: string }): Promise<void> {
  await apiFetch('/api/supporter', { method: 'PUT', body: reg })
}
