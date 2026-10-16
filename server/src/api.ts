/**
 * 支援要請APIの本体。ブラウザはFirestoreに直接触れず、すべてここを経由する。
 *
 * 認証（ユーザーアカウントなし）：端末ごとの profileId と deviceSecret をヘッダで受け取り、
 * 初回はシークレットのハッシュを devices/{profileId} に登録、以後は照合する。
 * NFCタグのURLには、本人を指すランダムなトークンだけを入れる（本人のIDも、短いキーも入れない）。
 * トークンはサーバーだけが対応表（tagTokens）で本人と結びつけ、アプリは通信の本文で示して認証する。
 * 緊急連絡先は「その要請に到着済みの応答者」が「本人のタグ（トークン）または要請ごとの確認コード」を示したときだけ返す。
 * 緊急連絡先・健康に関わる情報・タグのトークン・確認コードは、保存時に暗号化する（vault.ts）。
 */
import type { Data, Store } from './store'
import { sealPath, type Vault } from './vault'

export const ALERT_WINDOW_MS = 60 * 60 * 1000
export const EXTRA_HELP_THROTTLE_MS = 60 * 1000
/** 確認コードの入力に失敗できる回数（要請ごとの合計。再対応しても戻らない） */
const MAX_CODE_FAILURES = 10
/** タグで本人確認するとき、応答者の最後の位置が、要請の場所からこの距離（メートル）以内であること。GPSの誤差や、建物の中を見込んで広めにとる */
const VERIFY_TAG_MAX_M = 500
/** 同じ端末が続けて要請を送れる間隔 */
export const ALERT_MIN_INTERVAL_MS = 60 * 1000
/** 追加支援を呼べる回数の上限（1つの要請あたり） */
const MAX_EXTRA_REQUESTS = 12
/** 一覧で見せる位置の丸め（約200m）。対応する前に、正確な位置は見せない */
const COARSE_STEP_DEG = 0.002

export const EXTRA_HELP_LABELS: Record<string, string> = {
  'more-hands': '人手がもう1人ほしい',
  aed: 'AEDを持ってきてほしい',
  staff: '駅員を呼んでほしい',
  'wheelchair-stretcher': '車椅子・担架が必要',
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** 通知の送信。対象は登録パートナー全員（excludeIds を除く）。戻り値は送信数 */
export type Notify = (title: string, body: string, excludeIds: string[]) => Promise<number>

export interface Ctx {
  store: Store
  vault: Vault
  callerId: string
  notify: Notify
  now: () => number
  /**
   * 緊急連絡先を、到着した応答者に渡すか。**既定は、渡さない**。
   * 誰でもパートナーに登録できる間は、悪用を防げないため止めている。パートナーの承認制が入ってから、有効にする
   */
  contactDisclosure?: boolean
}

// ── 保存形式 ───────────────────────────────────────────────────────────

interface DeviceDoc {
  secretHash: string
  createdAt: string
  /** タグのトークン（暗号化。マイページに表示し直すため、元に戻せる形で保存する） */
  tagTokenEnc?: string
  /** タグのトークンのハッシュ（tagTokens の文書IDと同じ） */
  tagTokenHash?: string
  /** 最後に要請を送った時刻（続けて送るのを制限する） */
  lastAlertAtMs?: number
  /** 引き継ぎコード（暗号化。マイページに表示し直すため、元に戻せる形で保存する）とそのハッシュ */
  recoveryEnc?: string
  recoveryHash?: string
  /** 引き継ぎコードの入力に失敗した回数（この端末の分） */
  recoveryFailures?: number
}

/** 引き継ぎコード→本人の対応表（recoveryCodes/{コードのハッシュ}） */
interface RecoveryDoc {
  profileId: string
  createdAt: string
}

/** トークン→本人の対応表（tagTokens/{トークンのハッシュ}） */
interface TagTokenDoc {
  profileId: string
  createdAt: string
}

/** 保存されている要請。considerations は、読み込むときに復号して入れる（保存されるのは considerationsEnc） */
interface AlertDoc {
  createdAt: string
  nickname: string
  considerations: string[]
  considerationsEnc?: string
  /** 要請ごとの確認コード（暗号化）。到着したパートナーがタグを読めないときに、本人の画面から伝える */
  codeEnc?: string
  codeFailures?: number
  lat?: number
  lng?: number
  /** ヘルプカードの持ち主（NFCタグの pid） */
  senderProfileId: string
  /** 要請を送った端末（取り消し・完了ができる） */
  ownerDeviceId: string
  status: 'active' | 'completed' | 'cancelled'
  extraRequests?: Array<{ type: string; atMs: number }>
}

type ResponderStatus = 'going' | 'arrived' | 'completed' | 'left'

interface ResponderDoc {
  nickname: string
  status: ResponderStatus
  lat?: number
  lng?: number
  locationUpdatedAt?: number
  respondedAt: string
  arrivedAt?: string
  leftAt?: string
  /** 相手のNFCタグ（または確認コード）を確認した時刻。これがある応答者だけが対応完了にできる */
  tagVerifiedAt?: string
}

/** 健康に関わる情報（暗号化して、profiles/{id}.healthEnc に保存する） */
interface HealthInfo {
  categories: string[]
  subOptions: string[]
  categoryNotes?: Record<string, string>
  note: string
  notificationLabels: string[]
}

/** 読み込んだプロフィール（healthEnc は復号して展開済み） */
interface ProfileDoc extends Partial<HealthInfo> {
  nickname?: string
  hasEmergencyContact?: boolean
}

// ── 入力の整形 ─────────────────────────────────────────────────────────

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function strArr(v: unknown, maxItems = 40, maxLen = 200): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, maxItems).map((x) => str(x, maxLen)) : []
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** 2点の距離（メートル）。球面の近似（ハーバーサイン） */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

