import { describe, expect, it } from 'vitest'
import {
  attrsForNeeds,
  defaultNeedsForCategories,
  showsAed,
  showsToilets,
  stationKindsForNeeds,
  toggleNeed,
} from './nearbyNeeds'

describe('登録した区分から、最初に選んでおく「必要なもの」', () => {
  it('できないことがある → エレベーター・スロープと多機能トイレ', () => {
    expect(defaultNeedsForCategories(['mobility'])).toEqual(['toilet', 'lift'])
  })
  it('急に倒れる → AED。見えづらい・聞こえづらい → 筆談・手話', () => {
    expect(defaultNeedsForCategories(['medical'])).toEqual(['aed'])
    expect(defaultNeedsForCategories(['sensory'])).toEqual(['comm'])
  })
  it('複数の区分は、重ならないようにまとめる。データの無い区分・未登録は、何も選ばない', () => {
    expect(defaultNeedsForCategories(['mobility', 'medical', 'communication'])).toEqual(['toilet', 'lift', 'aed', 'comm'])
    expect(defaultNeedsForCategories(['anxiety', 'other'])).toEqual([])
    expect(defaultNeedsForCategories([])).toEqual([])
  })
})

describe('選んだものに合う施設だけを出す', () => {
  it('何も選ばなければ、絞り込まない（すべて出す）', () => {
    expect(attrsForNeeds([])).toBeNull()
    expect(stationKindsForNeeds([])).toBeNull()
    expect(showsAed([])).toBe(true)
    expect(showsToilets([])).toBe(true)
  })
  it('選んだ分の属性（どれかに当てはまればよい）を返す', () => {
    expect(attrsForNeeds(['lift'])).toEqual(['elev', 'slope'])
    expect(attrsForNeeds(['toilet', 'comm'])).toEqual(['toilet', 'written', 'sign'])
  })
  it('AEDだけを選ぶと、施設データには合うものがない（空）が、AEDは出す', () => {
    expect(attrsForNeeds(['aed'])).toEqual([])
    expect(showsAed(['aed'])).toBe(true)
    expect(showsToilets(['aed'])).toBe(false)
  })
  it('駅の施設は、選んだ種類だけ', () => {
    expect(stationKindsForNeeds(['lift'])).toEqual(['elevator'])
    expect(stationKindsForNeeds(['toilet', 'lift'])).toEqual(['toilet', 'elevator'])
    expect(stationKindsForNeeds(['comm'])).toEqual([])
  })
  it('押すたびに、入れる・外す', () => {
    expect(toggleNeed([], 'toilet')).toEqual(['toilet'])
    expect(toggleNeed(['toilet', 'lift'], 'toilet')).toEqual(['lift'])
  })
})
