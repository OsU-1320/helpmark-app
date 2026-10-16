import { useEffect, useRef, useState } from 'react'
import { Pict } from '../components/Pictogram'
import './CountdownPage.css'
import type { PageName } from '../App'
import { getCurrentPosition, type Coords } from '../lib/location'
import { sendHelpAlert, type AlertResult } from '../lib/alertApi'
import { fetchNearestRestFacility, type NearestRest } from '../lib/restInfo'
import { clearNfcParams, getNfcToken } from '../lib/nfc'
import { fetchMe } from '../lib/profile'
import { checkTagStatus, updateRequesterLocation, verifyTag } from '../lib/alerts'
import { ApiError } from '../lib/api'
import { getNavigatingAlertId, setMyAlertId } from '../lib/session'

interface Props {
  navigate: (page: PageName) => void
}

const COUNTDOWN_MS = 3000

type Phase = 'checking' | 'counting' | 'sending' | 'sent' | 'failed' | 'already' | 'invalid' | 'unregistered'

/** 送信前の確認で待つ上限。通信が遅くてもカウントダウンを止めない（二重送信はサーバーでも防ぐ） */
const CHECK_TIMEOUT_MS = 2500

function withTimeout<T>(p: Promise<T>): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), CHECK_TIMEOUT_MS))])
}