function coordsOf(v: unknown): { lat?: number; lng?: number } {
  const c = (v ?? {}) as { latitude?: unknown; longitude?: unknown }
  const lat = num(c.latitude)
  const lng = num(c.longitude)
  return lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : {}
}

// ── 認証 ──────────────────────────────────────────────────────────────

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const ID_RE = /^[A-Za-z0-9-]{8,64}$/

/** 端末を認証して profileId を返す。初めての端末はその場で登録する */
export async function authenticate(
  store: Store,
  profileId: string | null,
  secret: string | null,
  now: number,
  /** 新しい端末を作ってよいか（作成数の制限）。省略時は常に許可 */
  allowNewDevice: () => Promise<boolean> = async () => true,
): Promise<string> {
  if (!profileId || !ID_RE.test(profileId) || !secret || secret.length < 32 || secret.length > 128) {
    throw new HttpError(401, '端末情報がありません')
  }
  const hash = await sha256Hex(secret)
  const path = `devices/${profileId}`
  const existing = await store.get<DeviceDoc>(path)
  if (existing) {
    if (existing.secretHash !== hash) throw new HttpError(401, '端末情報が一致しません')
    return profileId
  }
  if (!(await allowNewDevice())) throw new HttpError(429, '端末の登録が多すぎます。しばらくしてからお試しください')
  const created = await store.create(path, { secretHash: hash, createdAt: new Date(now).toISOString() })
  if (!created) {
    // 同時に初回登録が走った場合は、作成された側と照合する
    const again = await store.get<DeviceDoc>(path)
    if (again?.secretHash !== hash) throw new HttpError(401, '端末情報が一致しません')
  }
  return profileId
}


/** 要請ごとの確認コード（数字6桁）。要請が終わるまでしか使えず、失敗の回数にも上限がある */
export function generateCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

/** 全角数字や空白・ハイフンが混じっていても照合できるようにそろえる */
export function normalizeCode(v: unknown): string {
  return str(v, 32).normalize('NFKC').replace(/[^0-9]/g, '')
}

/** タグのトークン（192ビットのランダム値。総当たりは現実的に不可能） */
function generateTagToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const TAG_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/

/** 引き継ぎコード（100ビット）。紛らわしい文字（0/O・1/I）を除いた32種類の文字で、20文字 */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RECOVERY_LENGTH = 20
/** 端末ごとに、引き継ぎコードを間違えられる回数 */
const MAX_RECOVERY_FAILURES = 20

function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_LENGTH))
  const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length])
  return Array.from({ length: RECOVERY_LENGTH / 4 }, (_, i) => chars.slice(i * 4, i * 4 + 4).join('')).join('-')
}

/** 小文字・ハイフン・空白が混じっていても照合できるようにそろえる */
function normalizeRecoveryCode(v: unknown): string {
  return str(v, 64).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// ── 暗号化して保存するもの ───────────────────────────────────────────────

async function readProfile(ctx: Ctx, id: string): Promise<ProfileDoc | null> {
  const doc = await ctx.store.get<Data>(`profiles/${id}`)
  if (!doc) return null
  const health = doc.healthEnc ? (JSON.parse(await ctx.vault.open(String(doc.healthEnc), sealPath.health(id))) as HealthInfo) : null
  return { nickname: doc.nickname as string | undefined, hasEmergencyContact: doc.hasEmergencyContact === true, ...health }
}

async function unsealAlert(ctx: Ctx, id: string, a: AlertDoc): Promise<AlertDoc> {
  const considerations = a.considerationsEnc
    ? (JSON.parse(await ctx.vault.open(a.considerationsEnc, sealPath.alertConsiderations(id))) as string[])
    : []
  return { ...a, considerations }
}

// ── 共通の取得 ─────────────────────────────────────────────────────────

async function isSupporter(ctx: Ctx, id = ctx.callerId): Promise<boolean> {
  return (await ctx.store.get(`supporters/${id}`)) != null
}

async function requireSupporter(ctx: Ctx): Promise<void> {
  if (!(await isSupporter(ctx))) throw new HttpError(403, 'パートナー登録が必要です')
}

async function getAlertDoc(ctx: Ctx, alertId: string): Promise<AlertDoc> {
  if (!ID_RE.test(alertId)) throw new HttpError(404, '要請が見つかりません')
  const alert = await ctx.store.get<AlertDoc>(`alerts/${alertId}`)
  if (!alert) throw new HttpError(404, '要請が見つかりません')
  return unsealAlert(ctx, alertId, alert)
}

function isOpen(ctx: Ctx, a: AlertDoc): boolean {
  return a.status === 'active' && ctx.now() - Date.parse(a.createdAt) <= ALERT_WINDOW_MS
}

/**
 * 要請した本人として扱う端末：要請を送った端末、またはヘルプカード（NFCタグ）の持ち主。
 * iPhoneではNFCタグのURLがホーム画面のアプリではなくSafariで開くため、
 * Safariから送った要請を、持ち主のホーム画面アプリからも見られ・取り消せるようにする。
 */
function isRequester(ctx: Ctx, a: AlertDoc): boolean {
  return a.ownerDeviceId === ctx.callerId || a.senderProfileId === ctx.callerId
}

async function findOpenAlertFor(ctx: Ctx, field: 'ownerDeviceId' | 'senderProfileId', id: string): Promise<string | null> {
  const docs = await ctx.store.query<AlertDoc>('alerts', field, id)
  const open = docs.filter((d) => isOpen(ctx, d.data)).sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt))
  return open[0]?.id ?? null
}

