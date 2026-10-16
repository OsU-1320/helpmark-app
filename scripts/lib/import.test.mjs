// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeText, normalizeLatLng, parseCsv, tileKey } from './opendata.mjs'
import { parseWheelchairToilets } from './toilets.mjs'
import { parseWaterStations, shortKind } from './water.mjs'
import { csvToFacilities, geojsonToFacilities, mergeFacilities, representativePoint } from './stations.mjs'

const sample = (name) => readFileSync(new URL(`../sample/${name}`, import.meta.url), 'utf8')

describe('opendata 共通部品', () => {
  it('parseCsv：引用符・セル内改行・空行', () => {
    const rows = parseCsv('a,"b\nc",d\r\n\r\n1,"x,y",""""\n')
    expect(rows).toEqual([['a', 'b\nc', 'd'], ['1', 'x,y', '"']])
  })

  it('decodeText：UTF-8 と Shift_JIS を判別する', () => {
    expect(decodeText(new TextEncoder().encode('東京都'))).toBe('東京都')
    // 「東京」を Shift_JIS で表したバイト列
    expect(decodeText(new Uint8Array([0x93, 0x8c, 0x8b, 0x9e]))).toBe('東京')
  })

  it('normalizeLatLng：逆順は入れ替え、範囲外・数字でないものは null', () => {
    expect(normalizeLatLng('35.6', '139.7')).toEqual({ lat: 35.6, lng: 139.7 })
    expect(normalizeLatLng('139.7', '35.6')).toEqual({ lat: 35.6, lng: 139.7 })
    expect(normalizeLatLng('', '139.7')).toBeNull()
    expect(normalizeLatLng('0', '0')).toBeNull()
  })

  it('tileKey：画面側(src/lib/tiles.ts)と同じ値になる', () => {
    expect(tileKey(35.69, 139.7)).toBe('356_1397')
  })
})

describe('車椅子使用者対応トイレの整形', () => {
  const header = [
    '管理者種別番号', '施設名', '設置フロア', '経度', '緯度', '戸の形式',
    '車椅子が出入りできる（出入口の有効幅員80cm以上）',
    'オストメイト用設備がある', '介助用ベッドを備えている', '乳幼児用おむつ交換台等を備えている',
    'データの作成年月 ', ' データの削除年月',
  ]
  const row = (o) => [
    '99999', o.n, o.f ?? '1F', o.lng ?? '139.7', o.lat ?? '35.6', o.door ?? 'C.手動引き戸', o.ent ?? '○',
    o.o ?? '×', o.b ?? '×', o.d ?? '×', '202401', o.del ?? '',
  ]

  it('設備を1文字にまとめ、同じ施設・階・場所は1件に統合する', () => {
    const r = parseWheelchairToilets([
      header,
      row({ n: 'ダミー施設', o: '○', door: 'A.自動引き戸（押しボタン）' }),
      row({ n: 'ダミー施設', b: '○' }),
      row({ n: 'ダミー施設', f: '2F', d: '〇' }),
    ])
    expect(r).toEqual([
      { n: 'ダミー施設', lat: 35.6, lng: 139.7, f: '1F', x: 'abo' },
      { n: 'ダミー施設', lat: 35.6, lng: 139.7, f: '2F', x: 'd' },
    ])
  })

  it('削除済み・名前なし・座標なし・車椅子で出入りできないものは除く。「緯度, 経度」入りのセルも読む', () => {
    const r = parseWheelchairToilets([
      header,
      row({ n: 'ダミー削除', del: '202501' }),
      row({ n: '' }),
      row({ n: 'ダミー座標なし', lat: '', lng: '' }),
      row({ n: 'ダミー出入不可', ent: '×' }),
      row({ n: 'ダミー1セル', lat: '35.61, 139.71', lng: '' }),
    ])
    expect(r).toEqual([{ n: 'ダミー1セル', lat: 35.61, lng: 139.71, f: '1F' }])
  })

  it('列見出しが違うときは、黙って壊れたデータを作らずに失敗する', () => {
    expect(() => parseWheelchairToilets([['a', 'b']])).toThrow()
  })
})

