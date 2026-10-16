import { HelpCardBody } from './HelpCardBody'
import type { HelpProfile } from '../lib/profile'
import './HelpCard.css'

interface Props {
  profile: HelpProfile | null
  loading: boolean
  onClose: () => void
}

/** ヘルプカードをポップアップ(モーダル)で表示する。中身はHelpCardBodyをそのまま使う */
export function HelpCardModal({ profile, loading, onClose }: Props) {
  return (
    <div className="help-card-overlay" role="dialog" aria-modal="true" aria-label="ヘルプカード">
      <div className="help-card-modal">
        <button type="button" className="help-card-modal__close" onClick={onClose} aria-label="閉じる">
          ✕
        </button>
        {loading && !profile && <p className="help-card__empty">ヘルプカードを読み込み中…</p>}
        {!loading && !profile && <p className="help-card__empty">ヘルプカードを取得できませんでした</p>}
        {profile && <HelpCardBody profile={profile} />}
      </div>
    </div>
  )
}
