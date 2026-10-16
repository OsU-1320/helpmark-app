import { useState } from 'react'
import { Pict, pictForId } from '../components/Pictogram'
import { HelpCardBody } from '../components/HelpCardBody'
import '../components/HelpCard.css'
import {
  CONSIDERATION_CATEGORIES,
  getOrCreateProfileId,
  loadProfile,
  getProfileRoles,
  saveProfileLocal,
  saveProfileRemote,
  type ConsiderationCategoryId,
  type HelpProfile,
} from '../lib/profile'
import './ProfileWizard.css'

interface Props {
  onBack?: () => void
  onSaved?: () => void
}

type Step = 'categories' | 'sub-options' | 'supplement' | 'confirm' | 'done' | 'view'

const ANONYMOUS_NAME = '匿名希望'

/** 画面下に固定する「次へ」と、その下の「戻る」。全ステップで同じ位置・同じ形にそろえる */
function Footer({
  next,
  nextLabel,
  nextDisabled,
  onBack,
  backLabel = '戻る',
}: {
  next: () => void
  nextLabel: string
  nextDisabled?: boolean
  onBack?: () => void
  backLabel?: string
}) {
  return (
    <div className="pw__footer">
      <button type="button" className="pw__next-btn" disabled={nextDisabled} onClick={next}>
        {nextLabel}
      </button>
      {onBack && (
        <button type="button" className="pw__edit-btn" onClick={onBack}>
          {backLabel}
        </button>
      )}
    </div>
  )
}

