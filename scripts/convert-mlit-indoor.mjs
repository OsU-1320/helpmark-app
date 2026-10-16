#!/usr/bin/env node
/**
 * 国土交通省「屋内地図オープンデータ」のShapefile（設備POI＝*_Facility.shp）を、1つのGeoJSON（WGS84）にまとめる。
 * ogr2ogr（GDAL）が必要：brew install gdal。ダウンロードは行わない（ログインが必要なデータのため）。
 *
 *   node scripts/convert-mlit-indoor.mjs --in=data-src/tokyo --out=data-src/tokyo-poi.geojson
 *
 * 出力の各点の属性：category（設備の種類コード。設備凡例のPDFの F012=エレベーター など）、
 *   building（建物・施設の名前。フォルダ名から）、floor（階。同じ階の Floor レイヤーの short_name、無ければ name）
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const input = arg('in')
const output = arg('out')
if (!input || !output) {
  console.error('使い方: node scripts/convert-mlit-indoor.mjs --in=<Shapefileを解凍したフォルダ> --out=<出力する.geojson>')
  process.exit(1)
}

/** 「1.JR東京駅」→「東京駅」のように、フォルダ名から、画面に出す建物の名前を作る */
export function buildingName(folder) {
  const name = folder.replace(/^\d+\./, '')
  if (name === 'JR東京駅') return '東京駅'
  if (name === '地下鉄_公共通路') return '東京駅周辺の地下通路'
  return name
}

function walk(dir, found = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, found)
    else if (e.endsWith('_Facility.shp')) found.push(p)
  }
  return found
}

/** ogr2ogr で、Shapefile → GeoJSON（WGS84）。属性の文字コードはUTF-8（このデータのDBFはUTF-8） */
function readLayer(shp) {
  const out = execFileSync('ogr2ogr', ['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', '--config', 'SHAPE_ENCODING', 'UTF-8', '/vsistdout/', shp], {
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out.toString('utf8'))
}

const features = []
for (const shp of walk(input).sort()) {
  const parts = shp.split('/')
  const building = buildingName(parts[parts.length - 3])
  const floors = new Map()
  try {
    for (const f of readLayer(shp.replace('_Facility.shp', '_Floor.shp')).features ?? []) {
      floors.set(f.properties.id, f.properties.short_name || f.properties.name || '')
    }
  } catch {
    /* 階のレイヤーが読めなくても、階なしで続ける */
  }
  for (const f of readLayer(shp).features ?? []) {
    features.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: { category: f.properties.category, building, floor: floors.get(f.properties.floor_id) ?? '' },
    })
  }
}
writeFileSync(output, JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`${output}: ${features.length}件`)
