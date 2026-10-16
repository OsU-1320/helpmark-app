#!/usr/bin/env node
/**
 * 東京都福祉局「車椅子使用者対応トイレのバリアフリー情報」（CC BY 4.0）を取り込む。
 *   https://catalog.data.metro.tokyo.lg.jp/dataset/t000054d0000000342
 *
 *   node scripts/import-toilets.mjs
 *
 * 出力：public/data/toilets/index.json と、0.1度ごとのタイル {緯度番号}_{経度番号}.json
 * 約8千件で1ファイルが大きくなるため、現在地の周辺のタイルだけを画面で読み込む（src/lib/tiles.ts）。
 */
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseWheelchairToilets } from './lib/toilets.mjs'
import { fetchText, parseCsv, writeTiles } from './lib/opendata.mjs'

const CSV_URL = 'https://www.opendata.metro.tokyo.lg.jp/fukushi/R07/01/3_koukyoshisetsu_barieer_free_wc.csv'
const outDir = fileURLToPath(new URL('../public/data/toilets', import.meta.url))

const toilets = parseWheelchairToilets(parseCsv(await fetchText(CSV_URL)))
rmSync(outDir, { recursive: true, force: true }) // 前回のタイルが残らないように作り直す
const files = writeTiles(outDir, toilets)
const total = files.reduce((s, f) => s + f.bytes, 0)
const max = files.reduce((m, f) => (f.bytes > m.bytes ? f : m))
console.log(`toilets: ${toilets.length}件 / ${files.length}タイル / 合計${total}バイト / 最大 ${max.key}.json=${max.bytes}バイト`)