/** この端末が本人として関わっている未完了の要請（送った端末としても、タグの持ち主としても探す） */
async function findOpenOwnedAlert(ctx: Ctx): Promise<string | null> {
  return (
    (await findOpenAlertFor(ctx, 'ownerDeviceId', ctx.callerId)) ??
    (await findOpenAlertFor(ctx, 'senderProfileId', ctx.callerId))
  )
}

async function requireResponder(ctx: Ctx, alertId: string): Promise<{ alert: AlertDoc; responder: ResponderDoc; path: string }> {
  const alert = await getAlertDoc(ctx, alertId)
  const path = `alerts/${alertId}/responders/${ctx.callerId}`
  const responder = await ctx.store.get<ResponderDoc>(path)
  if (!responder) throw new HttpError(403, 'この要請の応答者ではありません')
  return { alert, responder, path }
}

function requireActive(ctx: Ctx, alert: AlertDoc): void {
  if (!isOpen(ctx, alert)) throw new HttpError(409, 'この要請はすでに終了しています')
}

/**
 * 画面に出す状態。保存上はactiveのままでも、1時間を過ぎた要請は「expired（時間切れ）」として返し、
 * 応答者の端末が「対応中」のまま取り残されないようにする。
 */
function viewStatus(ctx: Ctx, a: AlertDoc): AlertDoc['status'] | 'expired' {
  return a.status === 'active' && !isOpen(ctx, a) ? 'expired' : a.status
}

/** 位置を約200m四方に丸める（一覧や、対応する前の人に見せる位置） */
function coarse(v: number | undefined): number | undefined {
  return v == null ? undefined : Math.round(v / COARSE_STEP_DEG) * COARSE_STEP_DEG
}

/**
 * 要請の情報（誰に見せるかで、見せる範囲を変える）。要請者の恒久のID（senderProfileId）は、誰にも返さない。
 * - exact=true：要請者本人と、対応を始めた応答者。正確な位置を返す。
 * - exact=false：一覧や、対応する前のパートナー。位置は約200mに丸める。
 */
function publicAlert(ctx: Ctx, id: string, a: AlertDoc, exact: boolean) {
  return {
    id,
    nickname: a.nickname,
    considerations: a.considerations,
    createdAtMs: Date.parse(a.createdAt),
    status: viewStatus(ctx, a),
    lat: exact ? a.lat : coarse(a.lat),
    lng: exact ? a.lng : coarse(a.lng),
    extraRequests: a.extraRequests ?? [],
  }
}

function publicResponder(id: string, r: ResponderDoc) {
  return {
    id,
    nickname: r.nickname,
    tagVerified: !!r.tagVerifiedAt,
    status: r.status,
    lat: r.lat,
    lng: r.lng,
    locationUpdatedAt: r.locationUpdatedAt,
    respondedAtMs: Date.parse(r.respondedAt),
    arrivedAtMs: r.arrivedAt ? Date.parse(r.arrivedAt) : undefined,
  }
}

const isActiveResponder = (r: ResponderDoc) => r.status === 'going' || r.status === 'arrived'

// ── タグのトークン ─────────────────────────────────────────────────────

/** 新しいトークンを発行して、古いものは無効にする。マイページに出すURLに使う */
async function issueTagToken(ctx: Ctx): Promise<string> {
  const devicePath = `devices/${ctx.callerId}`
  const device = await ctx.store.get<DeviceDoc>(devicePath)
  if (device?.tagTokenHash) await ctx.store.delete(`tagTokens/${device.tagTokenHash}`)
  const token = generateTagToken()
  const hash = await sha256Hex(token)
  await ctx.store.set(`tagTokens/${hash}`, { profileId: ctx.callerId, createdAt: new Date(ctx.now()).toISOString() } satisfies TagTokenDoc)
  await ctx.store.update(devicePath, { tagTokenHash: hash, tagTokenEnc: await ctx.vault.seal(token, sealPath.tagToken(ctx.callerId)) })
  return token
}

async function currentTagToken(ctx: Ctx): Promise<string | null> {
  const device = await ctx.store.get<DeviceDoc>(`devices/${ctx.callerId}`)
  return device?.tagTokenEnc ? ctx.vault.open(device.tagTokenEnc, sealPath.tagToken(ctx.callerId)) : null
}

/** 他人のタグ（トークン）を確かめて、タグの持ち主のIDを返す。形式が違う・知らないトークンは同じ扱いで拒否する */
async function resolveTagToken(ctx: Ctx, raw: unknown): Promise<string> {
  const token = typeof raw === 'string' ? raw.trim() : ''
  const rejected = new HttpError(403, 'NFCタグの情報が正しくありません')
  if (!TAG_TOKEN_RE.test(token)) throw rejected
  const doc = await ctx.store.get<TagTokenDoc>(`tagTokens/${await sha256Hex(token)}`)
  if (!doc) throw rejected
  return doc.profileId
}

