#!/usr/bin/env node
/**
 * 東京都水道局「給水拠点一覧データ」＝災害時給水ステーション（CC BY 4.0）を取り込む。
 *   https://catalog.data.metro.tokyo.lg.jp/dataset/t000019d0000000001
 *
 *   node scripts/import-water.mjs
 *
 * 出力：public/data/water.json（約213件。防災モードで表示する）
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseWaterStations } from './lib/water.mjs'
import { fetchText, parseCsv } from './lib/opendata.mjs'

// 水道局が更新するたびにファイル名の日付が変わる。変わったらカタログの最新URLに差し替える
const CSV_URL = 'https://www.opendata.metro.tokyo.lg.jp/suidou/R7/kyoten_20251211.csv'
const out = fileURLToPath(new URL('../public/data/water.json', import.meta.url))

const stations = parseWaterStations(parseCsv(await fetchText(CSV_URL)))
const body = JSON.stringify(stations)
writeFileSync(out, body)
console.log(`water.json: ${stations.length}件, ${Buffer.byteLength(body)}バイト`)
