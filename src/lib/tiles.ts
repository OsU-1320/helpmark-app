import { loadPoints } from './restInfo'
import type { Coords } from './location'

/**
 * 点の数が多いデータ（公衆トイレ約8千件）は、0.1度（約9〜11km）四方のタイルに分けて置き、
 * 現在地の周辺のタイルだけを読み込む。タイル分けは scripts/lib/opendata.mjs の writeTiles と同じ式。
 * 置き場所：public/data/<名前>/index.json（あるタイル名の一覧）と <緯度番号>_<経度番号>.json
 */
export const TILE_DEG = 0.1

export function tileKey(lat: number, lng: number): string {
  return `${Math.floor(lat / TILE_DEG + 1e-9)}_${Math.floor(lng / TILE_DEG + 1e-9)}`
}

/** 現在地から radiusM 以内が含まれうるタイルの名前（最大4つ） */
export function tileKeysAround(center: { latitude: number; longitude: number }, radiusM: number): string[] {
  const dLat = radiusM / 111000
  const dLng = radiusM / (111000 * Math.cos((center.latitude * Math.PI) / 180))
  const keys = new Set<string>()
  for (const lat of [center.latitude - dLat, center.latitude + dLat]) {
    for (const lng of [center.longitude - dLng, center.longitude + dLng]) {
      keys.add(tileKey(lat, lng))
    }
  }
  return [...keys]
}

/** 周辺のタイルを読んで、点を1つの配列にして返す。タイルが無い場所は空配列（失敗ではない） */
export async function loadTiledPoints<T>(baseUrl: string, center: Coords, radiusM: number): Promise<T[]> {
  const index = new Set(await loadPoints<string>(`${baseUrl}/index.json`))
  const wanted = tileKeysAround(center, radiusM).filter((k) => index.has(k))
  const tiles = await Promise.all(wanted.map((k) => loadPoints<T>(`${baseUrl}/${k}.json`)))
  return tiles.flat()
}
