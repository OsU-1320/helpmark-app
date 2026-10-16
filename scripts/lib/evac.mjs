/**
 * 東京都防災マップ「避難場所一覧データ」（緊急避難場所）の整形。
 * 災害種別8フラグを、ビット列（整数）1つにまとめる。並びは src/lib/disasterType.ts の DISASTER_TYPES と同じ。
 */
import { isMark, normName, normalizeLatLng, round5 } from './opendata.mjs'

/** ビットの並び（下位から）。列見出しの前方一致で探す */
export const DISASTER_COLUMNS = [
  ['flood', '洪水'],
  ['landslide', '崖崩れ'],
  ['surge', '高潮'],
  ['quake', '地震'],
  ['tsunami', '津波'],
  ['fire', '大規模な火事'],
  ['inland', '内水氾濫'],
  ['volcano', '火山現象'],
]

const BF_COLUMNS = [
  ['elev', 'エレベーター'],
  ['slope', 'スロープ'],
  ['braille', '点字ブロック'],
  ['toilet', '車椅子使用者対応トイレ'],
]

const cleanHeader = (s) => String(s).replace(/\s+/g, '')

/** 避難場所CSV（行の配列）→ [{n,lat,lng,addr,d,bf?}]。座標の無い行は除く */
export function parseEvacAreas(rows) {
  const header = rows[0].map(cleanHeader)
  const col = (name) => header.findIndex((h) => h.startsWith(name))
  const iName = col('施設名')
  const iAddr = col('所在地住所')
  const iLat = col('緯度')
  const iLng = col('経度')
  const disIdx = DISASTER_COLUMNS.map(([, label]) => col(label))
  const bfIdx = BF_COLUMNS.map(([, label]) => col(label))
  if ([iName, iAddr, iLat, iLng, ...disIdx, ...bfIdx].some((i) => i < 0)) {
    throw new Error('避難場所CSVの列見出しが想定と違います: ' + rows[0].join(','))
  }
  const out = []
  for (const r of rows.slice(1)) {
    const ll = normalizeLatLng(r[iLat], r[iLng])
    const n = (r[iName] ?? '').trim()
    if (!ll || !n) continue
    let d = 0
    disIdx.forEach((i, bit) => {
      if (String(r[i] ?? '').trim() !== '') d |= 1 << bit
    })
    // 容量を減らすため、真の項目だけ書く（無い項目は「なし」として扱われる）
    const bf = {}
    BF_COLUMNS.forEach(([key], k) => {
      if (isMark(r[bfIdx[k]])) bf[key] = true
    })
    out.push({
      n,
      lat: round5(ll.lat),
      lng: round5(ll.lng),
      addr: (r[iAddr] ?? '').trim(),
      d,
      ...(Object.keys(bf).length > 0 ? { bf } : {}),
    })
  }
  return out
}

const metersBetween = (a, b) => {
  const dy = (a.lat - b.lat) * 111000
  const dx = (a.lng - b.lng) * 111000 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

/**
 * 避難所（バリアフリー5項目つき・災害種別なし）に、同じ場所にある緊急避難場所の災害種別を付ける。
 * 突き合わせは「名前が同じ（表記ゆれをそろえて比較）かつ 150m 以内」。一致しなければ d を付けない（=不明）。
 * 同じ施設が複数見つかったら、フラグを合算する。
 */
export function attachDisasterFlags(shelters, areas, maxMeters = 150) {
  const byName = new Map()
  for (const a of areas) {
    const k = normName(a.n)
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(a)
  }
  let matched = 0
  const result = shelters.map((s) => {
    const { d: _old, ...rest } = s
    let d = 0
    for (const a of byName.get(normName(s.n)) ?? []) {
      if (metersBetween(s, a) <= maxMeters) d |= a.d
    }
    if (d === 0) return rest
    matched++
    return { ...rest, d }
  })
  return { shelters: result, matched }
}
