/**
 * 保存時の暗号化（AES-256-GCM）。データベースだけが漏れても、中身が読めないようにする。
 * 鍵は Worker の Secret に置き、データベースには置かない。
 *
 * 保存形式：`v2.<鍵の名前>.<iv>.<暗号文>`（base64url）。鍵の名前が入っているので、
 * 新旧の鍵を同時に持てる（鍵の入れ替え中は、古い鍵で読み、新しい鍵で書く）。
 * 古い形式 `v1.<iv>.<暗号文>` は、名前が "1" の鍵で読む。
 * aad（追加認証データ）に「保存先のパス」を入れて、別の文書へ暗号文をコピーして読ませる攻撃を防ぐ。
 */

export interface KeySpec {
  /** 鍵の名前（暗号文に入る。英数字・- _ の16文字以内） */
  id: string
  /** 32バイトの鍵（base64 または base64url） */
  key: string
}

export interface Vault {
  /** 今の鍵で暗号化する */
  seal(plain: string, aad: string): Promise<string>
  /** 暗号文を復号する（今の鍵・前の鍵のどちらで暗号化されていてもよい） */
  open(sealed: string, aad: string): Promise<string>
  /** 暗号文を作った鍵の名前 */
  keyIdOf(sealed: string): string
  /** 今の鍵で暗号化された暗号文か（false なら、入れ替えが必要） */
  isCurrent(sealed: string): boolean
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,16}$/
const enc = new TextEncoder()
const dec = new TextDecoder()

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(spec: KeySpec): Promise<CryptoKey> {
  if (!ID_PATTERN.test(spec.id)) throw new Error('鍵の名前は、英数字・- _ の16文字以内で指定してください')
  const raw = fromB64Url(spec.key.trim())
  if (raw.length !== 32) throw new Error('暗号化の鍵は32バイト（base64）で指定してください')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** 暗号文を、`[形式, 鍵の名前, iv, 暗号文]` に分ける */
function parse(sealed: string): { kid: string; iv: string; ct: string } {
  const parts = sealed.split('.')
  if (parts[0] === 'v2' && parts.length === 4 && ID_PATTERN.test(parts[1])) return { kid: parts[1], iv: parts[2], ct: parts[3] }
  if (parts[0] === 'v1' && parts.length === 3) return { kid: '1', iv: parts[1], ct: parts[2] }
  throw new Error('暗号化されたデータの形式が正しくありません')
}

/** 今の鍵（current）と、入れ替え中だけ使う前の鍵（previous）から Vault を作る */
export async function createVault(current: KeySpec, previous: KeySpec[] = []): Promise<Vault> {
  const keys = new Map<string, CryptoKey>()
  keys.set(current.id, await importKey(current))
  for (const p of previous) {
    if (keys.has(p.id)) throw new Error(`鍵の名前が重なっています: ${p.id}`)
    keys.set(p.id, await importKey(p))
  }
  const currentKey = keys.get(current.id)!
  return {
    async seal(plain, aad) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, currentKey, enc.encode(plain))
      return `v2.${current.id}.${toB64Url(iv)}.${toB64Url(new Uint8Array(ct))}`
    },
    async open(sealed, aad) {
      const { kid, iv, ct } = parse(sealed)
      const key = keys.get(kid)
      if (!key) throw new Error(`この暗号文の鍵（${kid}）が設定されていません`)
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(iv), additionalData: enc.encode(aad) }, key, fromB64Url(ct))
      return dec.decode(plain)
    },
    keyIdOf: (sealed) => parse(sealed).kid,
    isCurrent: (sealed) => parse(sealed).kid === current.id,
  }
}

/** テスト・ローカル開発用の使い捨て鍵（再起動すると、それまでのデータは読めなくなる） */
export async function createEphemeralVault(): Promise<Vault> {
  return createVault({ id: 'dev', key: toB64Url(crypto.getRandomValues(new Uint8Array(32))) })
}

/** 暗号化して保存する項目の「保存先の名前」（aad）。保存する側と、入れ替えのスクリプトで、同じ規則を使う */
export const sealPath = {
  health: (id: string) => `profiles/${id}#health`,
  contact: (id: string) => `emergencyContacts/${id}`,
  alertConsiderations: (id: string) => `alerts/${id}#considerations`,
  alertCode: (id: string) => `alerts/${id}#code`,
  tagToken: (id: string) => `devices/${id}#tagToken`,
  recovery: (id: string) => `devices/${id}#recovery`,
}

/** 暗号化している項目の一覧（コレクション・項目名・保存先の名前の作り方）。鍵の入れ替えで、すべて読み直す */
export const SEALED_FIELDS: Array<{ collection: string; field: string; aad: (id: string) => string }> = [
  { collection: 'profiles', field: 'healthEnc', aad: sealPath.health },
  { collection: 'emergencyContacts', field: 'enc', aad: sealPath.contact },
  { collection: 'devices', field: 'tagTokenEnc', aad: sealPath.tagToken },
  { collection: 'devices', field: 'recoveryEnc', aad: sealPath.recovery },
  { collection: 'alerts', field: 'considerationsEnc', aad: sealPath.alertConsiderations },
  { collection: 'alerts', field: 'codeEnc', aad: sealPath.alertCode },
]