export default function ProfileWizard({ onBack, onSaved }: Props) {
  // 編集時は前回登録した内容を初期値にする（再入力不要）
  const existing = loadProfile()
  const [step, setStep] = useState<Step>('categories')
  const [selectedCategories, setSelectedCategories] = useState<ConsiderationCategoryId[]>(
    existing?.categories ?? [],
  )
  const [selectedSubOptions, setSelectedSubOptions] = useState<string[]>(
    existing?.subOptions ?? [],
  )
  // 区分ごとの自由記述。入力欄を開いているか（「その他」にチェックしているか）も持つ
  const [categoryNotes, setCategoryNotes] = useState<Record<string, string>>(
    (existing?.categoryNotes as Record<string, string> | undefined) ?? {},
  )
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.entries(existing?.categoryNotes ?? {}).filter(([, v]) => v).map(([k]) => [k, true])),
  )
  // 旧データは「その他」の自由記述が note にも重複して入っているため、同じ内容なら note 側は空にする
  const [nickname, setNickname] = useState(existing?.nickname === ANONYMOUS_NAME ? '' : (existing?.nickname ?? ''))
  const [emergencyName, setEmergencyName] = useState(existing?.emergencyContactName ?? '')
  const [emergencyRelation, setEmergencyRelation] = useState(existing?.emergencyContactRelation ?? '')
  const [emergencyPhone, setEmergencyPhone] = useState(existing?.emergencyContactPhone ?? '')
  const [note, setNote] = useState(
    existing?.note && existing.note !== existing.categoryNotes?.other ? existing.note : '',
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function toggleCategory(id: ConsiderationCategoryId) {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  function toggleSubOption(id: string) {
    setSelectedSubOptions((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  function backFromSupplement() {
    setStep(selectedCategories.length > 0 ? 'sub-options' : 'categories')
  }

  // 確認画面(HelpCardBody)とサーバー保存の両方で使うヘルプカード本体を組み立てる
  function buildProfile(): HelpProfile {
    // パートナー登録済みでも上書き消去しない（両立登録）。
    // 旧データ（rolesフラグなし）はgetProfileRolesで推定してからマージする
    const prevRoles = getProfileRoles(existing)
    // 選択を外した区分の自由記述は残さない。空欄の項目は省略する（保存は常に全体の置き換え）
    const notes = Object.fromEntries(
      selectedCategories
        .filter((id) => (id === 'other' || openNotes[id]) && categoryNotes[id]?.trim())
        .map((id) => [id, categoryNotes[id].trim()]),
    )
    const keptSubOptions = selectedSubOptions.filter((sid) =>
      CONSIDERATION_CATEGORIES.some((c) => selectedCategories.includes(c.id) && c.subOptions.some((o) => o.id === sid)),
    )
    return {
      id: getOrCreateProfileId(),
      profileType: 'user',
      roles: { ...(prevRoles.isSupporter ? { supporter: true as const } : {}), user: true as const },
      // 空欄にしたときは前の名前に戻さず「匿名希望」にする
      nickname: nickname.trim() || ANONYMOUS_NAME,
      categories: selectedCategories,
      subOptions: keptSubOptions,
      ...(Object.keys(notes).length > 0 ? { categoryNotes: notes } : {}),
      emergencyContactName: emergencyName.trim(),
      emergencyContactRelation: emergencyRelation.trim(),
      emergencyContactPhone: emergencyPhone.trim(),
      note: note.trim(),
      ...(existing?.capabilities?.length ? { capabilities: existing.capabilities } : {}),
      ...(existing?.role ? { role: existing.role } : {}),
      ...(existing?.capabilityNote ? { capabilityNote: existing.capabilityNote } : {}),
      updatedAt: new Date().toISOString(),
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const profile = buildProfile()
    try {
      // サーバーへの保存が成功してから端末の内容を更新する（失敗したのに保存済みに見える状態を作らない）
      await saveProfileRemote(profile)
      saveProfileLocal(profile)
      setStep('done')
    } catch (err) {
      console.error('[ProfileWizard] save failed', err)
      setSaveError('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  // ── 完了画面 ────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <main className="pw-done">
        <div className="pw-done__icon" aria-hidden="true">✓</div>
        <h1 className="pw-done__title">登録が完了しました</h1>
        <button type="button" className="pw-done__btn" onClick={() => setStep('view')}>
          ヘルプカードを確認する
        </button>
        <button type="button" className="pw-done__btn pw-done__btn--sub" onClick={onSaved ?? onBack}>
          マイページへ戻る
        </button>
      </main>
    )
  }

  // ── 登録済みのヘルプカードの確認 ─────────────────────────────────────
  if (step === 'view') {
    return (
      <main className="pw">
        <header className="pw__header">
          <h1 className="pw__title">登録したヘルプカード</h1>
        </header>
        <div className="pw__confirm-card">
          <HelpCardBody profile={buildProfile()} />
        </div>
        <Footer next={() => (onSaved ?? onBack)?.()} nextLabel="マイページへ戻る" />
      </main>
    )
  }

  // ── 確認画面：登録前にヘルプカードのプレビューを表示 ─────────────────────
  if (step === 'confirm') {
    return (
      <main className="pw">
        <header className="pw__header">
          <h1 className="pw__title">この内容でヘルプカードを登録します</h1>
          <p className="pw__lead">パートナーにはこのカードがそのまま表示されます。</p>
        </header>

        <div className="pw__confirm-card">
          <HelpCardBody profile={buildProfile()} />
        </div>

        {saveError && <p className="pw__error" role="alert">{saveError}</p>}

        <Footer
          next={handleSave}
          nextLabel={saving ? '登録中…' : 'この内容でヘルプカードを登録する'}
          nextDisabled={saving}
          onBack={() => setStep('supplement')}
          backLabel="戻って修正する"
        />
      </main>
    )
  }

  // ── ステップ1：カテゴリ選択 ─────────────────────────────────────────
  if (step === 'categories') {
    return (
      <main className="pw">
        <header className="pw__header">
          <p className="pw__step-label">ステップ 1 / 3</p>
          <h1 className="pw__title">あてはまるものを選んでください</h1>
          <p className="pw__lead">複数選べます。あとで変更もできます。</p>
        </header>

        <div className="pw__category-list">
          {CONSIDERATION_CATEGORIES.map((cat) => {
            const selected = selectedCategories.includes(cat.id)
            return (
              <button
                key={cat.id}
                type="button"
                className={`pw__cat-card cat--${cat.id}${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleCategory(cat.id)}
              >
                <span className="pw__cat-icon" aria-hidden="true"><Pict name={pictForId(cat.id)} size={32} /></span>
                <span className="pw__cat-text">
                  <span className="pw__cat-label">{cat.label}</span>
                  {cat.subLabel && <span className="pw__cat-sublabel">{cat.subLabel}</span>}
                </span>
                <span className="pw__cat-check" aria-hidden="true">{selected ? '✓' : ''}</span>
              </button>
            )
          })}
        </div>

        <Footer
          next={() => setStep(selectedCategories.length > 0 ? 'sub-options' : 'supplement')}
          nextLabel={selectedCategories.length === 0 ? 'スキップして次へ' : `次へ（${selectedCategories.length}件選択中）`}
          onBack={onBack}
        />
      </main>
    )
  }

  // ── ステップ2：してほしいこと ────────────────────────────────────────
  if (step === 'sub-options') {
    const chosen = CONSIDERATION_CATEGORIES.filter((c) => selectedCategories.includes(c.id))
    const noteBox = (id: string) => (
      <textarea
        className="pw__textarea"
        placeholder="例：具体的にしてほしいことを書いてください"
        maxLength={200}
        rows={3}
        value={categoryNotes[id] ?? ''}
        onChange={(e) => setCategoryNotes((prev) => ({ ...prev, [id]: e.target.value }))}
      />
    )
    return (
      <main className="pw">
        <header className="pw__header">
          <p className="pw__step-label">ステップ 2 / 3</p>
          <h1 className="pw__title">してほしいことを選んでください</h1>
          <p className="pw__lead">それぞれ複数選べます。</p>
        </header>

        <div className="pw__suboption-sections">
          {chosen.map((cat) => (
            <section key={cat.id} className={`pw__suboption-section cat--${cat.id}`}>
              <h2 className="pw__suboption-heading">
                <span className="pw__suboption-icon"><Pict name={pictForId(cat.id)} size={22} /></span> {cat.label}
              </h2>
              <div className="pw__suboption-list">
                {cat.subOptions.map((opt) => {
                  const checked = selectedSubOptions.includes(opt.id)
                  return (
                    <label key={opt.id} className={`pw__suboption-item${checked ? ' is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        className="pw__suboption-checkbox"
                        checked={checked}
                        onChange={() => toggleSubOption(opt.id)}
                      />
                      <span className="pw__suboption-label">{opt.label}</span>
                    </label>
                  )
                })}
                {cat.id === 'other' ? (
                  noteBox(cat.id)
                ) : (
                  <>
                    <label className={`pw__suboption-item${openNotes[cat.id] ? ' is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        className="pw__suboption-checkbox"
                        checked={!!openNotes[cat.id]}
                        onChange={() => setOpenNotes((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                      />
                      <span className="pw__suboption-label">その他（自由に書く）</span>
                    </label>
                    {openNotes[cat.id] && noteBox(cat.id)}
                  </>
                )}
              </div>
            </section>
          ))}
        </div>

        <Footer next={() => setStep('supplement')} nextLabel="次へ" onBack={() => setStep('categories')} />
      </main>
    )
  }

  // ── ステップ3：補足情報 ──────────────────────────────────────────────
  return (
    <main className="pw">
      <header className="pw__header">
        <p className="pw__step-label">ステップ 3 / 3</p>
        <h1 className="pw__title">補足情報（任意）</h1>
        <p className="pw__lead">すべて任意です。次の画面でヘルプカードの内容を確認できます。</p>
      </header>

      <div className="pw__supplement">
        <fieldset className="pw__field-group">
          <legend className="pw__field-legend">ニックネーム</legend>
          <input
            type="text"
            className="pw__text-input"
            placeholder="例：たろう"
            value={nickname}
            maxLength={30}
            onChange={(e) => setNickname(e.target.value)}
          />
          <p className="pw__field-hint pw__field-hint--after">空欄の場合は「{ANONYMOUS_NAME}」と表示されます。</p>
        </fieldset>

        <fieldset className="pw__field-group">
          <legend className="pw__field-legend">緊急連絡先（任意）</legend>
          <p className="pw__field-hint">
            今は、緊急連絡先を、駆けつけたパートナーには渡していません。パートナーを確認する仕組みが整ったときに、あなたのNFCタグを読み取ったパートナーにだけ、渡す予定です。
          </p>
          <p className="pw__field-hint">
            ※デモ用のため実在の連絡先は入力しないでください（架空の情報でOK）
          </p>
          <label className="pw__field-row">
            お名前
            <input
              type="text"
              className="pw__text-input"
              placeholder="例：やまだ はなこ"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
            />
          </label>
          <label className="pw__field-row">
            <span>
              続柄
              <span className="pw__field-aside">その人とはどのような関係ですか？</span>
            </span>
            <input
              type="text"
              className="pw__text-input"
              placeholder="例：母、友人、職場の上司"
              value={emergencyRelation}
              maxLength={30}
              onChange={(e) => setEmergencyRelation(e.target.value)}
            />
          </label>
          <label className="pw__field-row">
            電話番号
            <input
              type="tel"
              className="pw__text-input"
              placeholder="例：090-0000-0000"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="pw__field-group">
          <legend className="pw__field-legend">その他・知っておいてほしいこと</legend>
          <textarea
            className="pw__textarea"
            placeholder="例：左耳が聞こえにくいです"
            maxLength={200}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </fieldset>
      </div>

      <Footer next={() => setStep('confirm')} nextLabel="ヘルプカードを確認する" onBack={backFromSupplement} />
    </main>
  )
}
