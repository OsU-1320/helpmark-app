/**
 * 東京都福祉局「車椅子使用者対応トイレのバリアフリー情報」の整形。
 * 都・区市町村の施設と都内鉄道駅にある、車椅子使用者対応トイレ（多機能トイレ）の一覧。
 * 画面で使う項目だけに絞る：施設名 n・座標・設置フロア f・設備 x（1文字ずつ。下の TOILET_FLAGS）。
 */
import { isMark, normalizeLatLng, round5 } from './opendata.mjs'

/** x に入れる1文字と、元の列見出し（前方一致）。画面側(restInfo.ts の TOILET_FLAG_KEYS)と同じ並び */
export const TOILET_FLAGS = [
  ['o', 'オストメイト用設備がある'],
  ['b', '介助用ベッドを備えている'],
  ['d', '乳幼児用おむつ交換台等を備えている'],
]

const cleanHeader = (s) => String(s).replace(/[\s　]+/g, '')

/** 「35.78, 139.86」のように1つのセルに両方入っている行にも対応して、緯度経度を取り出す */
function readLatLng(r, iLat, iLng) {
  const cell = String(r[iLat] ?? '')
  if (cell.includes(',')) {
    const [a, b] = cell.split(',')
    return normalizeLatLng(a, b)
  }
  return normalizeLatLng(r[iLat], r[iLng])
}

/** CSV（行の配列）→ [{n,lat,lng,f?,x?}]。同じ施設・フロア・場所のトイレは1件にまとめる */
export function parseWheelchairToilets(rows) {
  const header = rows[0].map(cleanHeader)
  const col = (name) => header.findIndex((h) => h.startsWith(cleanHeader(name)))
  const iName = col('施設名')
  const iFloor = col('設置フロア')
  const iLng = col('経度')
  const iLat = col('緯度')
  const iEntrance = col('車椅子が出入りできる')
  const iDoor = col('戸の形式')
  const iDeleted = header.findLastIndex((h) => h.startsWith('データの削除年月'))
  const flagIdx = TOILET_FLAGS.map(([, label]) => col(label))
  if ([iName, iFloor, iLng, iLat, iEntrance, iDoor, iDeleted, ...flagIdx].some((i) => i < 0)) {
    throw new Error('トイレCSVの列見出しが想定と違います: ' + rows[0].join(','))
  }
  const merged = new Map()
  for (const r of rows.slice(1)) {
    const n = (r[iName] ?? '').trim()
    if (!n) continue // 先頭付近の、施設名の無い行
    if ((r[iDeleted] ?? '').trim()) continue // 削除済み
    if (String(r[iEntrance] ?? '').trim().startsWith('×')) continue // 車椅子で出入りできない
    const ll = readLatLng(r, iLat, iLng)
    if (!ll) continue
    const f = (r[iFloor] ?? '').normalize('NFKC').trim()
    let x = ''
    TOILET_FLAGS.forEach(([ch], k) => {
      if (isMark(r[flagIdx[k]])) x += ch
    })
    // 自動ドア（押しボタン・センサー）は、戸の形式が A. か B. で始まる
    if (/^[AB]\./.test((r[iDoor] ?? '').trim())) x += 'a'
    const lat = round5(ll.lat)
    const lng = round5(ll.lng)
    const key = `${n}|${f}|${lat.toFixed(4)}|${lng.toFixed(4)}`
    const prev = merged.get(key)
    if (prev) {
      for (const ch of x) if (!prev.x.includes(ch)) prev.x += ch
    } else {
      merged.set(key, { n, lat, lng, f, x })
    }
  }
  return [...merged.values()].map(({ n, lat, lng, f, x }) => ({
    n,
    lat,
    lng,
    ...(f ? { f } : {}),
    ...(x ? { x: [...x].sort().join('') } : {}),
  }))
}