export default function CountdownPage({ navigate }: Props) {
  const [remainingMs, setRemainingMs] = useState(COUNTDOWN_MS)
  const [phase, setPhase] = useState<Phase>('checking')
  const coordsRef = useRef<Coords | null>(null)
  const [locationNote, setLocationNote] = useState('現在地を取得中…')
  const [result, setResult] = useState<AlertResult | null>(null)
  const [rest, setRest] = useState<NearestRest | null>(null)
  const sentRef = useRef(false)
  // 位置が取れる前に送った要請。位置が取れたらあとから届ける
  const sentWithoutCoordsRef = useRef<string | null>(null)
  // タグの持ち主の要請がすでに進行中のときの持ち主の名前
  const [alreadyName, setAlreadyName] = useState('')
  // 他人のタグ（Safariなど、別の端末から読んだとき）で送る場合の、タグのトークン。自分のタグなら使わない
  const tagTokenRef = useRef<string | null>(null)

  // URLのタグのトークン。最初に1回だけ読んで保持する（読み取り後はURLから消すため、再実行しても読み直せない）
  const [token] = useState(getNfcToken)

  // 送信前の確認：①到着済みのパートナーが、対応中の相手のタグを読んだ（本人の確認）②自分の要請がすでに進行中
  useEffect(() => {
    let cancelled = false
    clearNfcParams()
    void (async () => {
      if (token) {
        // タグのトークンは、通信の本文でサーバーに示して確かめる（URLには残さない）
        let status: Awaited<ReturnType<typeof checkTagStatus>> | null = null
        try {
          status = await Promise.race([checkTagStatus(token), new Promise<null>((r) => setTimeout(() => r(null), CHECK_TIMEOUT_MS))])
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            if (!cancelled) setPhase('invalid')
            return
          }
        }
        if (cancelled) return
        if (status && !status.isOwn) {
          const navId = getNavigatingAlertId()
          if (status.open && status.alertId && navId === status.alertId) {
            // 駆けつけたパートナーが、対応中の相手のタグを読んだ：本人の確認をして、対応の画面へ
            await verifyTag(navId, { token }).catch(() => {})
            if (!cancelled) navigate('help-support')
            return
          }
          // その人の要請がすでに進行中なら送らない（別のパートナーが読んだ等）
          if (status.open) {
            setAlreadyName(status.nickname)
            setPhase('already')
            return
          }
        }
        // 自分のタグなら通常の送信。他人のタグ（または確認が間に合わなかったとき）は、トークンを付けて送る
        if (!status?.isOwn) tagTokenRef.current = token
      }
      const me = await withTimeout(fetchMe())
      if (cancelled) return
      if (me?.activeAlertId) {
        setMyAlertId(me.activeAlertId)
        navigate('wait-support')
        return
      }
      setPhase('counting')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 位置情報はカウントダウンと並行で取得（送信時に使う。失敗しても送信は止めない）
  useEffect(() => {
    let cancelled = false
    getCurrentPosition()
      .then((c) => {
        if (cancelled) return
        coordsRef.current = c
        setLocationNote(`現在地取得済み・誤差 ${Math.round(c.accuracy)}m`)
        // 位置の許可を待つ間に送信が済んでいた場合は、要請に位置を追加で届ける（パートナーの方角表示に必要）
        const sentId = sentWithoutCoordsRef.current
        if (sentId) {
          sentWithoutCoordsRef.current = null
          updateRequesterLocation(sentId, c).catch(() => {})
        }
      })
      .catch(() => {
        if (!cancelled) setLocationNote('現在地なしのまま送信します')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 3秒カウントダウン → 自動送信。「はい/いいえ」ダイアログは使わない（操作負荷軽減）
  useEffect(() => {
    if (phase !== 'counting') return
    const startedAt = Date.now()
    const timer = setInterval(() => {
      const left = COUNTDOWN_MS - (Date.now() - startedAt)
      if (left <= 0) {
        clearInterval(timer)
        void doSend()
      } else {
        setRemainingMs(left)
      }
    }, 50)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function doSend() {
    if (sentRef.current) return
    sentRef.current = true
    setPhase('sending')
    try {
      const r = await sendHelpAlert(coordsRef.current, tagTokenRef.current)
      if (r.othersAlert) {
        setPhase('already')
        return
      }
      if (r.duplicate) {
        // すでに進行中の要請がある：新しくは送らず、その状況画面へ
        navigate('wait-support')
        return
      }
      if (!coordsRef.current && r.alertId) sentWithoutCoordsRef.current = r.alertId
      setResult(r)
      setPhase('sent')
      // 休憩情報の同時提示：送信と同時に本人画面へ最寄りのバリアフリー施設を出す。
      // 取得失敗しても要請完了画面は妨げない（非同期で後から差し込む）。
      fetchNearestRestFacility(coordsRef.current).then(setRest).catch(() => setRest(null))
    } catch (err) {
      console.error('[Countdown] send failed', err)
      if (err instanceof ApiError && err.status === 403) {
        setPhase(tagTokenRef.current ? 'invalid' : 'unregistered')
        return
      }
      setResult({ ok: false, error: String(err) })
      setPhase('failed')
    }
  }

  // カウント中・送信中の画面タップでキャンセル（誤タップ防止より操作の手間を優先）
  function handleCancel() {
    if (phase === 'checking' || phase === 'counting' || phase === 'sending') {
      navigate('home')
    }
  }

  const secondsLeft = Math.ceil(remainingMs / 1000)

  return (
    <div
      className={`countdown${phase === 'sent' ? ' countdown--sent' : ''}${phase === 'failed' ? ' countdown--failed' : ''}`}
      onClick={handleCancel}
      role="presentation"
    >
      {phase === 'checking' && (
        <>
          <p className="countdown__label">支援要請の準備をしています</p>
          <p className="countdown__note">キャンセルするときは画面をタップ</p>
        </>
      )}

      {phase === 'counting' && (
        <>
          <p className="countdown__label">支援要請を送信します</p>
          <div className="countdown__ring">
            <span className="countdown__num">{secondsLeft}</span>
          </div>
          <p className="countdown__note">キャンセルするときは画面をタップ</p>
          <p className="countdown__location">{locationNote}</p>
        </>
      )}

      {phase === 'sending' && (
        <>
          <p className="countdown__label">送信中…</p>
          <p className="countdown__note">画面をタップでキャンセル</p>
          <p className="countdown__location">{locationNote}</p>
        </>
      )}

      {phase === 'sent' && (
        <>
          <p className="countdown__sent-icon" aria-hidden="true">✓</p>
          <p className="countdown__label">支援要請を送信しました</p>
          <p className="countdown__detail">
            {result?.sentTo != null && result.sentTo > 0
              ? `${result.sentTo}人のパートナーに通知しました`
              : '通知できるパートナーが見つかりませんでした'}
          </p>
          {rest && (
            <div className="countdown__rest">
              <p className="countdown__rest-label">少し休憩しませんか？（最寄り）</p>
              <p className="countdown__rest-name"><Pict name="seat" size={15} /> {rest.n}</p>
              <p className="countdown__rest-meta">
                約{Math.round(rest.distanceM)}m{rest.w ? ` ・${rest.w}` : ''}
              </p>
              <p className="countdown__rest-src">出典：東京都「だれでも東京」</p>
            </div>
          )}
          <button
            type="button"
            className="countdown__home-btn"
            onClick={(e) => {
              e.stopPropagation()
              navigate('wait-support')
            }}
          >
            次へ
          </button>
        </>
      )}

      {phase === 'already' && (
        <>
          <p className="countdown__label">{alreadyName || 'この方'}さんは、すでに支援を要請しています</p>
          <p className="countdown__detail">
            新しい要請は送っていません。ご本人の方は、ホーム画面に追加したアプリで状況を確認できます。
            駆けつけたパートナーの方は、アプリの「到着しました」のあと、本人の画面に出ているコードを入力してください。
          </p>
          <button
            type="button"
            className="countdown__home-btn"
            onClick={(e) => {
              e.stopPropagation()
              navigate('home')
            }}
          >
            ホームへ
          </button>
        </>
      )}

      {phase === 'invalid' && (
        <>
          <p className="countdown__label">このタグは使えません</p>
          <p className="countdown__detail">
            タグの情報が古いか、正しくありません。持ち主の方は、アプリのマイページで、新しいタグ用URLを確認して、書き直してください。
          </p>
          <button
            type="button"
            className="countdown__home-btn"
            onClick={(e) => {
              e.stopPropagation()
              navigate('home')
            }}
          >
            ホームへ
          </button>
        </>
      )}

      {phase === 'unregistered' && (
        <>
          <p className="countdown__label">ヘルプカードの登録が必要です</p>
          <p className="countdown__detail">
            支援を要請するには、先にマイページで「For Helpmark Users」の登録をしてください。
          </p>
          <button
            type="button"
            className="countdown__home-btn"
            onClick={(e) => {
              e.stopPropagation()
              navigate('my-page')
            }}
          >
            マイページへ
          </button>
        </>
      )}

      {phase === 'failed' && (
        <>
          <p className="countdown__label">送信できませんでした</p>
          <p className="countdown__detail">通信環境をご確認ください</p>
          <button
            type="button"
            className="countdown__home-btn"
            onClick={(e) => {
              e.stopPropagation()
              sentRef.current = false
              setRemainingMs(COUNTDOWN_MS)
              setPhase('counting')
            }}
          >
            もう一度送信する
          </button>
          <button
            type="button"
            className="countdown__home-btn countdown__home-btn--sub"
            onClick={(e) => {
              e.stopPropagation()
              navigate('home')
            }}
          >
            ホームへ戻る
          </button>
        </>
      )}
    </div>
  )
}
