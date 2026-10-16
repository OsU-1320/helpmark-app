import { describe, expect, it } from 'vitest'
import { DISASTER_TYPES } from '../../src/lib/disasterType.ts'
import { DISASTER_COLUMNS, attachDisasterFlags, parseEvacAreas } from './evac.mjs'

const QUAKE = 1 << 3

describe('避難場所データの取り込み', () => {
  it('取り込みスクリプトのビットの並びと、画面側(disasterType.ts)の並びが一致する', () => {
    for (const [i, [id]] of DISASTER_COLUMNS.entries()) {
      expect(DISASTER_TYPES.find((t) => t.id === id)?.bit).toBe(1 << i)
    }
  })

  const header = [
    '区市町村\nコード', '区市町村', '施設名', '所在地住所', '緯度', '経度',
    '洪水', '崖崩れ、土石流及び地滑り', '高潮', '地震', '津波', '大規模な火事', '内水氾濫', '火山現象', 'その他',
    'エレベーター有/\n避難スペースが１階', 'スロープ等', '点字ブロック', '車椅子使用者対応トイレ', 'その他\n（具体的に）',
  ]
  const rows = [
    header,
    ['999991', 'テスト区', 'ダミー公園', 'テスト区ダミー1', '35.6', '139.7', '', '', '', '1', '', '1', '', '', '', '○', '', '', '', ''],
    ['999991', 'テスト区', '座標なし', 'テスト区ダミー2', '', '', '1', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ]
  it('見出しの改行を除いて列を探し、座標の無い行は除く', () => {
    const r = parseEvacAreas(rows)
    expect(r).toHaveLength(1)
    expect(r[0].d).toBe(QUAKE | (1 << 5))
    expect(r[0].bf).toEqual({ elev: true })
  })
  it('既存の避難所に、同じ名前・近い場所の災害種別を付ける', () => {
    const areas = parseEvacAreas(rows)
    const shelters = [
      { n: 'ダミー公園', lat: 35.6, lng: 139.7 },
      { n: '遠い所', lat: 35.9, lng: 139.7 },
    ]
    const r = attachDisasterFlags(shelters, areas)
    expect(r.matched).toBe(1)
    expect(r.shelters[0].d).toBe(QUAKE | (1 << 5))
    expect(r.shelters[1].d).toBeUndefined()
  })
})