// ── 引き継ぎコード（端末の紛失・機種変更） ──────────────────────────────

/** 新しい引き継ぎコードを発行して、古いものは無効にする（コードは、一度使うと、新しいものに替わる） */
async function issueRecoveryCode(ctx: Ctx, deviceId: string): Promise<string> {
  const devicePath = `devices/${deviceId}`
  const device = await ctx.store.get<DeviceDoc>(devicePath)
  if (device?.recoveryHash) await ctx.store.delete(`recoveryCodes/${device.recoveryHash}`)
  const code = generateRecoveryCode()
  const hash = await sha256Hex(normalizeRecoveryCode(code))
  await ctx.store.set(`recoveryCodes/${hash}`, { profileId: deviceId, createdAt: new Date(ctx.now()).toISOString() } satisfies RecoveryDoc)
  await ctx.store.update(devicePath, { recoveryHash: hash, recoveryEnc: await ctx.vault.seal(code, sealPath.recovery(deviceId)) })
  return code
}

async function currentRecoveryCode(ctx: Ctx): Promise<string | null> {
  const device = await ctx.store.get<DeviceDoc>(`devices/${ctx.callerId}`)
  return device?.recoveryEnc ? ctx.vault.open(device.recoveryEnc, sealPath.recovery(ctx.callerId)) : null
}

/** 端末の登録と、それに結びついたデータを、すべて消す（引き継ぎで、仮に作られていた端末の後片付け） */
async function purgeDevice(ctx: Ctx, id: string): Promise<void> {
  const device = await ctx.store.get<DeviceDoc>(`devices/${id}`)
  if (device?.tagTokenHash) await ctx.store.delete(`tagTokens/${device.tagTokenHash}`)
  if (device?.recoveryHash) await ctx.store.delete(`recoveryCodes/${device.recoveryHash}`)
  for (const path of [`profiles/${id}`, `emergencyContacts/${id}`, `supporters/${id}`, `devices/${id}`]) await ctx.store.delete(path)
}

// ── ハンドラ ───────────────────────────────────────────────────────────

export async function getMe(ctx: Ctx) {
  return {
    tagToken: await currentTagToken(ctx),
    recoveryCode: await currentRecoveryCode(ctx),
    hasProfile: (await ctx.store.get(`profiles/${ctx.callerId}`)) != null,
    activeAlertId: await findOpenOwnedAlert(ctx),
    isSupporter: await isSupporter(ctx),
  }
}

const PROFILE_TEXT_FIELDS = ['nickname', 'profileType', 'capabilityNote', 'role'] as const

export async function putProfile(ctx: Ctx, body: Data) {
  const p = (body.profile ?? {}) as Data
  const notes = (p.categoryNotes ?? {}) as Data
  const categoryNotes: Record<string, string> = {}
  for (const [k, v] of Object.entries(notes)) if (str(v)) categoryNotes[str(k, 40)] = str(v, 500)

  // 健康に関わる情報（区分・してほしいこと・自由記述）は、まとめて暗号化して保存する
  const health: HealthInfo = {
    categories: strArr(p.categories, 10, 40),
    subOptions: strArr(p.subOptions, 40, 40),
    note: str(p.note, 500),
    notificationLabels: strArr(body.notificationLabels),
    ...(Object.keys(categoryNotes).length > 0 ? { categoryNotes } : {}),
  }
  const doc: Data = {
    healthEnc: await ctx.vault.seal(JSON.stringify(health), sealPath.health(ctx.callerId)),
    capabilities: strArr(p.capabilities, 10, 40),
    updatedAt: new Date(ctx.now()).toISOString(),
  }
  for (const f of PROFILE_TEXT_FIELDS) {
    const v = str(p[f], f === 'capabilityNote' ? 500 : 60)
    if (v) doc[f] = v
  }
  const roles = (p.roles ?? {}) as Data
  doc.roles = { user: roles.user === true, supporter: roles.supporter === true }

  // 緊急連絡先はプロフィール本体と分け、全体を暗号化して保存する。ヘルプカードには「登録の有無」だけを載せる
  const contact = {
    name: str(p.emergencyContactName, 60),
    relation: str(p.emergencyContactRelation, 60),
    phone: str(p.emergencyContactPhone, 30),
  }
  doc.hasEmergencyContact = !!contact.phone
  if (contact.phone) {
    await ctx.store.set(sealPath.contact(ctx.callerId), { enc: await ctx.vault.seal(JSON.stringify(contact), sealPath.contact(ctx.callerId)) })
  } else {
    await ctx.store.delete(sealPath.contact(ctx.callerId))
  }
  await ctx.store.set(`profiles/${ctx.callerId}`, doc)

  // タグのトークンは、初めてプロフィールを保存したときに発行する（変えるときは「再発行」）
  const tagToken = (await currentTagToken(ctx)) ?? (await issueTagToken(ctx))
  // 引き継ぎコードも、初めて保存したときに発行する（端末を替えるときに使う）
  const recoveryCode = (await currentRecoveryCode(ctx)) ?? (await issueRecoveryCode(ctx, ctx.callerId))
  return { tagToken, recoveryCode }
}

