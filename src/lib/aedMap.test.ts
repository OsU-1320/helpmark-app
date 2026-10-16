import { describe, expect, it } from 'vitest'
import { AED_MAP_SITE, aedMapUrl } from './aedMap'

describe('日本全国AEDマップ（aedm.jp）へのリンク', () => {
  it('トップを開く（現在地は、開いた先が自分で取得する）', () => {
    expect(AED_MAP_SITE).toBe('https://aedm.jp/')
    expect(aedMapUrl({ latitude: 35.6812, longitude: 139.7671 })).toBe('https://aedm.jp/')
    expect(aedMapUrl(null)).toBe('https://aedm.jp/')
    expect(aedMapUrl()).toBe('https://aedm.jp/')
  })
})
