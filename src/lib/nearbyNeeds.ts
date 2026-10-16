import type { ConsiderationCategoryId } from './profile'
import type { StationKind } from './stations'

/**
 * 「近く」画面で、着用者が「いま必要なもの」。
 * 登録した区分から、最初に選んだ状態で出し、手動で変えられる（選んだものに合う施設だけを出す）。
 * 何も選ばないときは、絞り込まずに、近いものをすべて出す。
 */
export type NeedId = 'toilet' | 'lift' | 'aed' | 'comm' | 'rental'

export interface NeedDef {
  id: NeedId
  label: string
  /** 施設データ（だれでも東京の bf）で見る属性。どれかに当てはまればよい */
  attrs: string[]
  /** 駅の施設データで出す種類 */
  stationKinds: StationKind[]
}

export const NEEDS: NeedDef[] = [
  { id: 'toilet', label: '多機能トイレ', attrs: ['toilet'], stationKinds: ['toilet'] },
  { id: 'lift', label: 'エレベーター・スロープ', attrs: ['elev', 'slope'], stationKinds: ['elevator'] },
  { id: 'aed', label: 'AED', attrs: [], stationKinds: [] },
  { id: 'comm', label: '筆談・手話', attrs: ['written', 'sign'], stationKinds: [] },
  { id: 'rental', label: '車椅子貸出', attrs: ['wc_rental'], stationKinds: [] },
]

/** 登録した区分ごとの、最初に選んでおく「必要なもの」。データが無い区分（不安・その他）は、選ばない（すべて出す） */
const DEFAULT_NEEDS: Record<ConsiderationCategoryId, NeedId[]> = {
  mobility: ['lift', 'toilet'],
  sensory: ['comm'],
  communication: ['comm'],
  medical: ['aed'],
  anxiety: [],
  other: [],
}

export function defaultNeedsForCategories(categories: ConsiderationCategoryId[]): NeedId[] {
  const ids = categories.flatMap((c) => DEFAULT_NEEDS[c] ?? [])
  return NEEDS.map((n) => n.id).filter((id) => ids.includes(id))
}

/**
 * 選んだ「必要なもの」から、施設データの属性の絞り込みを作る。
 * null＝絞り込まない（何も選んでいない）。[]＝施設データには、合うものがない（AEDだけ選んだとき等）。
 */
export function attrsForNeeds(selected: NeedId[]): string[] | null {
  if (selected.length === 0) return null
  return [...new Set(NEEDS.filter((n) => selected.includes(n.id)).flatMap((n) => n.attrs))]
}

/** 駅の施設で出す種類。null＝すべて */
export function stationKindsForNeeds(selected: NeedId[]): StationKind[] | null {
  if (selected.length === 0) return null
  return [...new Set(NEEDS.filter((n) => selected.includes(n.id)).flatMap((n) => n.stationKinds))]
}

/** AED・車椅子対応トイレを出すか（何も選んでいない、または、その項目を選んでいる） */
export const showsAed = (selected: NeedId[]) => selected.length === 0 || selected.includes('aed')
export const showsToilets = (selected: NeedId[]) => selected.length === 0 || selected.includes('toilet')

/** 選択の切り替え（押すたびに、入れる・外す） */
export function toggleNeed(selected: NeedId[], id: NeedId): NeedId[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
}