/** 自分のプロフィールを、復号して返す（引き継いだ新しい端末に、登録内容を戻すため。本人の端末にだけ返す） */
export async function getOwnProfile(ctx: Ctx) {
  const doc = await ctx.store.get<Data>(`profiles/${ctx.callerId}`)
  if (!doc) throw new HttpError(404, 'プロフィールがありません')
  const profile = await readProfile(ctx, ctx.callerId)
  const contactDoc = await ctx.store.get<{ enc?: string }>(sealPath.contact(ctx.callerId))
  const contact = contactDoc?.enc
    ? (JSON.parse(await ctx.vault.open(contactDoc.enc, sealPath.contact(ctx.callerId))) as { name?: string; relation?: string; phone?: string })
    : {}
  return {
    id: ctx.callerId,
    nickname: profile?.nickname ?? '',
    profileType: doc.profileType,
    roles: doc.roles,
    categories: profile?.categories ?? [],
    subOptions: profile?.subOptions ?? [],
    categoryNotes: profile?.categoryNotes,
    note: profile?.note ?? '',
    capabilities: doc.capabilities ?? [],
    capabilityNote: doc.capabilityNote,
    role: doc.role,
    emergencyContactName: contact.name ?? '',
    emergencyContactRelation: contact.relation ?? '',
    emergencyContactPhone: contact.phone ?? '',
    updatedAt: doc.updatedAt,
  }
}

/** 引き継ぎコードを作り直す。古いコードは、その場で使えなくなる */
export async function reissueRecoveryCode(ctx: Ctx) {
  if (!(await ctx.store.get(`profiles/${ctx.callerId}`))) throw new HttpError(403, 'ヘルプカードの登録が必要です')
  return { recoveryCode: await issueRecoveryCode(ctx, ctx.callerId) }
}

/**
 * 新しい端末が、引き継ぎコードで、元の端末のデータを引き継ぐ。
 * 元の端末は、その場で使えなくなる（端末の失効）。パートナーの通知先は消すので、新しい端末で、設定し直す。
 * 引き継ぎコードは、使うと新しいものに替わる（新しいコードは、新しい端末のマイページに出る）。
 */
export async function recoverProfile(ctx: Ctx, body: Data) {
  const caller = await ctx.store.get<DeviceDoc>(`devices/${ctx.callerId}`)
  if (!caller) throw new HttpError(401, '端末情報がありません')
  const failures = caller.recoveryFailures ?? 0
  if (failures >= MAX_RECOVERY_FAILURES) throw new HttpError(429, '引き継ぎコードの入力に失敗した回数が多すぎます')

  const code = normalizeRecoveryCode(body.code)
  const doc = code.length === RECOVERY_LENGTH ? await ctx.store.get<RecoveryDoc>(`recoveryCodes/${await sha256Hex(code)}`) : null
  if (!doc) {
    await ctx.store.update(`devices/${ctx.callerId}`, { recoveryFailures: failures + 1 })
    throw new HttpError(403, '引き継ぎコードが正しくありません')
  }
  const target = doc.profileId
  if (target === ctx.callerId) throw new HttpError(400, 'この端末の引き継ぎコードです。別の端末で入力してください')
  if (!(await ctx.store.get(`devices/${target}`))) throw new HttpError(403, '引き継ぎコードが正しくありません')

  // 元の端末の「端末シークレット」を、この端末のものに差し替える（元の端末は、照合に失敗して、使えなくなる）
  await ctx.store.update(`devices/${target}`, { secretHash: caller.secretHash })
  // この端末が、引き継ぎの前に、仮に作っていた登録は、片付ける（以後は、元の本人のIDで動く）
  await purgeDevice(ctx, ctx.callerId)
  // 元の端末の通知先は、消す（新しい端末で、通知の許可を、やり直す）
  await ctx.store.delete(`supporters/${target}`)
  // コードは、一度使ったら、新しいものに替える
  const recoveryCode = await issueRecoveryCode(ctx, target)
  return { profileId: target, recoveryCode }
}

/** タグのトークンを作り直す。古いタグは、その場で使えなくなる（タグの書き直しが必要） */
export async function reissueTagToken(ctx: Ctx) {
  if (!(await ctx.store.get(`profiles/${ctx.callerId}`))) throw new HttpError(403, 'ヘルプカードの登録が必要です')
  return { tagToken: await issueTagToken(ctx) }
}

export async function putSupporter(ctx: Ctx, body: Data) {
  const token = str(body.token, 4096)
  if (!token) throw new HttpError(400, '通知トークンがありません')
  await ctx.store.set(`supporters/${ctx.callerId}`, {
    token,
    nickname: str(body.nickname, 60),
    updatedAt: new Date(ctx.now()).toISOString(),
  })
  return { ok: true }
}

/**
 * NFCタグを読んだとき、送信前に状況を確かめる（トークン必須）。
 * 自分のタグか、その人の要請がすでに進行中か、を返す。進行中なら新しく送らず、読み取った人に状況を伝える。
 */
export async function tagStatus(ctx: Ctx, body: Data) {
  const subject = await resolveTagToken(ctx, body.token)
  const openId = await findOpenAlertFor(ctx, 'senderProfileId', subject)
  const profile = await readProfile(ctx, subject)
  return { isOwn: subject === ctx.callerId, open: !!openId, alertId: openId, nickname: profile?.nickname || 'ヘルプマーク所持者' }
}

