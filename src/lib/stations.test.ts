import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadStationFacilities,
  nearbyStationFacilities,
  sanitizeStationFacilities,
  stationKindsFor,
  type StationFacility,
} from './stations'
// 実データが無くても動くことを確かめるための、架空の駅（明示的にダミー）
import sample from '../../scripts/sample/stations.sample.json'

const here = { latitude: 35.0, longitude: 135.0, accuracy: 10 }

describe('sanitizeStationFacilities', () => {
  it('配列でなければ空、壊れた行は捨てる', () => {
    expect(sanitizeStationFacilities(null)).toEqual([])
    expect(sanitizeStationFacilities({})).toEqual([])
    expect(sanitizeStationFacilities([])).toEqual([])
    const r = sanitizeStationFacilities([
      { s: '', k: 'elevator', lat: 1, lng: 2 },
      { s: 'A駅', k: 'unknown', lat: 1, lng: 2 },
      { s: 'A駅', k: 'gate', lat: 'x', lng: 2 },
      { s: 'A駅', k: 'gate', lat: 1, lng: 2 },
      null,
    ])
    expect(r).toHaveLength(1)
  })

  it('サンプルデータはすべて有効で、ダミーと分かる', () => {
    const r = sanitizeStationFacilities(sample)
    expect(r.length).toBe((sample as unknown[]).length)
    expect(r.every((f) => f.demo === true)).toBe(true)
    expect(r.every((f) => f.s.includes('ダミー'))).toBe(true)
  })
})

describe('nearbyStationFacilities（サンプルデータ）', () => {
  const list = sanitizeStationFacilities(sample)

  it('近い順に、半径内だけを返す', () => {
    const r = nearbyStationFacilities(list, here, 300, null)
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((f) => f.distanceM <= 300)).toBe(true)
    expect([...r].sort((a, b) => a.distanceM - b.distanceM)).toEqual(r)
  })

  it('種類で絞れる（できないことがある＝エレベーター・多機能トイレ）', () => {
    const kinds = stationKindsFor(['mobility'])
    expect(kinds).toEqual(['elevator', 'toilet'])
    const r = nearbyStationFacilities(list, here, 300, kinds)
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((f) => f.k === 'elevator' || f.k === 'toilet')).toBe(true)
    expect(stationKindsFor(['sensory'])).toBeNull()
  })

  it('件数の上限と、遠い場所では空', () => {
    expect(nearbyStationFacilities(list, here, 300, null, 2)).toHaveLength(2)
    expect(nearbyStationFacilities(list, { ...here, latitude: 36.0 }, 300, null)).toEqual([])
  })

  it('データが空でも壊れない', () => {
    expect(nearbyStationFacilities([] as StationFacility[], here, 300, null)).toEqual([])
  })
})

describe('loadStationFacilities', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('ファイルが無い（404）／JSONでない場合は、例外にせず空配列', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
    expect(await loadStationFacilities()).toEqual([])
  })
})

describe('nearbyStationFacilities（階違いの同じ場所は1件にまとめる）', () => {
  const at = (lat: number, f: string, k: StationFacility['k'] = 'elevator', s = 'A駅'): StationFacility => ({ s, k, lat, lng: 135, f })
  const list = [at(35.0001, 'B1F'), at(35.0001, '1F'), at(35.0001, 'B2F'), at(35.0001, '1F', 'toilet'), at(35.0002, '2F', 'elevator', 'B棟')]

  it('同じ駅・同じ種類・近い場所は、階を並べて1件にする', () => {
    const r = nearbyStationFacilities(list, here, 300, null)
    const lift = r.find((x) => x.s === 'A駅' && x.k === 'elevator')
    expect(lift?.f).toBe('B2F・B1F・1F')
    // 種類が違う・建物が違うものは、まとめない
    expect(r).toHaveLength(3)
  })

  it('階のデータが無いものも、まとめられる（階は付かない）', () => {
    const r = nearbyStationFacilities([{ s: 'A駅', k: 'gate', lat: 35.0001, lng: 135 }, { s: 'A駅', k: 'gate', lat: 35.0001, lng: 135 }], here, 300, null)
    expect(r).toHaveLength(1)
    expect(r[0].f).toBeUndefined()
  })

  it('離れた場所（25m超）の同じ種類は、別の件', () => {
    const r = nearbyStationFacilities([at(35.0001, '1F'), at(35.001, '1F')], here, 300, null)
    expect(r).toHaveLength(2)
  })
})
