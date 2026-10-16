import { distanceMeters, type Coords } from './location'
import type { StationFacility } from './stations'

/**
 * 駅の構内図は、運営会社の公式ページへのリンクで案内する（画像は取り込まない）。
 * キーは、駅の施設データ（stations.json）の駅名。リンク先は、運営会社が公開している構内図のページ。
 */
export const STATION_MAP_URLS: Record<string, string> = {
  東京駅: 'https://www.jreast.co.jp/estation/stations/1039.html',
}

/** 駅の内部または周辺にいるとみなす距離（メートル） */
export const STATION_MAP_RADIUS_M = 200

/** 開く前に伝える注記（外部サイトへ移ること） */
export const STATION_MAP_NOTE = '外部サイト（駅を運営する会社の公式ページ）が開きます'

/** 現在地が、構内図のある駅の内部または周辺（200m以内）なら、その駅の名前とURLを返す。いちばん近い駅を選ぶ */
export function nearbyStationMap(
  facilities: StationFacility[],
  coords: Coords,
): { station: string; url: string } | null {
  let best: { station: string; url: string; d: number } | null = null
  for (const f of facilities) {
    const url = STATION_MAP_URLS[f.s]
    if (!url) continue
    const d = distanceMeters(coords, { latitude: f.lat, longitude: f.lng })
    if (d <= STATION_MAP_RADIUS_M && (!best || d < best.d)) best = { station: f.s, url, d }
  }
  return best ? { station: best.station, url: best.url } : null
}
