import { describe, expect, it } from 'vitest'
import {
  DISASTER_TYPES,
  buildDisasterCandidates,
  disasterLabels,
  filterByDisaster,
  supportsDisaster,
} from './disasterType'
import { filterByAttrs } from './mapFilter'

const QUAKE = 1 << 3
const FLOOD = 1 << 0
const TSUNAMI = 1 << 4

describe('災害種別のビット', () => {
  it('8種類すべてが、重ならないビットを持つ', () => {
    expect(DISASTER_TYPES).toHaveLength(8)
    expect(DISASTER_TYPES.reduce((acc, t) => acc | t.bit, 0)).toBe(255)
  })

  it('supportsDisaster：d が無い（不明）ときは対応とみなさない', () => {
    expect(supportsDisaster(QUAKE | FLOOD, 'quake')).toBe(true)
    expect(supportsDisaster(QUAKE | FLOOD, 'tsunami')).toBe(false)
    expect(supportsDisaster(undefined, 'quake')).toBe(false)
    expect(supportsDisaster(0, 'quake')).toBe(false)
  })

  it('disasterLabels：対応する種類の名前を並び順どおり返す', () => {
    expect(disasterLabels(QUAKE | FLOOD)).toEqual(['地震', '洪水'])
    expect(disasterLabels(undefined)).toEqual([])
  })
})

describe('filterByDisaster', () => {
  const list = [
    { n: 'A', d: QUAKE },
    { n: 'B', d: FLOOD },
    { n: 'C' },
  ]
  it('未選択(null)なら素通し', () => {
    expect(filterByDisaster(list, null)).toEqual(list)
  })
  it('選んだ種類に対応するものだけ残す', () => {
    expect(filterByDisaster(list, 'flood').map((p) => p.n)).toEqual(['B'])
  })
  it('バリアフリー絞り込み(filterByAttrs)と併用できる', () => {
    const items = [
      { n: 'A', d: QUAKE, bf: { elev: true } },
      { n: 'B', d: QUAKE, bf: { elev: false } },
      { n: 'C', d: FLOOD, bf: { elev: true } },
    ]
    const r = filterByAttrs(filterByDisaster(items, 'quake'), ['elev'])
    expect(r.map((p) => p.n)).toEqual(['A'])
  })
})

describe('buildDisasterCandidates', () => {
  const shelters = [
    { n: '第一小学校', lat: 35.7, lng: 139.7, d: QUAKE },
    { n: '第二小学校', lat: 35.71, lng: 139.7 },
  ]
  const areas = [
    { n: '第一小学校', lat: 35.70005, lng: 139.7, d: QUAKE | TSUNAMI },
    { n: '中央公園', lat: 35.72, lng: 139.7, d: QUAKE },
    { n: '海浜公園', lat: 35.73, lng: 139.7, d: TSUNAMI },
  ]
  it('未選択なら避難所だけ（今までどおり）', () => {
    const r = buildDisasterCandidates(shelters, areas, null)
    expect(r.map((p) => p.n)).toEqual(['第一小学校', '第二小学校'])
    expect(r.every((p) => p.site === 'shelter')).toBe(true)
  })
  it('種類を選ぶと、対応する避難所と緊急避難場所を出し、同じ施設は避難所側だけ残す', () => {
    const r = buildDisasterCandidates(shelters, areas, 'quake')
    expect(r.map((p) => [p.n, p.site])).toEqual([
      ['第一小学校', 'shelter'],
      ['中央公園', 'area'],
    ])
  })
  it('避難所に津波の情報が無くても、緊急避難場所側が対応していれば出す', () => {
    const r = buildDisasterCandidates(shelters, areas, 'tsunami')
    expect(r.map((p) => [p.n, p.site])).toEqual([
      ['第一小学校', 'area'],
      ['海浜公園', 'area'],
    ])
  })
})
