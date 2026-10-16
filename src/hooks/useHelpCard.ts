import { useEffect, useState } from 'react'
import { subscribeAlertView } from '../lib/alerts'
import type { HelpProfile } from '../lib/profile'

/**
 * 対応中の要請のヘルプカードを取得する。応答者になった端末にだけサーバーが返し、
 * 電話番号は含まれない（緊急連絡先は到着後にNFCタグのキーで別途受け取る）。
 */
export function useHelpCard(alertId: string | null): { profile: HelpProfile | null; loading: boolean } {
  const [profile, setProfile] = useState<HelpProfile | null>(null)
  const [loading, setLoading] = useState(!!alertId)

  useEffect(() => {
    if (!alertId) return
    return subscribeAlertView(alertId, (v) => {
      setLoading(false)
      const c = v?.helpCard
      setProfile(
        c
          ? {
              id: c.id,
              nickname: c.nickname,
              categories: c.categories ?? [],
              subOptions: c.subOptions ?? [],
              categoryNotes: c.categoryNotes,
              note: c.note ?? '',
              emergencyContactName: '',
              emergencyContactPhone: '',
              hasEmergencyContact: c.hasEmergencyContact,
              updatedAt: '',
            }
          : null,
      )
    })
  }, [alertId])

  return { profile, loading }
}
