import { describe, expect, it } from 'vitest'
import { nearbyStationMap } from './stationMaps'

const f = (s: string, lat: number, lng: number) => ({ s, k: 'elevator' as const, lat, lng })

describe('駅構内図へのリンク', () => {
  const list = [f('東京駅', 35.6812, 139.7671), f('丸ビル', 35.6819, 139.765)]
  it('構内図のある駅の200m以内なら出す', () => {
    expect(nearbyStationMap(list, { latitude: 35.6815, longitude: 139.7673, accuracy: 10 })?.station).toBe('東京駅')
  })
  it('遠い・構内図の無い建物の近くでは出さない', () => {
    expect(nearbyStationMap(list, { latitude: 35.7, longitude: 139.8, accuracy: 10 })).toBeNull()
    expect(nearbyStationMap([f('丸ビル', 35.6819, 139.765)], { latitude: 35.6819, longitude: 139.765, accuracy: 10 })).toBeNull()
  })
})
