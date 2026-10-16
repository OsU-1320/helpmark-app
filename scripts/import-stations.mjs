#!/usr/bin/env node
/**
 * 駅の施設データ（エレベーター・多機能トイレ・改札など）を、設定ファイルにしたがって
 * public/data/stations.json にまとめる。ダウンロードは行わない（ログインが必要なデータがあるため）。
 * 元データを自分で取得して data-src/ に置いたあとに実行する。設定の書き方は、このファイルの下の説明と、scripts/station-sources.example.json を参照。
 *
 *   node scripts/import-stations.mjs --config=scripts/station-sources.json
 *   node scripts/import-stations.mjs --config=scripts/station-sources.example.json --out=/tmp/stations.json   # 動作確認（出力先を変える）
 *
 * 設定ファイル：{ "sources": [ GeoJSONの入力 | CSVの入力, ... ] }
 *   GeoJSON … { "type":"geojson", "file":"data-src/tokyo.geojson", "station":"東京駅", "kindField":"…", "kindMap":{"元の値":"elevator"}, "floorField":"…", "noteField":"…" }
 *   CSV     … { "type":"csv", "file":"data-src/stations.csv" }   （1行目：駅名,種類,緯度,経度,階,補足）
 * どちらも "demo": true を付けると、画面に「デモ用のダミー」と出る（サンプル用）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { csvToFacilities, geojsonToFacilities, mergeFacilities } from './lib/stations.mjs'
import { decodeText, parseCsv } from './lib/opendata.mjs'

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const configPath = arg('config')
if (!configPath) {
  console.error('使い方: node scripts/import-stations.mjs --config=scripts/station-sources.json [--out=出力先]')
  process.exit(1)
}
const out = arg('out') ?? fileURLToPath(new URL('../public/data/stations.json', import.meta.url))
const baseDir = dirname(resolve(configPath))
const config = JSON.parse(readFileSync(configPath, 'utf8'))

const lists = config.sources.map((src) => {
  const file = resolve(baseDir, src.file)
  if (src.type === 'geojson') return geojsonToFacilities(JSON.parse(readFileSync(file, 'utf8')), src)
  if (src.type === 'csv') return csvToFacilities(parseCsv(decodeText(readFileSync(file))), { demo: src.demo })
  throw new Error(`type は geojson か csv です: ${src.type}`)
})
const facilities = mergeFacilities(lists)
const body = JSON.stringify(facilities)
writeFileSync(out, body)
const stations = new Set(facilities.map((f) => f.s))
console.log(`${out}: ${facilities.length}件 / ${stations.size}駅 / ${Buffer.byteLength(body)}バイト`)
