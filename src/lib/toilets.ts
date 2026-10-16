import type { Coords } from './location'
import { loadTiledPoints } from './tiles'

/**
 * 車椅子使用者対応トイレ（東京都福祉局「車椅子使用者対応トイレのバリアフリー情報」）。
 * 取り込み：scripts/import-toilets.mjs → public/data/toilets/（タイル分割）。
 * ファイルでは設備を1文字（x）にして容量を減らしている。画面では bf のキーに直して使う。
 */
export const TOILETS_DIR = '/data/toilets'

export interface RawToilet {
  n: string
  lat: number
  lng: number
  /** 設置フロア（例：1F、B1F） */
  f?: string
  /** 設備：o=オストメイト b=介助用ベッド d=おむつ交換台 a=自動ドア */
  x?: string
}

export interface ToiletPlace {
  n: string
  lat: number
  lng: number
  f?: string
  bf: Record<string, boolean>
}

/** scripts/lib/toilets.mjs の TOILET_FLAGS（o,b,d）と、自動ドア(a)に対応 */
export const TOILET_FLAG_KEYS: Record<string, string> = {
  o: 'ostomate',
  b: 'bed',
  d: 'baby',
  a: 'auto',
}

export function expandToilet(t: RawToilet): ToiletPlace {
  const bf: Record<string, boolean> = { toilet: true }
  for (const ch of t.x ?? '') {
    const key = TOILET_FLAG_KEYS[ch]
    if (key) bf[key] = true
  }
  return { n: t.n, lat: t.lat, lng: t.lng, ...(t.f ? { f: t.f } : {}), bf }
}

export async function fetchNearbyToilets(center: Coords, radiusM: number): Promise<ToiletPlace[]> {
  return (await loadTiledPoints<RawToilet>(TOILETS_DIR, center, radiusM)).map(expandToilet)
}

/**
 * 設備での絞り込み（支援している方の配慮事項／パートナーの手動絞り込み）に、トイレを出すか。
 * 絞り込みが無ければ出す。あれば、車椅子対応トイレ('toilet')を含むときだけ出す。
 */
export function toiletsMatchAttrs(groups: Array<string[] | null>): boolean {
  return groups.every((g) => !g || g.includes('toilet'))
}
