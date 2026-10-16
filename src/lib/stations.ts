import { distanceMeters, type Coords } from './location'
import { loadPoints } from './restInfo'
import type { ConsiderationCategoryId } from './profile'

/**
 * 駅の施設（エレベーター・多機能トイレ・改札など）の受け皿。
 * データは public/data/stations.json（駅ごとの施設を、座標つきで並べた配列）。
 * 作り方は scripts/import-stations.mjs。ファイルが空・無い・壊れているときは、
 * 何も表示せず、ほかの表示にも影響しない（地図の画像は扱わない）。
 */
export const STATIONS_URL = '/data/stations.json'

export type StationKind = 'elevator' | 'toilet' | 'gate' | 'info'

export const STATION_KIND_LABELS: Record<StationKind, string> = {
  elevator: 'エレベーター',
  toilet: '多機能トイレ',
  gate: '改札',
  info: '駅員・案内所',
}

export interface StationFacility {
  /** 駅名（例：新宿駅） */
  s: string
  k: StationKind
  lat: number
  lng: number
  /** 階（例：B1F） */
  f?: string
  /** 補足（例：東口改札の近く） */
  note?: string
  /** 架空のサンプルデータ。画面に「デモ用のダミー」と出す */
  demo?: boolean
}

export type NearStationFacility = StationFacility & { distanceM: number }

const KINDS = Object.keys(STATION_KIND_LABELS) as StationKind[]

/** 読み込んだJSONから、形が正しい行だけを残す（壊れた行があっても画面は壊さない） */
export function sanitizeStationFacilities(raw: unknown): StationFacility[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (r): r is StationFacility =>
      !!r &&
      typeof r.s === 'string' &&
      r.s !== '' &&
      KINDS.includes(r.k) &&
      typeof r.lat === 'number' &&
      typeof r.lng === 'number' &&
      Number.isFinite(r.lat) &&
      Number.isFinite(r.lng),
  )
}

/** 駅の施設データを読む。データが無い・読めないときは空配列（例外にしない） */
export async function loadStationFacilities(): Promise<StationFacility[]> {
  try {
    return sanitizeStationFacilities(await loadPoints<unknown>(STATIONS_URL))
  } catch {
    return []
  }
}

/**
 * 配慮事項に応じて出す種類。「できないことがある」はエレベーターと多機能トイレに絞る。
 * それ以外は、すべての種類（null）。
 */
export function stationKindsFor(categories: ConsiderationCategoryId[]): StationKind[] | null {
  return categories.includes('mobility') ? ['elevator', 'toilet'] : null
}

/** 階の並べ替え用の数値（B2F=-2、B1F=-1、1F=1、2F=2。読めないものは最後） */
function floorOrder(f: string): number {
  const m = /^(B)?(\d+)/i.exec(f)
  if (!m) return 99
  return (m[1] ? -1 : 1) * Number(m[2])
}

/** 同じ場所とみなす距離（メートル）。エレベーターなどは、階ごとに同じ位置に点がある */
const SAME_PLACE_M = 25

/**
 * 近い順に、半径内・種類で絞って limit 件まで。
 * 同じ駅（建物）・同じ種類で、ほぼ同じ場所にあるもの（階違いのエレベーターなど）は、1件にまとめ、階を「B1F・1F」のように並べる。
 */
export function nearbyStationFacilities(
  list: StationFacility[],
  coords: Coords,
  radiusM: number,
  kinds: StationKind[] | null,
  limit = 8,
): NearStationFacility[] {
  const near = list
    .filter((f) => !kinds || kinds.includes(f.k))
    .map((f) => ({ ...f, distanceM: distanceMeters(coords, { latitude: f.lat, longitude: f.lng }) }))
    .filter((f) => f.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)

  const groups: Array<{ head: NearStationFacility; floors: Set<string> }> = []
  for (const f of near) {
    const g = groups.find(
      (x) =>
        x.head.s === f.s &&
        x.head.k === f.k &&
        distanceMeters({ latitude: x.head.lat, longitude: x.head.lng }, { latitude: f.lat, longitude: f.lng }) <= SAME_PLACE_M,
    )
    if (g) {
      if (f.f) g.floors.add(f.f)
    } else {
      groups.push({ head: f, floors: new Set(f.f ? [f.f] : []) })
    }
  }
  return groups.slice(0, limit).map(({ head, floors }) => {
    const sorted = [...floors].sort((a, b) => floorOrder(a) - floorOrder(b))
    const { f: _f, ...rest } = head
    void _f
    return { ...rest, ...(sorted.length ? { f: sorted.join('・') } : {}) }
  })
}
