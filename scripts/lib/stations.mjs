/**
 * 駅の施設データ（public/data/stations.json）への変換。
 * 入力は2種類：
 *   ① GeoJSON … 国土交通省「屋内地図オープンデータ」のShapefileを、ogr2ogrで GeoJSON(WGS84) にしたもの
 *   ② CSV … 駅名,種類,緯度,経度,階,補足（手で作る場合や、公共交通オープンデータセンターの駅情報などから作る場合）
 * 出力の形は src/lib/stations.ts の StationFacility：{ s, k, lat, lng, f?, note?, demo? }
 */
import { normalizeLatLng, round5 } from './opendata.mjs'

/** 種類（アプリ側 StationKind と同じ）。これ以外の種類は取り込まない */
export const STATION_KINDS = ['elevator', 'toilet', 'gate', 'info']

/** 図形の代表点。Point はそのまま、線・面は頂点の平均（部屋の面などの位置の目安として十分） */
export function representativePoint(geometry) {
  if (!geometry) return null
  const pts = []
  const walk = (c) => {
    if (typeof c[0] === 'number') pts.push(c)
    else for (const x of c) walk(x)
  }
  walk(geometry.coordinates ?? [])
  if (pts.length === 0) return null
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return { lat, lng }
}

function toFacility({ station, kind, ll, floor, note, demo }) {
  if (!ll || !STATION_KINDS.includes(kind) || !station) return null
  return {
    s: station,
    k: kind,
    lat: round5(ll.lat),
    lng: round5(ll.lng),
    ...(floor ? { f: String(floor).trim() } : {}),
    ...(note ? { note: String(note).trim() } : {}),
    ...(demo ? { demo: true } : {}),
  }
}

/**
 * GeoJSON → 施設の配列。
 * source = { station | stationField, kindField, kindMap, floorField?, noteField?, demo? }
 *   kindMap … 元データの属性値 → 'elevator' | 'toilet' | 'gate' | 'info'。載っていない値は取り込まない
 */
export function geojsonToFacilities(geojson, source) {
  const out = []
  for (const feat of geojson.features ?? []) {
    const props = feat.properties ?? {}
    const kind = source.kindMap[String(props[source.kindField] ?? '').trim()]
    const f = toFacility({
      // 建物ごとに名前が違うデータ（東京駅周辺の屋内地図など）は、stationField で属性から取る
      station: source.stationField ? props[source.stationField] : source.station,
      kind,
      ll: representativePoint(feat.geometry),
      floor: source.floorField ? props[source.floorField] : '',
      note: source.noteField ? props[source.noteField] : '',
      demo: source.demo,
    })
    if (f) out.push(f)
  }
  return out
}

/** CSV（行の配列。1行目は見出し：駅名,種類,緯度,経度,階,補足）→ 施設の配列 */
export function csvToFacilities(rows, { demo = false } = {}) {
  const header = rows[0].map((h) => h.trim())
  const col = (name) => header.indexOf(name)
  const [iS, iK, iLat, iLng, iF, iNote] = ['駅名', '種類', '緯度', '経度', '階', '補足'].map(col)
  if ([iS, iK, iLat, iLng].some((i) => i < 0)) {
    throw new Error('CSVの1行目は「駅名,種類,緯度,経度,階,補足」にしてください: ' + rows[0].join(','))
  }
  const out = []
  for (const r of rows.slice(1)) {
    const f = toFacility({
      station: (r[iS] ?? '').trim(),
      kind: (r[iK] ?? '').trim(),
      ll: normalizeLatLng(r[iLat], r[iLng]),
      floor: iF >= 0 ? r[iF] : '',
      note: iNote >= 0 ? r[iNote] : '',
      demo,
    })
    if (f) out.push(f)
  }
  return out
}

/** 複数の入力をまとめる。同じ駅・種類・階で、ほぼ同じ場所（約5m以内）は1件にし、駅名→種類→緯度の順に並べる */
export function mergeFacilities(lists) {
  const seen = new Set()
  const out = []
  for (const f of lists.flat()) {
    const key = `${f.s}|${f.k}|${f.f ?? ''}|${f.lat.toFixed(4)}|${f.lng.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out.sort(
    (a, b) =>
      a.s.localeCompare(b.s, 'ja') ||
      STATION_KINDS.indexOf(a.k) - STATION_KINDS.indexOf(b.k) ||
      a.lat - b.lat,
  )
}
