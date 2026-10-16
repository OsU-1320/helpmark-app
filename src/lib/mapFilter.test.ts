import { describe, it, expect } from 'vitest'
import {
  requiredAttrsForCategories,
  filterByAttrs,
  isMedicalConsideration,
  navFilterFromConsiderations,
} from './mapFilter'

describe('requiredAttrsForCategories', () => {
  it('カテゴリ未選択・otherのみの場合はnull(フィルタなし)を返す', () => {
    expect(requiredAttrsForCategories([])).toBeNull()
    expect(requiredAttrsForCategories(['other'])).toBeNull()
  })

  it('medicalのみの場合は空配列(該当なし=0件)を返す', () => {
    expect(requiredAttrsForCategories(['medical'])).toEqual([])
  })

  it('mobilityはelev/slopeを要求する', () => {
    expect(requiredAttrsForCategories(['mobility'])).toEqual(['elev', 'slope'])
  })

  it('複数カテゴリの属性は重複なく合成される', () => {
    const attrs = requiredAttrsForCategories(['sensory', 'communication'])
    expect(attrs).not.toBeNull()
    expect(new Set(attrs)).toEqual(new Set(['braille', 'sign', 'written']))
  })

  it('anxietyのみの場合はnull(フィルタなし・0件表示にはしない)を返す', () => {
    expect(requiredAttrsForCategories(['anxiety'])).toBeNull()
  })

  it('anxietyは他カテゴリと併用しても属性に寄与しない', () => {
    const attrs = requiredAttrsForCategories(['anxiety', 'mobility'])
    expect(new Set(attrs)).toEqual(new Set(['elev', 'slope']))
  })
})

describe('filterByAttrs', () => {
  const facilities = [
    { id: 1, bf: { elev: true, toilet: false } },
    { id: 2, bf: { elev: false, toilet: true } },
    { id: 3, bf: {} },
    { id: 4 },
  ]

  it('attrs=nullはフィルタなし(全件通過)', () => {
    expect(filterByAttrs(facilities, null)).toEqual(facilities)
  })

  it('attrs=[]は0件(罠仕様: nullとは異なる)', () => {
    expect(filterByAttrs(facilities, [])).toEqual([])
  })

  it('指定属性のいずれかがtrueの施設のみ残す(OR条件)', () => {
    const result = filterByAttrs(facilities, ['elev', 'toilet'])
    expect(result.map((f) => f.id)).toEqual([1, 2])
  })

  it('bf未定義・属性未定義の施設は該当なしとして除外される', () => {
    const result = filterByAttrs(facilities, ['elev'])
    expect(result.map((f) => f.id)).toEqual([1])
  })
})

describe('isMedicalConsideration', () => {
  it('倒れ・心臓・救急を含むラベルを検出する', () => {
    expect(isMedicalConsideration(['急に倒れてしまうことがある'])).toBe(true)
    expect(isMedicalConsideration(['心臓に持病がある'])).toBe(true)
    expect(isMedicalConsideration(['救急要請をしてほしい'])).toBe(true)
  })

  it('該当しないラベルはfalse', () => {
    expect(isMedicalConsideration(['車椅子の介助が必要'])).toBe(false)
    expect(isMedicalConsideration([])).toBe(false)
  })
})

describe('navFilterFromConsiderations', () => {
  it('medical系ラベルはattrs=[]・medical=trueを返す(AEDは別レイヤ表示のため)', () => {
    const result = navFilterFromConsiderations(['急に倒れてしまうことがある'])
    expect(result.medical).toBe(true)
    expect(result.attrs).toEqual([])
  })

  it('mobility系ラベル(階段・車椅子)はelev/slope/toiletを要求する', () => {
    const result = navFilterFromConsiderations(['階段の昇り降りが難しい'])
    expect(result.medical).toBe(false)
    expect(new Set(result.attrs)).toEqual(new Set(['elev', 'slope', 'toilet']))
  })

  it('該当ラベルが一切ない場合はattrs=null(フィルタなし)', () => {
    const result = navFilterFromConsiderations(['特に配慮事項なし'])
    expect(result.attrs).toBeNull()
    expect(result.medical).toBe(false)
  })

  it('複数カテゴリ混在時は属性を合成する', () => {
    const result = navFilterFromConsiderations(['見えづらい、聞こえづらい', '階段の昇り降りが難しい'])
    expect(new Set(result.attrs)).toEqual(new Set(['braille', 'sign', 'written', 'elev', 'slope', 'toilet']))
  })

  it('anxiety系ラベルのみの場合はattrs=null(フィルタなし・0件表示にはしない)', () => {
    const result = navFilterFromConsiderations(['不安になりやすい'])
    expect(result.attrs).toBeNull()
    expect(result.medical).toBe(false)
  })
})