describe('給水拠点の整形', () => {
  it('shortKind：種別を短い言葉にする', () => {
    expect(shortKind('震災対策用応急給水槽（1500立方メートル槽）')).toBe('応急給水槽')
    expect(shortKind('小規模応急給水槽（100立方メートル槽）')).toBe('応急給水槽')
    expect(shortKind('浄水場・給水所')).toBe('浄水場・給水所')
    expect(shortKind('')).toBe('')
  })

  it('座標のある行だけを、必要な項目に絞る', () => {
    const rows = [
      ['番号', '緯度', '経度', '施設名', '種別', '確保水量（立方メートル）', '所在地'],
      ['1', '35.69', '139.74', 'ダミー公園', '小規模応急給水槽（100立方メートル槽）', '100', '東京都テスト区1-1'],
      ['2', '', '', '座標なし', '浄水場・給水所', '', '東京都テスト区2-2'],
    ]
    expect(parseWaterStations(rows)).toEqual([
      { n: 'ダミー公園', lat: 35.69, lng: 139.74, k: '応急給水槽', addr: 'テスト区1-1' },
    ])
  })
})

describe('駅の施設（架空のサンプル）', () => {
  const source = {
    station: 'ダミー駅（架空）',
    kindField: 'kind',
    kindMap: { エレベーター: 'elevator', 多機能トイレ: 'toilet' },
    floorField: 'floor',
    noteField: 'label',
    demo: true,
  }

  it('representativePoint：点はそのまま、面は頂点の平均', () => {
    expect(representativePoint({ type: 'Point', coordinates: [135, 35] })).toEqual({ lat: 35, lng: 135 })
    expect(
      representativePoint({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] }),
    ).toEqual({ lat: 0.8, lng: 0.8 })
    expect(representativePoint(null)).toBeNull()
  })

  it('GeoJSON：対応表にある種類だけを取り込み、ダミーの印を付ける', () => {
    const r = geojsonToFacilities(JSON.parse(sample('dummy-indoor.geojson')), source)
    expect(r.map((f) => f.k)).toEqual(['elevator', 'toilet'])
    expect(r.every((f) => f.demo === true && f.s === 'ダミー駅（架空）')).toBe(true)
    expect(r[0]).toMatchObject({ lat: 35.0008, lng: 135.0004, f: '1F' })
  })

  it('GeoJSON：建物ごとに名前が違うデータは、stationField で属性から駅（建物）名を取る', () => {
    const geo = {
      features: [
        { geometry: { type: 'Point', coordinates: [139.7671, 35.6812] }, properties: { category: 'F012', building: '東京駅', floor: 'B1F' } },
        { geometry: { type: 'Point', coordinates: [139.7640, 35.6800] }, properties: { category: 'F008', building: '丸ビル', floor: '1F' } },
        { geometry: { type: 'Point', coordinates: [139.7650, 35.6810] }, properties: { category: 'F011', building: '丸ビル', floor: '1F' } },
        { geometry: { type: 'Point', coordinates: [139.7650, 35.6810] }, properties: { category: 'F012', building: '', floor: '1F' } },
      ],
    }
    const r = geojsonToFacilities(geo, {
      stationField: 'building',
      kindField: 'category',
      kindMap: { F012: 'elevator', F008: 'toilet' },
      floorField: 'floor',
    })
    expect(r).toEqual([
      { s: '東京駅', k: 'elevator', lat: 35.6812, lng: 139.7671, f: 'B1F' },
      { s: '丸ビル', k: 'toilet', lat: 35.68, lng: 139.764, f: '1F' },
    ])
  })

  it('CSV：見出しの確認と、不正な種類・座標の除外', () => {
    const r = csvToFacilities(parseCsv(sample('dummy-stations.csv')), { demo: true })
    expect(r).toHaveLength(2)
    expect(() => csvToFacilities([['a']])).toThrow()
    expect(
      csvToFacilities([['駅名', '種類', '緯度', '経度'], ['A', 'unknown', '35', '135'], ['A', 'gate', 'x', '135']]),
    ).toEqual([])
  })

  it('mergeFacilities：重複をまとめて、駅名→種類の順に並べる', () => {
    const a = geojsonToFacilities(JSON.parse(sample('dummy-indoor.geojson')), source)
    const b = csvToFacilities(parseCsv(sample('dummy-stations.csv')), { demo: true })
    const m = mergeFacilities([a, a, b])
    expect(m).toHaveLength(4)
    // 駅ごとにまとまって並ぶ（駅名の並び順そのものは日本語の照合順に任せる）
    const names = m.map((f) => f.s)
    expect(names[0]).toBe(names[1])
    expect(names[2]).toBe(names[3])
    expect(names[1]).not.toBe(names[2])
  })

  it('同梱のサンプル(stations.sample.json)は、ダミーの印がすべてに付いている', () => {
    const r = JSON.parse(sample('stations.sample.json'))
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((f) => f.demo === true)).toBe(true)
  })
})
