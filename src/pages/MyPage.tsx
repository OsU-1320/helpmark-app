import { useEffect, useState } from 'react'
import { loadProfile, getProfileRoles, fetchMe, reissueTagToken, reissueRecoveryCode, recoverFromCode, CONSIDERATION_CATEGORIES, SUPPORTER_CAPABILITIES, SUPPORTER_ROLES } from '../lib/profile'
import { buildNfcUrl } from '../lib/nfc'
import { Pict, pictForId } from '../components/Pictogram'
import { ApiError } from '../lib/api'
import type { NavProps } from '../App'
import BottomNav from '../components/BottomNav'
import PushSetupNotice from '../components/PushSetupNotice'
import './MyPage.css'

export default function MyPage({ navigate, currentPage, alarmActive, toggleAlarm }: NavProps) {
  const profile = loadProfile()
  const nav = { navigate, currentPage, alarmActive, toggleAlarm }
  // NFCタグ用のトークンは、プロフィール保存時にサーバーが発行する。端末には保存せず、サーバーから取得する
  const [tagToken, setTagToken] = useState<string | null>(null)
  const [reissuing, setReissuing] = useState(false)
  const [reissueError, setReissueError] = useState(false)
  // 引き継ぎコード（端末を替えるとき・紛失したときに使う）
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [renewingRecovery, setRenewingRecovery] = useState(false)
  // 別の端末から引き継ぐ（未登録の端末で、コードを入力する）
  const [showRecover, setShowRecover] = useState(false)
  const [recoverInput, setRecoverInput] = useState('')
  const [recovering, setRecovering] = useState(false)
  const [recoverError, setRecoverError] = useState<string | null>(null)
  // サーバーにパートナーの通知先が登録されているか（undefined = 確認中・通信不可）
  const [pushRegistered, setPushRegistered] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    if (!profile) return
    fetchMe()
      .then((me) => {
        setTagToken(me.tagToken)
        setRecoveryCode(me.recoveryCode)
        setPushRegistered(me.isSupporter)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 未登録：入口選択 ────────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="my-page-wrap">
        <main className="my-page">
          <header className="my-page__header">
            <img className="my-page__logo-mark" src="/icons/icon-192.png" alt="" width="32" height="32" />
            <span className="my-page__logo-text">ヘルプマークNET</span>
          </header>
          <div className="my-page__unregistered">
            <h1 className="my-page__title">プロフィールを登録してください</h1>
            <p className="my-page__lead">
              登録すると、NFCタップ時の支援要請に配慮事項が添付されます。
            </p>
            <button
              type="button"
              className="my-page__entry-btn my-page__entry-btn--user"
              onClick={() => navigate('help-wizard')}
            >
              <span className="my-page__entry-icon"><Pict name="entry-need-help" size={38} /></span>
              <div>
                <div className="my-page__entry-title">For Helpmark Users</div>
                <div className="my-page__entry-sub">必要な支援を登録</div>
              </div>
            </button>
            <button
              type="button"
              className="my-page__entry-btn my-page__entry-btn--supporter"
              onClick={() => navigate('supporter-form')}
            >
              <span className="my-page__entry-icon"><Pict name="entry-will-help" size={38} /></span>
              <div>
                <div className="my-page__entry-title">For Partners</div>
                <div className="my-page__entry-sub">パートナー（支援者）として登録</div>
              </div>
            </button>

            <div className="my-page__divider" />
            {!showRecover ? (
              <button type="button" className="my-page__recover-link" onClick={() => setShowRecover(true)}>
                別の端末から引き継ぐ
              </button>
            ) : (
              <form
                className="my-page__recover"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!recoverInput.trim() || recovering) return
                  setRecovering(true)
                  setRecoverError(null)
                  recoverFromCode(recoverInput)
                    .then(() => window.location.reload())
                    .catch((err: unknown) => {
                      setRecoverError(err instanceof ApiError ? err.message : '通信できませんでした。もう一度お試しください')
                      setRecovering(false)
                    })
                }}
              >
                <p className="my-page__recover-title">別の端末から引き継ぐ</p>
                <p className="my-page__nfc-hint">
                  元の端末のマイページに出ている「引き継ぎコード」を入力してください。引き継ぐと、元の端末は使えなくなります。
                </p>
                <input
                  className="my-page__recover-input"
                  value={recoverInput}
                  onChange={(e) => setRecoverInput(e.target.value)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="例：ABCD-EFGH-JKLM-NPQR-STUV"
                />
                {recoverError && <p className="my-page__nfc-hint" role="alert">{recoverError}</p>}
                <button type="submit" className="my-page__nfc-copy" disabled={recovering || !recoverInput.trim()}>
                  {recovering ? '引き継いでいます…' : '引き継ぐ'}
                </button>
              </form>
            )}
          </div>
        <p className="my-page__license">
          <a href="/licenses.html" target="_blank" rel="noreferrer">ライセンス表記</a>
        </p>
        </main>
        <BottomNav {...nav} />
      </div>
    )
  }

  const roles = getProfileRoles(profile)

  // ── 登録済み: ビーコナー/パートナー両方のセクションを役職に応じて表示 ──
  const roleLabel = SUPPORTER_ROLES.find((r) => r.id === profile.role)?.label ?? '一般パートナー'
  const capLabels = (profile.capabilities ?? []).map(
    (id) => SUPPORTER_CAPABILITIES.find((c) => c.id === id)?.label ?? id,
  )
  const catLabels = (profile.categories ?? []).map((cid) => {
    const cat = CONSIDERATION_CATEGORIES.find((c) => c.id === cid)
    return { pict: pictForId(cid), label: cat ? cat.label : cid }
  })
  const subLabels = (profile.subOptions ?? []).flatMap((sid) => {
    for (const cat of CONSIDERATION_CATEGORIES) {
      const sub = cat.subOptions.find((s) => s.id === sid)
      if (sub) return [sub.label]
    }
    return []
  })

  return (
    <div className="my-page-wrap">
      <main className="my-page">
        <header className="my-page__header">
          <img className="my-page__logo-mark" src="/icons/icon-192.png" alt="" width="32" height="32" />
          <span className="my-page__logo-text">ヘルプマークNET</span>
        </header>
        <div className="my-page__registered">
          {profile.nickname && (
            <h1 className="my-page__reg-name">{profile.nickname}</h1>
          )}

          {/* ── パートナーセクション ── */}
          {roles.isSupporter && (
            <>
              <div className="my-page__reg-row">
                <span className="my-page__reg-key">役割</span>
                <span className="my-page__reg-val">{roleLabel}</span>
              </div>
              {capLabels.length > 0 && (
                <div className="my-page__reg-row">
                  <span className="my-page__reg-key">対応できること</span>
                  <div className="my-page__tags">
                    {capLabels.map((l) => (
                      <span key={l} className="my-page__tag my-page__tag--teal">{l}</span>
                    ))}
                  </div>
                </div>
              )}
              {profile.capabilityNote && (
                <div className="my-page__reg-row">
                  <span className="my-page__reg-key">その他</span>
                  <span className="my-page__reg-val">{profile.capabilityNote}</span>
                </div>
              )}
              {pushRegistered === true && (
                <div className="my-page__fcm-note">
                  <Pict name="bell" size={15} /> 支援要請が届くと通知でお知らせします
                </div>
              )}
              {pushRegistered === false && <PushSetupNotice onRegistered={() => setPushRegistered(true)} />}
              <button
                type="button"
                className="my-page__edit-btn"
                onClick={() => navigate('supporter-form')}
              >
                パートナー情報を編集する
              </button>
            </>
          )}

          {/* ── ビーコナーセクション ── */}
          {roles.isUser && (
            <>
              {roles.isSupporter && <div className="my-page__divider" style={{ marginTop: 14 }} />}
              {catLabels.length > 0 && (
                <div className="my-page__reg-row">
                  <span className="my-page__reg-key">配慮事項</span>
                  <div className="my-page__tags">
                    {catLabels.map(({ pict, label }) => (
                      <span key={label} className="my-page__tag my-page__tag--red">
                        <Pict name={pict} size={14} /> {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {subLabels.length > 0 && (
                <div className="my-page__reg-row">
                  <span className="my-page__reg-key">してほしいこと</span>
                  <ul className="my-page__sub-list">
                    {subLabels.map((l) => (
                      <li key={l} className="my-page__sub-item">{l}</li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.emergencyContactName && (
                <div className="my-page__reg-row">
                  <span className="my-page__reg-key">緊急連絡先</span>
                  <span className="my-page__reg-val">
                    {profile.emergencyContactName}
                    {profile.emergencyContactRelation && `（${profile.emergencyContactRelation}）`}
                    {profile.emergencyContactPhone && ` / ${profile.emergencyContactPhone}`}
                  </span>
                </div>
              )}
              {profile.note && (
                <div className="my-page__reg-row">
                  <span className="my-page__reg-key">その他・知っておいてほしいこと</span>
                  <span className="my-page__reg-val">{profile.note}</span>
                </div>
              )}
              <div className="my-page__nfc-card">
                <p className="my-page__nfc-title">
                  <Pict name="pin" size={14} /> NFCタグ用URL
                </p>
                {tagToken ? (
                  <>
                    <p className="my-page__nfc-url">{buildNfcUrl(tagToken)}</p>
                    <button
                      type="button"
                      className="my-page__nfc-copy"
                      onClick={() => {
                        void navigator.clipboard.writeText(buildNfcUrl(tagToken))
                      }}
                    >
                      URLをコピー
                    </button>
                    <p className="my-page__nfc-hint">
                      このURLをNFCタグに書き込むと、誰のスマホでタップしても、あなたの配慮情報付きで支援要請が届きます。
                      このURLは、あなただけのものです。人に見せたり、写真に撮られたりしないようにしてください。
                    </p>
                    <p className="my-page__nfc-hint">
                      駆けつけたパートナーがタグを読み取れないときは、要請中の画面に出る、数字6桁のコードを伝えてください。
                    </p>
                    <button
                      type="button"
                      className="my-page__nfc-copy"
                      disabled={reissuing}
                      onClick={() => {
                        if (!window.confirm('タグ用のURLを再発行します。今のタグは、すぐに使えなくなります（新しいURLを、タグに書き直してください）。よろしいですか？')) return
                        setReissuing(true)
                        setReissueError(false)
                        reissueTagToken()
                          .then(setTagToken)
                          .catch(() => setReissueError(true))
                          .finally(() => setReissuing(false))
                      }}
                    >
                      {reissuing ? '再発行しています…' : 'タグ用URLを再発行する'}
                    </button>
                    {reissueError && <p className="my-page__nfc-hint" role="alert">再発行できませんでした。通信を確認して、もう一度お試しください</p>}
                  </>
                ) : (
                  <p className="my-page__nfc-hint">
                    プロフィールを保存すると、NFCタグ用のURLが発行されます（通信できる状態で「プロフィールを編集する」から保存してください）。
                  </p>
                )}
              </div>
              <button
                type="button"
                className="my-page__edit-btn"
                onClick={() => navigate('help-wizard')}
              >
                プロフィールを編集する
              </button>
            </>
          )}

          {/* ── 引き継ぎコード（機種変更・紛失のとき） ── */}
          <div className="my-page__nfc-card">
            <p className="my-page__nfc-title">引き継ぎコード（機種変更・紛失のとき）</p>
            <p className="my-page__nfc-hint">
              新しい端末で、このコードを入力すると、登録内容を引き継げます。引き継ぐと、今の端末は、使えなくなります。
              スマホをなくしたときのために、安全な場所に控えておいてください。人には教えないでください。
            </p>
            {recoveryCode ? (
              <>
                {showRecovery ? (
                  <p className="my-page__recovery-code">{recoveryCode}</p>
                ) : (
                  <p className="my-page__recovery-code my-page__recovery-code--hidden">●●●●-●●●●-●●●●-●●●●-●●●●</p>
                )}
                <button type="button" className="my-page__nfc-copy" onClick={() => setShowRecovery((v) => !v)}>
                  {showRecovery ? '隠す' : 'コードを表示する'}
                </button>
                {showRecovery && (
                  <button
                    type="button"
                    className="my-page__nfc-copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(recoveryCode)
                    }}
                  >
                    コードをコピー
                  </button>
                )}
                <button
                  type="button"
                  className="my-page__nfc-copy"
                  disabled={renewingRecovery}
                  onClick={() => {
                    if (!window.confirm('引き継ぎコードを作り直します。今のコードは、すぐに使えなくなります。よろしいですか？')) return
                    setRenewingRecovery(true)
                    reissueRecoveryCode()
                      .then((c) => {
                        setRecoveryCode(c)
                        setShowRecovery(true)
                      })
                      .catch(() => {})
                      .finally(() => setRenewingRecovery(false))
                  }}
                >
                  {renewingRecovery ? '作り直しています…' : 'コードを作り直す'}
                </button>
              </>
            ) : (
              <p className="my-page__nfc-hint">通信できる状態で、このページを開き直してください</p>
            )}
          </div>

          {/* ── 未登録の役職への追加導線 ── */}
          {!roles.isUser && (
            <>
              <div className="my-page__divider" />
              <p className="my-page__also-label">ヘルプマークをお持ちの方は</p>
              <button
                type="button"
                className="my-page__entry-btn my-page__entry-btn--user"
                onClick={() => navigate('help-wizard')}
              >
                <span className="my-page__entry-icon"><Pict name="entry-need-help" size={38} /></span>
                <div>
                  <div className="my-page__entry-title">For Helpmark Users</div>
                  <div className="my-page__entry-sub">支援が必要な方の情報も登録する</div>
                </div>
              </button>
            </>
          )}
          {!roles.isSupporter && (
            <>
              <div className="my-page__divider" />
              <p className="my-page__also-label">支援できる方は（パートナー登録）</p>
              <button
                type="button"
                className="my-page__entry-btn my-page__entry-btn--supporter"
                onClick={() => navigate('supporter-form')}
              >
                <span className="my-page__entry-icon"><Pict name="entry-will-help" size={38} /></span>
                <div>
                  <div className="my-page__entry-title">For Partners</div>
                  <div className="my-page__entry-sub">支援者としても通知を受け取れるようにする</div>
                </div>
              </button>
            </>
          )}
        </div>
      <p className="my-page__license">
        <a href="/licenses.html" target="_blank" rel="noreferrer">ライセンス表記</a>
      </p>
      </main>
      <BottomNav {...nav} />
    </div>
  )
}