export async function postAlert(ctx: Ctx, body: Data) {
  // 同じ端末（または自分のタグ）で未完了の要請があれば、新しく作らず通知も送らない（二重要請の防止）
  const existing = await findOpenOwnedAlert(ctx)
  if (existing) return { ok: true, alertId: existing, sentTo: 0, duplicate: true }

  // 他人のタグで送る場合は、タグのトークンが必須。自分の分は、ヘルプカードの登録が必須（未登録の端末からは送れない）
  const viaTag = typeof body.token === 'string' && body.token !== ''
  const subject = viaTag ? await resolveTagToken(ctx, body.token) : ctx.callerId
  const own = subject === ctx.callerId
  const profile = await readProfile(ctx, subject)
  if (own && !profile) throw new HttpError(403, 'ヘルプカードの登録が必要です')

  // タグの持ち主の要請がすでに進行中なら、別の端末からでも新しくは作らない
  if (!own) {
    const subjectOpen = await findOpenAlertFor(ctx, 'senderProfileId', subject)
    if (subjectOpen) return { ok: true, sentTo: 0, duplicate: true, othersAlert: true }
  }

  // 端末を変えて何度も送る嫌がらせを防ぐため、続けて送れる間隔に下限を設ける
  const device = await ctx.store.get<DeviceDoc>(`devices/${ctx.callerId}`)
  if (device?.lastAlertAtMs && ctx.now() - device.lastAlertAtMs < ALERT_MIN_INTERVAL_MS) {
    throw new HttpError(429, '続けて要請を送ることはできません。しばらくしてからお試しください')
  }
  await ctx.store.update(`devices/${ctx.callerId}`, { lastAlertAtMs: ctx.now() })

  const nickname = profile?.nickname || 'ヘルプマーク所持者'
  const considerations = profile?.notificationLabels ?? []
  const alertId = crypto.randomUUID()
  const alert: Data = {
    createdAt: new Date(ctx.now()).toISOString(),
    nickname,
    considerationsEnc: await ctx.vault.seal(JSON.stringify(considerations), sealPath.alertConsiderations(alertId)),
    codeEnc: await ctx.vault.seal(generateCode(), sealPath.alertCode(alertId)),
    codeFailures: 0,
    ...coordsOf(body.coords),
    senderProfileId: subject,
    ownerDeviceId: ctx.callerId,
    status: 'active',
    extraRequests: [],
  }
  await ctx.store.set(`alerts/${alertId}`, alert)
  // 通知の本文には、配慮事項（健康に関わる情報）を入れない。ロック画面に表示されるため
  const sentTo = await ctx.notify(
    `支援要請：${nickname}さんが助けを求めています`,
    'アプリを開いて、状況を確認してください',
    [ctx.callerId, subject],
  )
  return { ok: true, alertId, sentTo }
}

export async function listActiveAlerts(ctx: Ctx) {
  await requireSupporter(ctx)
  const docs = await ctx.store.query<AlertDoc>('alerts', 'status', 'active')
  const open = docs.filter(
    (d) => isOpen(ctx, d.data) && d.data.ownerDeviceId !== ctx.callerId && d.data.senderProfileId !== ctx.callerId,
  )
  const alerts = await Promise.all(
    open.map(async (d) => {
      const responders = await ctx.store.list<ResponderDoc>(`alerts/${d.id}/responders`)
      const active = responders.filter((r) => isActiveResponder(r.data))
      const mine = active.some((r) => r.id === ctx.callerId)
      const alert = await unsealAlert(ctx, d.id, d.data)
      return {
        // 自分がすでに対応している要請だけ、正確な位置を返す。それ以外は丸めた位置
        ...publicAlert(ctx, d.id, alert, mine),
        activeResponderCount: active.length,
        iResponded: mine,
      }
    }),
  )
  return { alerts: alerts.sort((a, b) => b.createdAtMs - a.createdAtMs) }
}

export async function getAlert(ctx: Ctx, alertId: string) {
  const alert = await getAlertDoc(ctx, alertId)
  const responders = await ctx.store.list<ResponderDoc>(`alerts/${alertId}/responders`)
  const activeResponderCount = responders.filter((r) => isActiveResponder(r.data)).length

  if (isRequester(ctx, alert)) {
    const sorted = [...responders].sort((a, b) => a.data.respondedAt.localeCompare(b.data.respondedAt))
    return {
      role: 'owner',
      alert: publicAlert(ctx, alertId, alert, true),
      // 到着したパートナーがタグを読めないときに、本人の画面から伝える確認コード
      code: alert.codeEnc ? await ctx.vault.open(alert.codeEnc, sealPath.alertCode(alertId)) : null,
      responders: sorted.map((r) => publicResponder(r.id, r.data)),
    }
  }
  const mine = responders.find((r) => r.id === ctx.callerId)
  if (mine) {
    const p = await readProfile(ctx, alert.senderProfileId)
    return {
      role: 'responder',
      alert: publicAlert(ctx, alertId, alert, true),
      myResponder: publicResponder(mine.id, mine.data),
      activeResponderCount,
      helpCard: {
        id: alertId,
        nickname: p?.nickname || alert.nickname,
        categories: p?.categories ?? [],
        subOptions: p?.subOptions ?? [],
        categoryNotes: p?.categoryNotes,
        note: p?.note ?? '',
        hasEmergencyContact: !!p?.hasEmergencyContact,
      },
    }
  }
  if (await isSupporter(ctx)) return { role: 'viewer', alert: publicAlert(ctx, alertId, alert, false), activeResponderCount }
  throw new HttpError(403, 'この要請を見る権限がありません')
}

