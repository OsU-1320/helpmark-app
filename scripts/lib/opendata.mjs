/**
 * オープンデータ取り込みスクリプトの共通部品（ダウンロード・文字コード判定・CSV解析・タイル分割）。
 * 変換ロジックは各 import-*.mjs から切り出して、サンプルデータでテストできるようにしている。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** バイト列を文字列にする。UTF-8として読めなければ Shift_JIS(CP932) とみなす */
export function decodeText(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('shift_jis').decode(buf)
  }
}

export async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'helpmark-app-data-import' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return decodeText(new Uint8Array(await res.arrayBuffer()))
}

/** 引用符・セル内改行つきのCSVを、行の配列にする（空行は除く） */
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += c
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** 日本付近の緯度経度として妥当なら {lat,lng}。緯度経度が逆なら入れ替える。ダメなら null */
export function normalizeLatLng(a, b) {
  const x = Number(String(a).trim())
  const y = Number(String(b).trim())
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const ok = (lat, lng) => lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154
  if (ok(x, y)) return { lat: x, lng: y }
  if (ok(y, x)) return { lat: y, lng: x }
  return null
}

/** 小数5桁（約1m）に丸める。ファイルサイズを減らすため */
export const round5 = (n) => Math.round(n * 1e5) / 1e5

/** 全角半角・空白・記号をそろえる（名前の突き合わせ用） */
export function normName(s) {
  return String(s)
    .normalize('NFKC')
    .replace(/[\s・\-ー]/g, '')
    .replace(/(東京都|都立|区立|市立)/g, '')
}

/** 「○」「〇」などを真とみなす */
export const isMark = (s) => /^[○〇◯]/.test(String(s ?? '').trim())

// ── タイル分割（0.1度ごとのファイルに分け、画面を開いたときに周辺だけ読む） ──
export const TILE_DEG = 0.1
export const tileKey = (lat, lng) =>
  `${Math.floor(lat / TILE_DEG + 1e-9)}_${Math.floor(lng / TILE_DEG + 1e-9)}`

export function writeJson(path, body) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

/** 点群をタイルに分けて、dir 配下に {緯度番号}_{経度番号}.json と index.json を書く。書いたファイルの情報を返す */
export function writeTiles(dir, points) {
  const tiles = new Map()
  for (const p of points) {
    const key = tileKey(p.lat, p.lng)
    if (!tiles.has(key)) tiles.set(key, [])
    tiles.get(key).push(p)
  }
  const keys = [...tiles.keys()].sort()
  const files = []
  for (const key of keys) {
    const body = JSON.stringify(tiles.get(key))
    writeJson(`${dir}/${key}.json`, body)
    files.push({ key, count: tiles.get(key).length, bytes: Buffer.byteLength(body) })
  }
  writeJson(`${dir}/index.json`, JSON.stringify(keys))
  return files
}
