#!/usr/bin/env node
/**
 * 「だれでも東京」バリアフリー施設情報（public/data/daredemo.json）の、座標の誤りを見つけて、取り除く。
 * 元データには、次のような誤りがある（2026-10-12 に確認）：
 *   - 複数の駅が、同じ座標（新宿駅の位置）になっている（座標を取得できなかったときの代わりの値。110駅が同じ座標）
 *   - 地下鉄の駅が、所属する区から何十km も離れている
 *   - 緯度と経度が入れ替わっている
 * 誤った場所へ案内しないよう、確かめられないものは、取り除く（除いたものは、報告に出す）。
 * 駅（cat: transport）は、元データ全体で信頼できないため、すべて取り除く。
 *
 *   node scripts/clean-daredemo.mjs            # 取り除く対象を表示するだけ
 *   node scripts/clean-daredemo.mjs --write    # public/data/daredemo.json を書き換える
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FILE = fileURLToPath(new URL('../public/data/daredemo.json', import.meta.url))

/** 23区の、おおよその中心（緯度, 経度）。区の外の座標を見つける目安に使う */
export const WARD_CENTERS = {
  千代田区: [35.694, 139.754], 中央区: [35.671, 139.772], 港区: [35.658, 139.751], 新宿区: [35.694, 139.703],
  文京区: [35.708, 139.752], 台東区: [35.713, 139.78], 墨田区: [35.711, 139.801], 江東区: [35.673, 139.817],
  品川区: [35.609, 139.73], 目黒区: [35.634, 139.698], 大田区: [35.561, 139.716], 世田谷区: [35.646, 139.653],
  渋谷区: [35.664, 139.698], 中野区: [35.707, 139.664], 杉並区: [35.699, 139.636], 豊島区: [35.726, 139.717],
  北区: [35.753, 139.737], 荒川区: [35.736, 139.783], 板橋区: [35.751, 139.709], 練馬区: [35.736, 139.652],
  足立区: [35.775, 139.805], 葛飾区: [35.743, 139.847], 江戸川区: [35.707, 139.868],
}

/** 区の中心から、これより離れていたら、誤りとみなす距離（メートル）。駅は厳しく、それ以外は、広い公園などを考えて緩く */
const MAX_FROM_WARD = { transport: 6000, other: 12000 }
/** 同じ座標を、これ以上の数の別の名前が共有していたら、座標を取得できなかった代わりの値とみなす */
const MAX_SHARED_COORDS = 3
/** 人が確認して、座標が誤っているとわかったもの */
const KNOWN_BAD = ['東京臨海広域防災公園']

export function distanceM(a, b, c, d) {
  const R = 6371000
  const p1 = (a * Math.PI) / 180
  const p2 = (c * Math.PI) / 180
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((d - b) * Math.PI) / 360) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** 施設の配列を受け取り、{ kept, removed: [{item, reason}], fixed: [item] } を返す */
export function cleanFacilities(list) {
  const fixed = []
  const items = list.map((x) => {
    // 緯度と経度が入れ替わっているものは、入れ替え直す
    if (x.lat > 100 && x.lng < 100) {
      const y = { ...x, lat: x.lng, lng: x.lat }
      fixed.push(y)
      return y
    }
    return x
  })
  const shared = new Map()
  for (const x of items) {
    const k = `${x.lat},${x.lng}`
    shared.set(k, new Set([...(shared.get(k) ?? []), x.n]))
  }
  const kept = []
  const removed = []
  for (const x of items) {
    const reason = (() => {
      if (KNOWN_BAD.includes(x.n)) return '座標の誤りを確認済み'
      // 東京都（島しょ部を含む）の外の座標：別の場所の同名の施設を取り違えている（例：桜ヶ丘公園が北海道の座標）
      if (x.lat < 20 || x.lat > 36 || x.lng < 136 || x.lng > 154) return '東京都の外の座標'
      // 駅（transport）は、座標が元データ全体で信頼できない（110駅が同じ座標、地下鉄の駅が別の区や多摩地区、など。残った分も、実際の位置と大きくずれている）。
      // 公式の駅の座標（国土交通省の屋内地図、公共交通オープンデータセンター）に置き換えるまで、すべて取り除く
      if (x.cat === 'transport') return '駅の座標が信頼できない（公式データに置き換えるまで除く）'
      // 同じ座標の共有は、駅だけで見る（体育館などは、1つの施設の中の複数の会場が、同じ座標を持つのが自然）
      if (x.cat === 'transport' && (shared.get(`${x.lat},${x.lng}`)?.size ?? 0) >= MAX_SHARED_COORDS) return `同じ座標を${shared.get(`${x.lat},${x.lng}`).size}件が共有（代わりの値）`
      const c = WARD_CENTERS[x.w]
      if (c) {
        const d = distanceM(c[0], c[1], x.lat, x.lng)
        const max = x.cat === 'transport' ? MAX_FROM_WARD.transport : MAX_FROM_WARD.other
        if (d > max) return `${x.w}の中心から${(d / 1000).toFixed(1)}km離れている`
      }
      return null
    })()
    if (reason) removed.push({ item: x, reason })
    else kept.push(x)
  }
  return { kept, removed, fixed }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const list = JSON.parse(readFileSync(FILE, 'utf8'))
  const { kept, removed, fixed } = cleanFacilities(list)
  const byCat = {}
  for (const r of removed) byCat[r.item.cat ?? '(なし)'] = (byCat[r.item.cat ?? '(なし)'] ?? 0) + 1
  console.log(`全${list.length}件 → 残す${kept.length}件 / 取り除く${removed.length}件（${JSON.stringify(byCat)}）/ 入れ替えを直した${fixed.length}件`)
  for (const r of removed) console.log(`  × ${r.item.w ?? ''} ${r.item.n}（${r.item.cat}）：${r.reason}`)
  for (const f of fixed) console.log(`  ○ 緯度経度を入れ替え直した：${f.n}`)
  if (process.argv.includes('--write')) {
    writeFileSync(FILE, JSON.stringify(kept))
    console.log(`${FILE} を書き換えた`)
  } else {
    console.log('（表示だけです。書き換えるには --write を付けてください）')
  }
}