export async function respond(ctx: Ctx, alertId: string, body: Data) {
  await requireSupporter(ctx)
  const alert = await getAlertDoc(ctx, alertId)
  requireActive(ctx, alert)
  if (isRequester(ctx, alert)) {
    throw new HttpError(403, '自分の要請には対応できません')
  }
  const path = `alerts/${alertId}/responders/${ctx.callerId}`
  const existing = await ctx.store.get<ResponderDoc>(path)
  if (existing && existing.status !== 'left') return { ok: true }
  // 一度「対応できなくなりました」を押した人が、同じ要請にもう一度対応する場合は新しく対応を始める
  const profile = await readProfile(ctx, ctx.callerId)
  const supporter = await ctx.store.get<{ nickname?: string }>(`supporters/${ctx.callerId}`)
  const { lat, lng } = coordsOf(body.coords)
  const doc: ResponderDoc = {
    nickname: supporter?.nickname || profile?.nickname || str(body.nickname, 60) || 'パートナー',
    status: 'going',
    respondedAt: new Date(ctx.now()).toISOString(),
    lat,
    lng,
    locationUpdatedAt: lat != null ? ctx.now() : undefined,
  }
  if (existing) await ctx.store.set(path, doc as unknown as Data)
  else await ctx.store.create(path, doc as unknown as Data)
  return { ok: true }
}

export async function updateLocation(ctx: Ctx, alertId: string, body: Data) {
  const { alert, responder, path } = await requireResponder(ctx, alertId)
  requireActive(ctx, alert)
  if (responder.status !== 'going') throw new HttpError(409, '移動中ではありません')
  const { lat, lng } = coordsOf(body.coords)
  if (lat == null || lng == null) throw new HttpError(400, '位置情報がありません')
  await ctx.store.update(path, { lat, lng, locationUpdatedAt: ctx.now() })
  return { ok: true }
}

export async function arrive(ctx: Ctx, alertId: string) {
  const { alert, responder, path } = await requireResponder(ctx, alertId)
  requireActive(ctx, alert)
  if (responder.status !== 'going') throw new HttpError(409, '移動中ではありません')
  await ctx.store.update(path, { status: 'arrived', arrivedAt: new Date(ctx.now()).toISOString() })
  return { ok: true }
}

export async function leave(ctx: Ctx, alertId: string) {
  const { responder, path } = await requireResponder(ctx, alertId)
  if (!isActiveResponder(responder)) return { ok: true }
  // 自分の位置は、離脱した時点で残さない
  await ctx.store.update(path, {
    status: 'left',
    leftAt: new Date(ctx.now()).toISOString(),
    lat: undefined,
    lng: undefined,
    locationUpdatedAt: undefined,
  })
  return { ok: true }
}

export async function complete(ctx: Ctx, alertId: string) {
  const alert = await getAlertDoc(ctx, alertId)
  if (alert.status !== 'active') return { ok: true }
  const completedAt = new Date(ctx.now()).toISOString()
  if (isRequester(ctx, alert)) {
    await ctx.store.update(`alerts/${alertId}`, { status: 'completed', completedAt })
    return { ok: true }
  }
  const path = `alerts/${alertId}/responders/${ctx.callerId}`
  const responder = await ctx.store.get<ResponderDoc>(path)
  if (responder?.status !== 'arrived') throw new HttpError(403, '到着した応答者だけが対応完了にできます')
  if (!responder.tagVerifiedAt) throw new HttpError(403, '相手のNFCタグを読み取ると対応完了にできます')
  await ctx.store.update(`alerts/${alertId}`, { status: 'completed', completedAt })
  await ctx.store.update(path, { status: 'completed' })
  return { ok: true }
}

/** 要請した本人の位置を、送信後に更新する（送信時に位置が取れていなかった場合の補完） */
export async function updateRequesterLocation(ctx: Ctx, alertId: string, body: Data) {
  const alert = await getAlertDoc(ctx, alertId)
  if (!isRequester(ctx, alert)) throw new HttpError(403, '要請した本人だけが更新できます')
  requireActive(ctx, alert)
  const { lat, lng } = coordsOf(body.coords)
  if (lat == null || lng == null) throw new HttpError(400, '位置情報がありません')
  await ctx.store.update(`alerts/${alertId}`, { lat, lng })
  return { ok: true }
}

export async function cancel(ctx: Ctx, alertId: string) {
  const alert = await getAlertDoc(ctx, alertId)
  if (!isRequester(ctx, alert)) throw new HttpError(403, '要請した本人だけが取り消せます')
  if (alert.status === 'active') {
    await ctx.store.update(`alerts/${alertId}`, { status: 'cancelled', cancelledAt: new Date(ctx.now()).toISOString() })
  }
  return { ok: true }
}

