/**
 * NFC起動まわりのユーティリティ。
 * NFCタグにアプリのURL（#t=…）を書き込み、タップ → OSがブラウザで起動 →
 * isNfcLaunch() で検知して専用ページへ。iPhoneのバックグラウンドタグ読み取りでも動く方式。
 *
 * t は、本人を指すランダムなトークン（本人のIDも、短い数字のキーも入れない）。
 * `#` 以降は、ブラウザがサーバーに送らないため、ホスティングのログに残らない。
 * アプリはトークンを通信の本文でAPIに示して認証し、読み取ったあとはURLから消す。
 */

/** タグに書き込むURLの基準。未設定なら今開いているアプリのURL */
const APP_ORIGIN = (import.meta.env.VITE_APP_ORIGIN as string | undefined) || window.location.origin

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

/** URLの # 以降（#t=…）からトークンを取り出す。無い・形式が違うときは null */
export function getNfcToken(): string | null {
  const t = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('t')
  return t && TOKEN_RE.test(t) ? t : null
}

/** URLにタグのトークンが付いていればNFC経由の起動とみなす */
export function isNfcLaunch(): boolean {
  return getNfcToken() != null
}

/** 古い形式のタグ（?n=… / ?src=nfc&pid=…）で開かれたか。今は使えないので、書き直しを案内する */
export function isLegacyNfcLaunch(): boolean {
  const q = new URLSearchParams(window.location.search)
  return q.has('n') || q.get('src') === 'nfc'
}

/** NFCタグに書き込むURLを生成 */
export function buildNfcUrl(token: string): string {
  return `${APP_ORIGIN}/#t=${token}`
}

/** 読み取り後はURLからタグ情報を消す（再読み込みで二重に処理しない・画面にトークンを残さない） */
export function clearNfcParams(): void {
  window.history.replaceState(null, '', window.location.pathname)
}
