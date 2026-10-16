import type { Coords } from './location'
import { apiFetch } from './api'
import { setMyAlertId } from './session'

export interface AlertResult {
  ok: boolean
  sentTo?: number
  alertId?: string
  /** すでに未完了の要請があり、新しくは作られなかった */
  duplicate?: boolean
  /** タグの持ち主の要請が、別の端末からすでに送られている（この端末の要請ではない） */
  othersAlert?: boolean
  error?: string
}

/**
 * 支援要請を送信する（NFCタップ→カウントダウン経由、またはボタン操作）。
 * 送信先は登録済みパートナー全員（距離による絞り込みはしない）。
 * tagToken を渡すと、そのNFCタグの持ち主のヘルプカードで送る（Safariなど、別の端末から読んだとき）。
 * 本人のニックネームや配慮事項は、サーバーが保存済みのプロフィールから付ける。
 */
export async function sendHelpAlert(coords: Coords | null, tagToken?: string | null): Promise<AlertResult> {
  const result = await apiFetch<AlertResult>('/api/alert', { body: { coords, token: tagToken ?? undefined } })
  if (result.alertId && !result.othersAlert) setMyAlertId(result.alertId)
  return result
}
