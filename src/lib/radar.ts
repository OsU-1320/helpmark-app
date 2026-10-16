/**
 * 簡易の周辺図（レーダー型）の座標計算。現在地を中心に、北を上にして、方角と距離だけで点を置く。
 * 地図の画像は使わない（アプリを軽く保つ）。図の大きさは、半径 radiusPx のピクセルで表す。
 */
export interface RadarPoint {
  x: number
  y: number
}

/** 方位角（北=0・時計回り・度）と距離から、中心を (0,0)、右を +x、下を +y とした位置を返す。maxM を超えたら、外周に置く */
export function radarPoint(bearingDeg: number, distanceM: number, maxM: number, radiusPx: number): RadarPoint {
  const r = (Math.min(Math.max(distanceM, 0), maxM) / maxM) * radiusPx
  const rad = (bearingDeg * Math.PI) / 180
  return { x: r * Math.sin(rad), y: -r * Math.cos(rad) }
}

/** 同心円の距離（メートル）。半径の 1/3・2/3・全体。見やすい丸い数字にそろえる */
export function ringDistances(maxM: number): number[] {
  return [maxM / 3, (maxM * 2) / 3, maxM].map((m) => Math.round(m / 50) * 50 || Math.round(m))
}

/** 「100m」「1km」のような、輪の目印の文字 */
export function ringLabel(m: number): string {
  return m >= 1000 ? `${m / 1000}km` : `${m}m`
}
