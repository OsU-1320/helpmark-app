#!/usr/bin/env node
/**
 * 東京都防災マップ「避難所・避難場所一覧データ」（東京都総務局、CC BY 4.0）から、緊急避難場所の
 * 災害種別（洪水・崖崩れ・高潮・地震・津波・大規模火事・内水氾濫・火山現象）を取り込む。
 *   https://catalog.data.metro.tokyo.lg.jp/dataset/t000003d0000000093
 *
 *   node scripts/import-evac.mjs
 *
 * 出力：
 *   public/data/evac-areas.json … 緊急避難場所（都内全域）。d は災害種別のビット列（src/lib/disasterType.ts）
 *   public/data/shelters.json   … 既存の避難所に、同じ場所の緊急避難場所の災害種別 d を付け足す（他の項目は変えない）
 * 再実行しても同じ結果になる（d は毎回付け直す）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { attachDisasterFlags, parseEvacAreas } from './lib/evac.mjs'
import { fetchText, parseCsv } from './lib/opendata.mjs'

const AREA_CSV = 'https://www.opendata.metro.tokyo.lg.jp/soumu/130001_evacuation_area.csv'
const dataDir = fileURLToPath(new URL('../public/data/', import.meta.url))

const areas = parseEvacAreas(parseCsv(await fetchText(AREA_CSV)))
const areasJson = JSON.stringify(areas)
writeFileSync(dataDir + 'evac-areas.json', areasJson)
console.log(`evac-areas.json: ${areas.length}件, ${Buffer.byteLength(areasJson)}バイト`)

const shelters = JSON.parse(readFileSync(dataDir + 'shelters.json', 'utf8'))
const merged = attachDisasterFlags(shelters, areas)
writeFileSync(dataDir + 'shelters.json', JSON.stringify(merged.shelters))
console.log(`shelters.json: ${merged.shelters.length}件のうち、災害種別を付けられたもの ${merged.matched}件`)
