import { distanceMeters, type Coords } from './location'

/**
 * 「だれでも東京」データ（public/data/daredemo.json・Claude Code整備分）から
 * 最寄りのバリアフリー施設を探す。支援要請送信後の「休憩情報の同時提示」で使用。
 */
export interface RestFacility {
  n: string
  lat: number
  lng: number
  w?: string
  cat?: string
  bf?: Record<string, boolean>
}

export interface NearestRest extends RestFacility {
  distanceM: number
}

export const DAREDEMO_URL = '/data/daredemo.json'
export const AED_URL = '/data/aed.json'
export const SHELTERS_URL = '/data/shelters.json'
/** 緊急避難場所（災害種別つき。災害の種類を選んだときだけ読む）。scripts/import-evac.mjs */
export const EVAC_AREAS_URL = '/data/evac-areas.json'
/** 災害時給水ステーション（東京都水道局の給水拠点）。scripts/import-water.mjs */
export const WATER_URL = '/data/water.json'
/** 救護室・駅員室（公開データが無いためデモ用のダミー） */
export const SUPPORT_ROOMS_URL = '/data/support-rooms.json'

interface PointLike {
  lat: number
  lng: number
}

const pointCache = new Map<string, Promise<unknown[]>>()

/** 静的JSONの点群を一度だけ取得してキャッシュする（失敗時は次回に再取得） */
export function loadPoints<T>(url: string): Promise<T[]> {
  let p = pointCache.get(url)
  if (!p) {
    p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      return res.json() as Promise<unknown[]>
    })
    p.catch(() => pointCache.delete(url))
    pointCache.set(url, p)
  }
  return p as Promise<T[]>
}

/** 座標が有効な点に距離を付け、近い順に並べて返す */
export function sortByDistance<T extends PointLike & { n?: string }>(
  list: T[],
  coords: Coords,
): Array<T & { distanceM: number }> {
  return list
    .filter((f) => f.n && typeof f.lat === 'number' && typeof f.lng === 'number')
    .map((f) => ({ ...f, distanceM: distanceMeters(coords, { latitude: f.lat, longitude: f.lng }) }))
    .sort((a, b) => a.distanceM - b.distanceM)
}

/** 共通：指定URLの点群から最寄りを1件返す */
async function findNearest<T extends PointLike & { n?: string }>(
  url: string,
  coords: Coords,
): Promise<(T & { distanceM: number }) | null> {
  return sortByDistance(await loadPoints<T>(url), coords)[0] ?? null
}

export async function fetchNearestRestFacility(
  coords: Coords | null,
): Promise<NearestRest | null> {
  if (!coords) return null
  try {
    return await findNearest<RestFacility>(DAREDEMO_URL, coords)
  } catch (err) {
    console.warn('[restInfo] 施設データ取得に失敗', err)
    return null
  }
}

/**
 * 最寄りAED（サポーター向け）。出典：東京都オープンデータカタログ
 * 各区AED設置箇所一覧を統合した public/data/aed.json を使用。
 */
export interface AedPoint {
  n: string
  lat: number
  lng: number
  w?: string
  /** 設置階・フロアなどの詳細位置 */
  f?: string
}

export type NearestAed = AedPoint & { distanceM: number }

export async function fetchNearestAed(coords: Coords | null): Promise<NearestAed | null> {
  if (!coords) return null
  try {
    return await findNearest<AedPoint>(AED_URL, coords)
  } catch (err) {
    console.warn('[restInfo] AEDデータ取得に失敗', err)
    return null
  }
}
