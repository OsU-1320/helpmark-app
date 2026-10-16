/**
 * 防災モードの「災害の種類」での絞り込み。
 * 東京都防災マップの避難場所データにある災害種別8フラグを、整数のビット列 d に詰めて持つ
 * （public/data/evac-areas.json と shelters.json。作り方は scripts/import-evac.mjs）。
 * d が無い避難所は「どの災害に対応するか不明」なので、種類を選んだときは出さない。
 */

export type DisasterTypeId =
  | 'quake'
  | 'flood'
  | 'tsunami'
  | 'surge'
  | 'landslide'
  | 'fire'
  | 'inland'
  | 'volcano'

/** bit は scripts/lib/evac.mjs の DISASTER_COLUMNS の並び（flood=1, landslide=2, surge=4, quake=8 …）と一致させる */
export const DISASTER_TYPES: Array<{ id: DisasterTypeId; label: string; bit: number }> = [
  { id: 'quake', label: '地震', bit: 1 << 3 },
  { id: 'flood', label: '洪水', bit: 1 << 0 },
  { id: 'tsunami', label: '津波', bit: 1 << 4 },
  { id: 'surge', label: '高潮', bit: 1 << 2 },
  { id: 'landslide', label: '崖崩れ', bit: 1 << 1 },
  { id: 'fire', label: '大規模火事', bit: 1 << 5 },
  { id: 'inland', label: '内水氾濫', bit: 1 << 6 },
  { id: 'volcano', label: '火山現象', bit: 1 << 7 },
]

export function disasterBit(id: DisasterTypeId): number {
  return DISASTER_TYPES.find((t) => t.id === id)?.bit ?? 0
}

/** d が、その災害種別に対応しているか。d が無い（不明）ときは false */
export function supportsDisaster(d: number | undefined, id: DisasterTypeId): boolean {
  return typeof d === 'number' && (d & disasterBit(id)) !== 0
}

/** d に含まれる災害種別のラベル一覧（表示順は DISASTER_TYPES の並び） */
export function disasterLabels(d: number | undefined): string[] {
  if (typeof d !== 'number') return []
  return DISASTER_TYPES.filter((t) => (d & t.bit) !== 0).map((t) => t.label)
}

/** type が null なら素通し。選ばれていれば、対応している点だけ残す */
export function filterByDisaster<T extends { d?: number }>(list: T[], type: DisasterTypeId | null): T[] {
  if (!type) return list
  return list.filter((p) => supportsDisaster(p.d, type))
}

interface SitePoint {
  n: string
  lat: number
  lng: number
  d?: number
}

const normalizeName = (s: string) => s.normalize('NFKC').replace(/[\s・\-ー]/g, '')

/** 緯度経度から、おおよその距離(m)。同じ場所かどうかの判定にだけ使う */
function roughMeters(a: SitePoint, b: SitePoint): number {
  const dy = (a.lat - b.lat) * 111000
  const dx = (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

export type SiteKind = 'shelter' | 'area'

/**
 * 防災モードの候補を作る。
 * - type が null：避難所だけ（今までどおり）
 * - type あり：その災害に対応する避難所 ＋ 対応する緊急避難場所。
 *   同じ施設が両方にあるとき（名前が同じで150m以内）は、避難所の側だけ残す
 */
export function buildDisasterCandidates<T extends SitePoint>(
  shelters: T[],
  areas: T[],
  type: DisasterTypeId | null,
): Array<T & { site: SiteKind }> {
  const s = filterByDisaster(shelters, type).map((p) => ({ ...p, site: 'shelter' as const }))
  if (!type) return s
  const names = new Map<string, T[]>()
  for (const p of s) {
    const k = normalizeName(p.n)
    names.set(k, [...(names.get(k) ?? []), p])
  }
  const a = filterByDisaster(areas, type)
    .filter((p) => !(names.get(normalizeName(p.n)) ?? []).some((q) => roughMeters(p, q) <= 150))
    .map((p) => ({ ...p, site: 'area' as const }))
  return [...s, ...a]
}