export async function extraHelp(ctx: Ctx, alertId: string, body: Data) {
  const { alert, responder } = await requireResponder(ctx, alertId)
  requireActive(ctx, alert)
  if (!isActiveResponder(responder)) throw new HttpError(403, '対応中の応答者だけが追加支援を呼べます')
  const type = str(body.type, 40)
  const label = EXTRA_HELP_LABELS[type]
  if (!label) throw new HttpError(400, '追加支援の種類が正しくありません')
  const requests = alert.extraRequests ?? []
  if (requests.length >= MAX_EXTRA_REQUESTS) throw new HttpError(429, 'この要請では、追加支援を呼べる回数の上限に達しました')
  const last = requests.filter((r) => r.type === type).reduce((m, r) => Math.max(m, r.atMs), 0)
  if (last > 0 && ctx.now() - last < EXTRA_HELP_THROTTLE_MS) throw new HttpError(429, '60秒以内に同じ内容を送信済みです')
  await ctx.store.update(`alerts/${alertId}`, { extraRequests: [...requests, { type, atMs: ctx.now() }] })
  const sentTo = await ctx.notify(`追加支援要請：${alert.nickname}さんの支援にパートナーを求めています`, label, [ctx.callerId])
  return { ok: true, sentTo }
}

/**
 * 到着した応答者が、本人のタグ（トークン）または要請ごとの確認コードを示したかを確認する。
 * 成功すると、対応完了と緊急連絡先の取得ができるようになる。
 * コードの失敗は、要請ごとに合計して数える（離脱→再対応でやり直しても、回数は戻らない）。
 */
export async function verifyAlertTag(ctx: Ctx, alertId: string, body: Data) {
  const { alert, responder, path } = await requireResponder(ctx, alertId)
  requireActive(ctx, alert)
  if (responder.status !== 'arrived') throw new HttpError(403, '到着後にのみ確認できます')

  if (typeof body.token === 'string' && body.token !== '') {
    const subject = await resolveTagToken(ctx, body.token)
    if (subject !== alert.senderProfileId) throw new HttpError(403, 'このタグは、この要請の本人のものではありません')
    // タグの値は、読んだ人が使い回せる。要請の場所から遠い位置にいる応答者の、タグでの確認は通さない（コードでの確認は、本人の画面に出るので、別）。
    // 位置が無い要請（本人が位置を許可していない）は、確かめようがないので通す。応答者の位置が無いときは、通さない（コードで確認できる）
    if (alert.lat != null && alert.lng != null) {
      if (responder.lat == null || responder.lng == null) {
        throw new HttpError(403, '位置情報が確認できないため、タグでは確認できません。本人の画面に出るコードを入力してください')
      }
      if (distanceM({ lat: alert.lat, lng: alert.lng }, { lat: responder.lat, lng: responder.lng }) > VERIFY_TAG_MAX_M) {
        throw new HttpError(403, '要請の場所から離れているため、タグでは確認できません')
      }
    }
  } else {
    const failures = alert.codeFailures ?? 0
    if (failures >= MAX_CODE_FAILURES) {
      throw new HttpError(429, 'コードの入力に失敗した回数が多すぎます。本人の画面で、新しいコードを作ってもらってください')
    }
    const code = alert.codeEnc ? await ctx.vault.open(alert.codeEnc, sealPath.alertCode(alertId)) : ''
    if (!code || normalizeCode(body.code) !== code) {
      await ctx.store.update(`alerts/${alertId}`, { codeFailures: failures + 1 })
      throw new HttpError(403, 'コードが一致しません')
    }
  }
  if (!responder.tagVerifiedAt) await ctx.store.update(path, { tagVerifiedAt: new Date(ctx.now()).toISOString() })
  return { ok: true }
}

/** 本人が、確認コードを作り直す（失敗の回数も戻す）。コードが漏れた、または入力の上限に達したとき */
export async function renewAlertCode(ctx: Ctx, alertId: string) {
  const alert = await getAlertDoc(ctx, alertId)
  if (!isRequester(ctx, alert)) throw new HttpError(403, '要請した本人だけが作り直せます')
  requireActive(ctx, alert)
  const code = generateCode()
  await ctx.store.update(`alerts/${alertId}`, { codeEnc: await ctx.vault.seal(code, sealPath.alertCode(alertId)), codeFailures: 0 })
  return { code }
}

/** 緊急連絡先。タグ（またはコード）を確認済みの、到着した応答者にだけ返す */
export async function emergencyContact(ctx: Ctx, alertId: string) {
  const { alert, responder } = await requireResponder(ctx, alertId)
  requireActive(ctx, alert)
  if (!ctx.contactDisclosure) throw new HttpError(403, '緊急連絡先の開示は、現在、停止しています')
  if (responder.status !== 'arrived') throw new HttpError(403, '到着後にのみ確認できます')
  if (!responder.tagVerifiedAt) throw new HttpError(403, '相手のタグ（またはコード）を確認すると見られます')
  const doc = await ctx.store.get<{ enc?: string }>(sealPath.contact(alert.senderProfileId))
  if (!doc?.enc) throw new HttpError(404, '緊急連絡先は登録されていません')
  const ec = JSON.parse(await ctx.vault.open(doc.enc, sealPath.contact(alert.senderProfileId))) as { name?: string; relation?: string; phone?: string }
  if (!ec.phone) throw new HttpError(404, '緊急連絡先は登録されていません')
  return { name: ec.name ?? '', relation: ec.relation ?? '', phone: ec.phone }
}
