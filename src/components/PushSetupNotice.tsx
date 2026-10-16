import { useState } from 'react'
import { registerPushForPartner } from '../lib/push'
import './PushSetupNotice.css'

interface Props {
  /** 登録に成功したとき */
  onRegistered: () => void
}

/**
 * パートナー登録済みなのに、サーバーに通知先が無い（支援要請を受け取れない）ときの案内。
 * その場で通知を設定し直せるようにし、失敗した理由も表示する。
 */
export default function PushSetupNotice({ onRegistered }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setup() {
    setBusy(true)
    setError(null)
    try {
      await registerPushForPartner()
      onRegistered()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="push-setup" role="alert">
      <p className="push-setup__title">支援要請を受け取れない状態です</p>
      <p className="push-setup__text">
        パートナーとしての通知の登録が完了していません。ホーム画面に追加したアイコンから開いて、通知を設定してください。
      </p>
      <button type="button" className="push-setup__btn" onClick={setup} disabled={busy}>
        {busy ? '設定しています…' : '通知を設定する'}
      </button>
      {error && <p className="push-setup__error">設定できませんでした：{error}</p>}
    </div>
  )
}
