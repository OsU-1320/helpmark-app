/**
 * 東京都水道局「給水拠点一覧データ」（災害時給水ステーション）の整形。
 * 区部・多摩の約213か所。種別によって、災害時に水を受け取れる方法が違う。
 */
import { normalizeLatLng, round5 } from './opendata.mjs'

/**
 * 種別の文字列を、画面に出す短い言葉にする。
 * 応急給水槽（公園・学校などの地下の貯水槽）／浄水場・給水所 など。分類できないときは元の文字列のまま。
 */
export function shortKind(kind) {
  const k = String(kind ?? '').trim()
  if (k.includes('応急給水槽')) return '応急給水槽'
  if (k.includes('浄水場') || k.includes('給水所')) return '浄水場・給水所'
  return k.replace(/（.*?）/g, '')
}

/** CSV（行の配列）→ [{n,lat,lng,k,addr}]。座標の無い行は除く */
export function parseWaterStations(rows) {
  const header = rows[0].map((h) => String(h).trim())
  const col = (name) => header.findIndex((h) => h.startsWith(name))
  const iName = col('施設名')
  const iLat = col('緯度')
  const iLng = col('経度')
  const iKind = col('種別')
  const iAddr = col('所在地')
  if ([iName, iLat, iLng, iKind, iAddr].some((i) => i < 0)) {
    throw new Error('給水拠点CSVの列見出しが想定と違います: ' + rows[0].join(','))
  }
  const out = []
  for (const r of rows.slice(1)) {
    const ll = normalizeLatLng(r[iLat], r[iLng])
    const n = (r[iName] ?? '').trim()
    if (!ll || !n) continue
    out.push({
      n,
      lat: round5(ll.lat),
      lng: round5(ll.lng),
      k: shortKind(r[iKind]),
      addr: (r[iAddr] ?? '').replace(/^東京都/, '').trim(),
    })
  }
  return out
}
