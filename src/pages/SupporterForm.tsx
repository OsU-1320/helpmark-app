import { useEffect, useState } from 'react'
import { Pict } from '../components/Pictogram'
import {
  SUPPORTER_CAPABILITIES,
  SUPPORTER_ROLES,
  getOrCreateProfileId,
  getProfileRoles,
  loadProfile,
  saveProfileLocal,
  saveProfileRemote,
  type HelpProfile,
  type SupporterCapabilityId,
  type SupporterRole,
} from '../lib/profile'
import { prepareMessagingWorker, requestPushSubscription } from '../lib/push'
import { saveSupporterToken } from '../lib/supporters'
import './SupporterForm.css'

interface Props {
  onBack?: () => void
  onSaved?: () => void
}

export default function SupporterForm({ onBack, onSaved }: Props) {
  const existing = loadProfile()
  const [nickname, setNickname] = useState(existing?.nickname ?? '')
  const [capabilities, setCapabilities] = useState<SupporterCapabilityId[]>(existing?.capabilities ?? [])
  const [capabilityNote, setCapabilityNote] = useState(existing?.capabilityNote ?? '')
  const [role, setRole] = useState<SupporterRole>(existing?.role ?? 'general')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [fcmOk, setFcmOk] = useState<boolean | null>(null)
  const [fcmError, setFcmError] = useState<string | undefined>()

  // 登録ボタンを押す前に通知用SWを用意しておき、登録完了までの待ち時間を短くする
  useEffect(() => {
    prepareMessagingWorker()
  }, [])

  function toggleCapability(id: SupporterCapabilityId) {
    setCapabilities((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  async function handleRegister() {
    setSaving(true)
    setSaveError(null)

    const profileId = getOrCreateProfileId()
    // ビーコナー登録済みでも上書き消去しない（両立登録）。
    // 旧データ（rolesフラグなし）はgetProfileRolesで推定してからマージする
    const prevRoles = getProfileRoles(existing)
    const profile: HelpProfile = {
      id: profileId,
      profileType: 'supporter',
      roles: { ...(prevRoles.isUser ? { user: true as const } : {}), supporter: true as const },
      nickname: nickname.trim() || existing?.nickname || '',
      categories: existing?.categories ?? [],
      subOptions: existing?.subOptions ?? [],
      ...(existing?.categoryNotes ? { categoryNotes: existing.categoryNotes } : {}),
      emergencyContactName: existing?.emergencyContactName ?? '',
      emergencyContactPhone: existing?.emergencyContactPhone ?? '',
      note: existing?.note ?? '',
      capabilities,
      capabilityNote: capabilityNote.trim(),
      role,
      updatedAt: new Date().toISOString(),
    }

    // 通知の登録とプロフィール保存を並行して行う（通知の準備は数秒かかるため、待ち時間を重ねない）。
    // 通知の許可はタップ直後に求める必要があるので、通知側を先に開始する
    saveProfileLocal(profile)
    const pushTask = (async () => {
      const token = await requestPushSubscription()
      await saveSupporterToken({ token, nickname: profile.nickname })
    })()
    const profileTask = saveProfileRemote(profile)
    const [pushResult, profileResult] = await Promise.allSettled([pushTask, profileTask])

    if (pushResult.status === 'rejected') {
      console.warn('[SupporterForm] FCM registration failed', pushResult.reason)
    }
    if (profileResult.status === 'rejected') {
      console.error('[SupporterForm] save failed', profileResult.reason)
      setSaveError('保存に失敗しました。もう一度お試しください。')
      setSaving(false)
      return
    }
    setFcmOk(pushResult.status === 'fulfilled')
    setFcmError(
      pushResult.status === 'rejected'
        ? pushResult.reason instanceof Error
          ? pushResult.reason.message
          : String(pushResult.reason)
        : undefined,
    )
    setDone(true)
    setSaving(false)
  }

  // ── 完了画面 ────────────────────────────────────────────────────────
  if (done) {
    return (
      <main className="sf-done">
        <div className="sf-done__icon" aria-hidden="true">✓</div>
        <h1 className="sf-done__title">パートナー（支援者）登録完了</h1>
        {nickname && <p className="sf-done__name">「{nickname}」として登録しました</p>}

        {capabilities.length > 0 && (
          <div className="sf-done__tags">
            {capabilities.map((id) => {
              const cap = SUPPORTER_CAPABILITIES.find((c) => c.id === id)
              return cap ? (
                <span key={id} className="sf-done__tag">{cap.label}</span>
              ) : null
            })}
          </div>
        )}

        <div className="sf-done__fcm">
          <p className={`sf-done__fcm-row${fcmOk ? ' is-ok' : ' is-ng'}`}>
            {fcmOk
              ? (<><Pict name="bell" size={15} /> プッシュ通知 ON — 支援要請が届きます</>)
              : (<><Pict name="bell-off" size={15} /> プッシュ通知は設定できませんでした</>)}
          </p>
          {!fcmOk && (
            <p className="sf-done__fcm-hint">
              iPhoneでは「ホーム画面に追加」したPWA版のみ通知を受け取れます。
              {fcmError && ` (${fcmError})`}
            </p>
          )}
        </div>

        <button type="button" className="sf-done__btn" onClick={onSaved ?? onBack}>
          ホームへ戻る
        </button>
      </main>
    )
  }

  // ── 入力フォーム ─────────────────────────────────────────────────────
  return (
    <main className="sf">
      <header className="sf__header">
        <h1 className="sf__title">パートナー（支援者）登録</h1>
        <p className="sf__lead">
          支援要請が発生した際にプッシュ通知でお知らせします。
        </p>
        <div className="sf__notice">
          iPhoneの場合は「ホーム画面に追加」してからご登録ください。
          通知許可を求めるダイアログが表示されます。
        </div>
      </header>

      <div className="sf__body">
        <fieldset className="sf__field-group">
          <legend className="sf__legend">ニックネーム（任意）</legend>
          <input
            type="text"
            className="sf__text-input"
            placeholder="例：たろうさん"
            value={nickname}
            maxLength={30}
            onChange={(e) => setNickname(e.target.value)}
          />
        </fieldset>

        <fieldset className="sf__field-group">
          <legend className="sf__legend">対応できること（複数選択可）</legend>
          <div className="sf__cap-list">
            {SUPPORTER_CAPABILITIES.map((cap) => {
              const checked = capabilities.includes(cap.id)
              return (
                <label
                  key={cap.id}
                  className={`sf__cap-item${checked ? ' is-checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="sf__cap-checkbox"
                    checked={checked}
                    onChange={() => toggleCapability(cap.id)}
                  />
                  <span className="sf__cap-label">{cap.label}</span>
                </label>
              )
            })}
          </div>
          <label className="sf__field-row" style={{ marginTop: 10 }}>
            <span className="sf__field-sublabel">その他（自由記述）</span>
            <input
              type="text"
              className="sf__text-input"
              placeholder="例：ベビーカー補助ができます"
              value={capabilityNote}
              maxLength={100}
              onChange={(e) => setCapabilityNote(e.target.value)}
            />
          </label>
        </fieldset>

        <fieldset className="sf__field-group">
          <legend className="sf__legend">役割区分</legend>
          <div className="sf__role-list">
            {SUPPORTER_ROLES.map((r) => (
              <label key={r.id} className={`sf__role-item${role === r.id ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="supporter-role"
                  value={r.id}
                  checked={role === r.id}
                  onChange={() => setRole(r.id)}
                  className="sf__role-radio"
                />
                <span className="sf__role-label">{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {saveError && (
          <p className="sf__error" role="alert">{saveError}</p>
        )}
      </div>

      <div className="sf__footer">
        <button
          type="button"
          className="sf__submit-btn"
          disabled={saving}
          onClick={handleRegister}
        >
          {saving ? '登録中…（通知許可を確認してください）' : 'パートナーとして登録する'}
        </button>
        {onBack && (
          <button type="button" className="sf__back-btn" onClick={onBack}>
            戻る
          </button>
        )}
      </div>
    </main>
  )
}
