import type { ConsiderationCategoryId } from './profile'
import { CONSIDERATION_CATEGORIES } from './profile'

/**
 * 配慮事項カテゴリ → マップ表示に使う施設属性（だれでも東京データのbfフィールド）のマッピング。
 * データに存在する属性は elev / slope / braille / toilet / written / sign / wc_rental の7種。
 * 音声案内・フラッシュベル・多言語・医務室・多目的室は公開データに存在しないため、
 * 近い属性で代用するか、該当なし（0件）表示とする。
 */
export const CATEGORY_ATTR_MAP: Record<ConsiderationCategoryId, string[]> = {
  // 休憩スペース・多目的室に相当するデータは存在しないため、フィルタは行わない（該当なし扱いにもしない）
  anxiety: [],
  // 点字ブロック＋聴覚系(手話可)＋筆談。音声案内・フラッシュベルはデータ無し
  sensory: ['braille', 'sign', 'written'],
  // 筆談対応備品。多言語対応はデータ無し
  communication: ['written'],
  // エレベーター＋スロープ（段差解消に相当）
  mobility: ['elev', 'slope'],
  // 救護室・医務室相当の設備はデータに存在しない → 該当なし表示
  medical: [],
  other: [],
}

/**
 * カテゴリ配列から必要な属性セットを返す。フィルタ不要(null)の場合: 空 or other/anxietyのみ選択。
 * anxiety（不安になりやすい）はマッチする施設データが存在しないため、他カテゴリと同時に選ばれていても
 * フィルタ条件には加えない（0件表示にはせず、呼び出し側でデータ未整備である旨を案内する）。
 */
export function requiredAttrsForCategories(cats: ConsiderationCategoryId[]): string[] | null {
  const effective = cats.filter((c) => c !== 'other' && c !== 'anxiety')
  if (effective.length === 0) return null
  return [...new Set(effective.flatMap((c) => CATEGORY_ATTR_MAP[c] ?? []))]
}

/** パートナー側の手動フィルタチップ定義 */
export const PARTNER_FILTER_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'elev', label: 'エレベーター' },
  { key: 'toilet', label: '多目的WC' },
  { key: 'slope', label: 'スロープ' },
  { key: 'braille', label: '点字ブロック' },
  { key: 'written', label: '筆談可' },
  { key: 'sign', label: '手話可' },
  { key: 'wc_rental', label: '車椅子貸出' },
]

/**
 * 属性フィルタ（OR条件）を施設リストに適用。
 * attrs=null: フィルタなし（素通し）／attrs=[]: 該当なし（0件）として扱う
 */
export function filterByAttrs<T>(list: T[], attrs: string[] | null): T[] {
  if (!attrs) return list
  if (attrs.length === 0) return []
  return list.filter((f) => {
    const bf = (f as { bf?: Record<string, boolean | undefined> }).bf
    return attrs.some((a) => bf?.[a] === true)
  })
}

// ── 支援ナビ用（コンパス画面→マップ） ──────────────────────────────────

export const NAV_FILTER_KEY = 'helpmark:nav-filter'


/** AEDが必要な配慮事項か（心臓発作など救急対応を要する属性） */
export function isMedicalConsideration(labels: string[]): boolean {
  return labels.some((l) => l.includes('倒れ') || l.includes('心臓') || l.includes('救急'))
}

/** コンパス画面からの自動フィルタ用マッピング（ビーコナー自身の閲覧時とは別定義） */
export const NAV_CATEGORY_ATTR_MAP: Record<ConsiderationCategoryId, string[]> = {
  // 急に倒れる → AEDは別レイヤで常に表示。救護室・駅員室はダミーデータ(support-rooms.json)
  medical: [],
  // エレベーター＋スロープ＋車椅子対応トイレ(=多目的WC)
  mobility: ['elev', 'slope', 'toilet'],
  // 点字ブロック。音声案内設備はデータに無いため、聴覚・伝達系の代替として手話可/筆談を含める
  sensory: ['braille', 'sign', 'written'],
  // 休憩スペース・多目的室に相当するデータは存在しないため、フィルタは行わない
  anxiety: [],
  communication: ['written'],
  other: [],
}

export interface NavFilter {
  attrs: string[] | null
  medical: boolean
}

/**
 * アラートの配慮事項ラベル（人間可読）から支援ナビ用フィルタを導出。
 * カテゴリの正式ラベル一致と、キーワード部分一致の両方で判定する。
 */
export function navFilterFromConsiderations(labels: string[]): NavFilter {
  const joined = labels.join(' ')
  const cats = new Set<ConsiderationCategoryId>()
  for (const label of labels) {
    for (const cat of CONSIDERATION_CATEGORIES) {
      if (label === cat.label || joined.includes(cat.label)) cats.add(cat.id)
    }
  }
  if (isMedicalConsideration(labels)) cats.add('medical')
  if (joined.includes('階段') || joined.includes('車椅子')) cats.add('mobility')
  if (joined.includes('見えづらい') || joined.includes('聞こえづらい')) cats.add('sensory')
  if (joined.includes('不安') || joined.includes('パニック')) cats.add('anxiety')
  if (joined.includes('コミュニケーション')) cats.add('communication')

  const medical = cats.has('medical')
  const attrsSet = new Set<string>()
  for (const c of cats) for (const a of NAV_CATEGORY_ATTR_MAP[c]) attrsSet.add(a)
  return { attrs: attrsSet.size > 0 ? [...attrsSet] : medical ? [] : null, medical }
}
