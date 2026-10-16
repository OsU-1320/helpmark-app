import { postExtraHelp } from './alerts'

export type ExtraHelpTypeId = 'more-hands' | 'aed' | 'staff' | 'wheelchair-stretcher'

export const EXTRA_HELP_TYPES: Array<{ id: ExtraHelpTypeId; label: string }> = [
  { id: 'more-hands', label: '人手がもう1人ほしい' },
  { id: 'aed', label: 'AEDを持ってきてほしい' },
  { id: 'staff', label: '駅員を呼んでほしい' },
  { id: 'wheelchair-stretcher', label: '車椅子・担架が必要' },
]

/**
 * 「追加支援を呼ぶ」：登録パートナー全員へ再度通知する（人数指定なし・種類のみ）。
 * 履歴の記録と60秒制限はサーバー側で行う。
 */
export function requestExtraHelp(alertId: string, type: ExtraHelpTypeId, _nickname: string): Promise<void> {
  return postExtraHelp(alertId, type)
}
