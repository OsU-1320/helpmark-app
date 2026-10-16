import { apiFetch } from './api'

// ── 新6カテゴリ配慮事項システム ───────────────────────────────────────────
export type ConsiderationCategoryId =
  | 'anxiety'        // 不安になりやすい
  | 'sensory'        // 見えづらい、聞こえづらい
  | 'communication'  // コミュニケーションが苦手
  | 'mobility'       // できないことがある
  | 'medical'        // 急に倒れてしまうことがある
  | 'other'          // その他

export interface ConsiderationCategory {
  id: ConsiderationCategoryId
  icon: string
  label: string
  subLabel?: string
  subOptions: Array<{ id: string; label: string }>
}

export const CONSIDERATION_CATEGORIES: ConsiderationCategory[] = [
  {
    id: 'anxiety',
    icon: '💭',
    label: '不安になりやすい',
    subLabel: '人混みや大きな音などで、パニックを起こしやすい',
    subOptions: [
      { id: 'anxiety-watch', label: 'そばで静かに見守ってほしい' },
      { id: 'anxiety-calm-place', label: '落ち着ける場所へ案内してほしい' },
      { id: 'anxiety-quiet', label: '大きな音・声を控えてほしい' },
      { id: 'anxiety-slow', label: 'ゆっくり、短い言葉で話しかけてほしい' },
      { id: 'anxiety-no-talk', label: '無理に話しかけず、そばにいてほしい' },
    ],
  },
  {
    id: 'sensory',
    icon: '👁️',
    label: '見えづらい、聞こえづらい',
    subLabel: '案内表示や放送が分かりにくいことがある',
    subOptions: [
      { id: 'sensory-voice', label: '状況を声に出して伝えてほしい' },
      { id: 'sensory-written', label: '筆談やスマホの文字表示で伝えてほしい' },
      { id: 'sensory-clear', label: 'ゆっくり、はっきり話してほしい' },
      { id: 'sensory-guide', label: '目的地まで誘導してほしい' },
      { id: 'sensory-touch', label: '声をかけてから、必要なら軽く触れて合図してほしい' },
    ],
  },
  {
    id: 'communication',
    icon: '💬',
    label: 'コミュニケーションが苦手',
    subLabel: '話したり、質問に答えたりするのに時間がかかる',
    subOptions: [
      { id: 'comm-yesno', label: 'はい・いいえで答えられる質問にしてほしい' },
      { id: 'comm-wait', label: '急かさず、時間をかけて待ってほしい' },
      { id: 'comm-visual', label: '指差しやスマホ画面でのやり取りに応じてほしい' },
      { id: 'comm-explain', label: '代わりに周囲へ説明してほしい' },
    ],
  },
  {
    id: 'mobility',
    icon: '♿',
    label: 'できないことがある',
    subLabel: '階段の昇り降りや、長く歩くことなどが難しい',
    subOptions: [
      { id: 'mob-elevator', label: 'エレベーターやスロープへ案内してほしい' },
      { id: 'mob-luggage', label: '荷物を持ってほしい' },
      { id: 'mob-seat', label: '座れる場所へ案内してほしい' },
      { id: 'mob-walk', label: '支えながら一緒に歩いてほしい' },
    ],
  },
  {
    id: 'medical',
    icon: '🆘',
    label: '急に倒れてしまうことがある',
    subLabel: '意識を失ったり、体の力が抜けたりすることがある',
    subOptions: [
      { id: 'med-ambulance', label: 'すぐに救急要請をしてほしい（119番）' },
      { id: 'med-stay', label: 'その場で安全を確保し、動かさずに待っていてほしい' },
      { id: 'med-contact', label: '緊急連絡先に連絡してほしい' },
      { id: 'med-accompany', label: '救急到着まで付き添ってほしい' },
    ],
  },
  {
    id: 'other',
    icon: '📝',
    label: 'その他',
    subLabel: '上のどれにもあてはまらない配慮が必要',
    subOptions: [],
  },
]

// ── サポーター機能・役割 ─────────────────────────────────────────────────
export type SupporterCapabilityId =
  | 'wheelchair'
  | 'sign-lang'
  | 'first-aid'
  | 'multilingual'

export type SupporterRole = 'general' | 'facility-staff'

export const SUPPORTER_CAPABILITIES: Array<{ id: SupporterCapabilityId; label: string }> = [
  { id: 'wheelchair', label: '車椅子の介助ができる' },
  { id: 'sign-lang', label: '手話・筆談での対応ができる' },
  { id: 'first-aid', label: '応急手当・救命講習の受講経験がある' },
  { id: 'multilingual', label: '英語など多言語対応ができる' },
]

export const SUPPORTER_ROLES: Array<{ id: SupporterRole; label: string }> = [
  { id: 'general', label: '一般サポーター' },
  { id: 'facility-staff', label: '施設スタッフ' },
]

/** 対応時にビーコナー側へ表示される年代・性別（いずれも任意） */

// ── プロフィール型 ──────────────────────────────────────────────────────
export type ProfileType = 'user' | 'supporter'

export interface HelpProfile {
  id: string
  profileType?: ProfileType   // 主役職（最後に登録した方。表示の初期選択に使用）
  roles?: { user?: boolean; supporter?: boolean }  // 両立登録（ビーコナー+パートナー併用可）

  // 共通
  nickname: string
  updatedAt: string

