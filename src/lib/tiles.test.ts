import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTiledPoints, tileKey, tileKeysAround } from './tiles'
import { expandToilet, toiletsMatchAttrs } from './toilets'

describe('tiles', () => {
  it('tileKey：0.1度ごと（取り込みスクリプトと同じ式）', () => {
    expect(tileKey(35.69, 139.7)).toBe('356_1397')
    expect(tileKey(35.7, 139.7)).toBe('357_1397')
    expect(tileKey(35.65, 139.99)).toBe('356_1399')
  })

  it('tileKeysAround：境界をまたぐときだけ複数のタイルを返す', () => {
    expect(tileKeysAround({ latitude: 35.65, longitude: 139.75 }, 300)).toEqual(['356_1397'])
    expect(tileKeysAround({ latitude: 35.6995, longitude: 139.7 }, 300).sort()).toEqual(
      ['356_1396', '356_1397', '357_1396', '357_1397'],
    )
  })
})

describe('loadTiledPoints', () => {
  afterEach(() => vi.unstubAllGlobals())

  function stubFetch(files: Record<string, unknown>) {
    const fetched: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url)
        return url in files
          ? { ok: true, json: async () => files[url] }
          : { ok: false, status: 404, json: async () => ({}) }
      }),
    )
    return fetched
  }

  it('周辺で存在するタイルだけを読む', async () => {
    const fetched = stubFetch({
      '/t1/index.json': ['356_1397', '999_9999'],
      '/t1/356_1397.json': [{ n: 'ダミー', lat: 35.65, lng: 139.75 }],
    })
    const r = await loadTiledPoints('/t1', { latitude: 35.65, longitude: 139.75, accuracy: 10 }, 300)
    expect(r).toHaveLength(1)
    expect(fetched).toEqual(['/t1/index.json', '/t1/356_1397.json'])
  })

  it('周辺にタイルが無ければ空配列（失敗にはしない）', async () => {
    stubFetch({ '/t2/index.json': ['999_9999'] })
    const r = await loadTiledPoints('/t2', { latitude: 35.65, longitude: 139.75, accuracy: 10 }, 300)
    expect(r).toEqual([])
  })
})

describe('toilets', () => {
  it('expandToilet：1文字の設備を bf のキーに直す', () => {
    expect(expandToilet({ n: 'ダミー', lat: 1, lng: 2, f: '1F', x: 'obd' })).toEqual({
      n: 'ダミー',
      lat: 1,
      lng: 2,
      f: '1F',
      bf: { toilet: true, ostomate: true, bed: true, baby: true },
    })
    expect(expandToilet({ n: 'A', lat: 1, lng: 2 }).bf).toEqual({ toilet: true })
    expect(expandToilet({ n: 'A', lat: 1, lng: 2, x: 'a?' }).bf).toEqual({ toilet: true, auto: true })
  })

  it('toiletsMatchAttrs：絞り込みが無ければ出す。あれば toilet を含むときだけ', () => {
    expect(toiletsMatchAttrs([])).toBe(true)
    expect(toiletsMatchAttrs([null, null])).toBe(true)
    expect(toiletsMatchAttrs([['elev', 'slope']])).toBe(false)
    expect(toiletsMatchAttrs([['elev', 'toilet'], null])).toBe(true)
    expect(toiletsMatchAttrs([['toilet'], ['elev']])).toBe(false)
  })
})
