import { Pict, pictForId, type PictName } from './Pictogram'
import { CONSIDERATION_CATEGORIES, type HelpProfile } from '../lib/profile'
import './HelpCard.css'

interface Props {
  profile: HelpProfile
}

/** 「してほしいこと」ごとのピクト。ここに無いものは汎用のマークで表示する */
const OPTION_PICT: Record<string, PictName> = {
  'anxiety-watch': 'watch-only',
  'anxiety-calm-place': 'pin',
  'anxiety-quiet': 'bell-off',
  'anxiety-slow': 'communication',
  'anxiety-no-talk': 'partners',
  'sensory-voice': 'communication',
  'sensory-written': 'pen',
  'sensory-clear': 'communication',
  'sensory-guide': 'guide',
  'sensory-touch': 'partners',
  'comm-yesno': 'communication',
  'comm-wait': 'watch-only',
  'comm-visual': 'pen',
  'comm-explain': 'partners',
  'mob-elevator': 'elevator',
  'mob-luggage': 'partners',
  'mob-seat': 'seat',
  'mob-walk': 'mobility',
  'med-ambulance': 'phone',
  'med-stay': 'warn',
  'med-contact': 'phone',
  'med-accompany': 'partners',
}

/** 急に倒れる区分は、見落とさないよう先頭に出す */
const URGENT_FIRST = ['medical']

/**
 * ヘルプカードの表示内容そのもの（オーバーレイなし）。
 * ビーコナー側の登録確認画面と、パートナー側のポップアップの両方から同じものを表示する。
 * 電話番号は一切表示しない（緊急連絡先は登録有無のみ）。
 *
 * 構成：①誰のカードか ②区分ごとのカード（大きなピクト＋してほしいこと） ③自由記述 ④緊急連絡先の有無
 */
export function HelpCardBody({ profile }: Props) {
  const selected = CONSIDERATION_CATEGORIES.filter((c) => profile.categories?.includes(c.id) && c.id !== 'other')
  const categories = [
    ...selected.filter((c) => URGENT_FIRST.includes(c.id)),
    ...selected.filter((c) => !URGENT_FIRST.includes(c.id)),
  ]
  const hasContact = profile.hasEmergencyContact ?? !!profile.emergencyContactPhone
  // 自分の登録確認では連絡先の中身も見せる。パートナー側に届くヘルプカードには番号は含まれない
  const ownContact = profile.emergencyContactPhone ? profile : null
  const otherNote = profile.categoryNotes?.other ?? ''
  const nothing = categories.length === 0 && !profile.categories?.includes('other') && !profile.note

  return (
    <div className="help-card">
      <header className="help-card__head">
        <img className="help-card__mark" src="/icons/icon-192.png" alt="" width="48" height="48" />
        <div>
          <p className="help-card__title">{profile.nickname || 'ヘルプマーク所持者'}さんの<wbr />ヘルプカード</p>
          <p className="help-card__lead">こうしてもらえると助かります</p>
        </div>
      </header>

      {nothing && <p className="help-card__empty">登録された配慮事項はありません</p>}

      {categories.map((cat) => {
        const options = cat.subOptions.filter((o) => profile.subOptions?.includes(o.id))
        const note = profile.categoryNotes?.[cat.id]
        return (
          <section key={cat.id} className={`help-card__cat help-card__cat--${cat.id} cat--${cat.id}`}>
            <h3 className="help-card__cat-head">
              <span className="help-card__cat-icon" aria-hidden="true">
                <Pict name={pictForId(cat.id)} size={28} />
              </span>
              <span>
                <span className="help-card__cat-label">{cat.label}</span>
                {cat.subLabel && <span className="help-card__cat-sub">{cat.subLabel}</span>}
              </span>
            </h3>
            {options.length > 0 && (
              <ul className="help-card__list">
                {options.map((o) => (
                  <li key={o.id} className="help-card__item">
                    <span className="help-card__item-icon" aria-hidden="true">
                      <Pict name={OPTION_PICT[o.id] ?? 'other'} size={20} />
                    </span>
                    <span className="help-card__item-text">{o.label}</span>
                  </li>
                ))}
              </ul>
            )}
            {note && <p className="help-card__cat-note">{note}</p>}
          </section>
        )
      })}

      {profile.categories?.includes('other') && otherNote && (
        <section className="help-card__cat help-card__cat--other cat--other">
          <h3 className="help-card__cat-head">
            <span className="help-card__cat-icon" aria-hidden="true">
              <Pict name="other" size={26} />
            </span>
            <span className="help-card__cat-label">その他</span>
          </h3>
          <p className="help-card__note">{otherNote}</p>
        </section>
      )}

      {profile.note && (
        <section className="help-card__cat help-card__cat--other cat--other">
          <h3 className="help-card__cat-head">
            <span className="help-card__cat-icon" aria-hidden="true">
              <Pict name="pen" size={26} />
            </span>
            <span className="help-card__cat-label">その他・知っておいてほしいこと</span>
          </h3>
          <p className="help-card__note">{profile.note}</p>
        </section>
      )}

      <section className={`help-card__emergency${hasContact ? ' is-on' : ''}`}>
        <p className="help-card__emergency-head">
          <Pict name="phone" size={18} />
          {hasContact ? '緊急連絡先あり' : '緊急連絡先は登録されていません'}
        </p>
        {ownContact ? (
          <dl className="help-card__contact">
            {ownContact.emergencyContactName && (
              <>
                <dt>お名前</dt>
                <dd>{ownContact.emergencyContactName}</dd>
              </>
            )}
            {ownContact.emergencyContactRelation && (
              <>
                <dt>続柄</dt>
                <dd>{ownContact.emergencyContactRelation}</dd>
              </>
            )}
            <dt>電話番号</dt>
            <dd>{ownContact.emergencyContactPhone}</dd>
          </dl>
        ) : (
          hasContact && <p className="help-card__emergency-sub">到着後、相手のタグを読み取ると電話できます</p>
        )}
      </section>
    </div>
  )
}