  // 支援が必要な方（新6カテゴリ）
  categories: ConsiderationCategoryId[]
  subOptions: string[]
  categoryNotes?: Partial<Record<ConsiderationCategoryId, string>>
  emergencyContactName: string
  /** 緊急連絡先との続柄・関係（自由記述） */
  emergencyContactRelation?: string
  emergencyContactPhone: string
  /** サーバーから受け取るヘルプカードでは電話番号の代わりに登録の有無だけが入る */
  hasEmergencyContact?: boolean
  note: string

  // サポーター用（対応時にビーコナー側へ表示される。いずれも任意）
  capabilities?: SupporterCapabilityId[]
  capabilityNote?: string
  role?: SupporterRole
}

// ── ユーティリティ ──────────────────────────────────────────────────────

/** API送信用に配慮内容を人間可読ラベルの配列に変換 */
export function getNotificationConsiderations(profile: HelpProfile): string[] {
  if (profile.categories?.length) {
    const catLabels = profile.categories.map(cid => {
      const cat = CONSIDERATION_CATEGORIES.find(c => c.id === cid)
      return cat ? cat.label : cid
    })
    const subLabels = (profile.subOptions ?? []).map(sid => {
      for (const cat of CONSIDERATION_CATEGORIES) {
        const sub = cat.subOptions.find(s => s.id === sid)
        if (sub) return sub.label
      }
      return sid
    })
    return [...catLabels, ...subLabels]
  }
  return []
}

// ── ストレージ ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'helpmark:profile'
const PROFILE_ID_KEY = 'helpmark:profileId'

export function getOrCreateProfileId(): string {
  let id = localStorage.getItem(PROFILE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(PROFILE_ID_KEY, id)
  }
  return id
}

/**
 * 端末の役職を判定する（ビーコナーとパートナーの両立登録に対応）。
 * profileTypeは「最後に登録した主役職」。rolesフラグがあればそれを優先し、
 * 旧データ（rolesなし）はprofileTypeとデータの有無から推定する。
 */
export function getProfileRoles(p: HelpProfile | null): { isUser: boolean; isSupporter: boolean } {
  if (!p) return { isUser: false, isSupporter: false }
  if (p.roles?.user != null || p.roles?.supporter != null) {
    return { isUser: !!p.roles.user, isSupporter: !!p.roles.supporter }
  }
  // 旧データ推定: profileTypeを基本に、user側はカテゴリ登録済みならuserとみなす
  const isUser = p.profileType === 'user' || (p.profileType !== 'supporter' && (p.categories?.length ?? 0) > 0)
  const isSupporter = p.profileType === 'supporter'
  return { isUser, isSupporter }
}

export function loadProfile(): HelpProfile | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as HelpProfile
    // レガシー対応：categories が未設定の場合は空配列を補完
    if (!p.categories) p.categories = []
    if (!p.subOptions) p.subOptions = []
    return p
  } catch {
    return null
  }
}

export function saveProfileLocal(profile: HelpProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

/**
 * プロフィールをサーバーへ保存する。緊急連絡先・健康に関わる情報は、サーバーで暗号化して保存され、
 * 相手に見えるヘルプカードには「登録の有無」しか載らない。
 * 戻り値は、NFCタグのURLに入れるトークン（サーバーが発行。本人の端末からしか取得できない）。
 */
export async function saveProfileRemote(profile: HelpProfile): Promise<string> {
  const { tagToken } = await apiFetch<{ tagToken: string }>('/api/profile', {
    method: 'PUT',
    body: { profile, notificationLabels: getNotificationConsiderations(profile) },
  })
  return tagToken
}

export interface Me {
  tagToken: string | null
  /** 端末を替えるときに使う引き継ぎコード（本人の端末にだけ返る） */
  recoveryCode: string | null
  hasProfile: boolean
  activeAlertId: string | null
  isSupporter: boolean
}

/** この端末について、サーバーが知っている情報（タグのトークン・進行中の自分の要請など） */
export function fetchMe(): Promise<Me> {
  return apiFetch<Me>('/api/me')
}

/** タグのトークンを作り直す。古いタグは、すぐに使えなくなる */
export async function reissueTagToken(): Promise<string> {
  return (await apiFetch<{ tagToken: string }>('/api/tag/reissue', { method: 'POST', body: {} })).tagToken
}

/** 引き継ぎコードを作り直す。古いコードは、すぐに使えなくなる */
export async function reissueRecoveryCode(): Promise<string> {
  return (await apiFetch<{ recoveryCode: string }>('/api/recovery/reissue', { method: 'POST', body: {} })).recoveryCode
}

/**
 * 新しい端末で、引き継ぎコードを使い、元の端末の登録内容を引き継ぐ。
 * 元の端末は、その場で使えなくなる（端末の失効）。成功すると、この端末は元の本人のIDで動く。
 */
export async function recoverFromCode(code: string): Promise<void> {
  const { profileId } = await apiFetch<{ profileId: string; recoveryCode: string }>('/api/recover', { method: 'POST', body: { code } })
  // 以後は、元の本人のIDで通信する（端末シークレットは、この端末のものを、そのまま使う）
  localStorage.setItem(PROFILE_ID_KEY, profileId)
  // 登録内容を、サーバーから、この端末に戻す
  const restored = await apiFetch<HelpProfile>('/api/profile')
  saveProfileLocal({ ...restored, categories: restored.categories ?? [], subOptions: restored.subOptions ?? [], note: restored.note ?? '' })
}
