import { describe, it, expect, beforeEach } from 'vitest'
import {
  getProfileRoles,
  getNotificationConsiderations,
  loadProfile,
  saveProfileLocal,
  getOrCreateProfileId,
  type HelpProfile,
} from './profile'

function baseProfile(overrides: Partial<HelpProfile> = {}): HelpProfile {
  return {
    id: 'test-id',
    nickname: 'テスト太郎',
    updatedAt: new Date().toISOString(),
    categories: [],
    subOptions: [],
    emergencyContactName: '',
    emergencyContactPhone: '',
    note: '',
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('getProfileRoles', () => {
  it('プロフィールがnullの場合は両方false', () => {
    expect(getProfileRoles(null)).toEqual({ isUser: false, isSupporter: false })
  })

  it('rolesフラグがある場合はそれを優先する(両立登録)', () => {
    const p = baseProfile({ profileType: 'supporter', roles: { user: true, supporter: true } })
    expect(getProfileRoles(p)).toEqual({ isUser: true, isSupporter: true })
  })

  it('rolesが片方だけ明示されている場合、もう片方はfalse扱い', () => {
    const p = baseProfile({ roles: { user: true } })
    expect(getProfileRoles(p)).toEqual({ isUser: true, isSupporter: false })
  })

  it('旧データ(rolesなし)はprofileType=supporterならサポーターのみ', () => {
    const p = baseProfile({ profileType: 'supporter' })
    expect(getProfileRoles(p)).toEqual({ isUser: false, isSupporter: true })
  })

  it('旧データ(rolesなし)でカテゴリ登録済みならuserとみなす', () => {
    const p = baseProfile({ categories: ['mobility'] })
    expect(getProfileRoles(p)).toEqual({ isUser: true, isSupporter: false })
  })

  it('旧データでカテゴリも無い場合はどちらでもない', () => {
    const p = baseProfile()
    expect(getProfileRoles(p)).toEqual({ isUser: false, isSupporter: false })
  })
})

describe('getNotificationConsiderations', () => {
  it('categoriesとsubOptionsを人間可読ラベルに変換する', () => {
    const p = baseProfile({
      categories: ['mobility'],
      subOptions: ['mob-elevator', 'mob-seat'],
    })
    const labels = getNotificationConsiderations(p)
    expect(labels).toEqual([
      'できないことがある',
      'エレベーターやスロープへ案内してほしい',
      '座れる場所へ案内してほしい',
    ])
  })

  it('categoriesが無い場合は空配列', () => {
    expect(getNotificationConsiderations(baseProfile())).toEqual([])
  })
})

describe('loadProfile / saveProfileLocal', () => {
  it('保存前はnullを返す', () => {
    expect(loadProfile()).toBeNull()
  })

  it('保存した内容をそのまま復元できる', () => {
    const p = baseProfile({ nickname: '花子' })
    saveProfileLocal(p)
    expect(loadProfile()).toEqual(p)
  })

  it('categories/subOptionsが欠けた旧データは空配列で補完される(過去の保存不能バグの再発防止)', () => {
    localStorage.setItem(
      'helpmark:profile',
      JSON.stringify({ id: 'legacy', nickname: '旧データ', updatedAt: '2026-01-01' }),
    )
    const loaded = loadProfile()
    expect(loaded?.categories).toEqual([])
    expect(loaded?.subOptions).toEqual([])
  })

  it('壊れたJSONはnullを返す(クラッシュしない)', () => {
    localStorage.setItem('helpmark:profile', '{invalid json')
    expect(loadProfile()).toBeNull()
  })
})

describe('getOrCreateProfileId', () => {
  it('初回は新規IDを生成しlocalStorageに保存する', () => {
    const id = getOrCreateProfileId()
    expect(id).toBeTruthy()
    expect(localStorage.getItem('helpmark:profileId')).toBe(id)
  })

  it('2回目以降は同じIDを返す', () => {
    const id1 = getOrCreateProfileId()
    const id2 = getOrCreateProfileId()
    expect(id1).toBe(id2)
  })
})
