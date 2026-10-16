import { describe, expect, it } from 'vitest'
import { DEMO_LOCATIONS, resolveDemoLocation } from './location'

function memory(initial: string | null = null) {
  let v = initial
  return { get: () => v, set: (x: string | null) => void (v = x), peek: () => v }
}

describe('デモ用の位置（?loc=tokyo）', () => {
  it('?loc=tokyo で、東京駅の位置になり、開いている間は、覚えておく', () => {
    const store = memory()
    const d = resolveDemoLocation('?loc=tokyo', store, false)
    expect(d?.name).toBe('東京駅')
    expect(d?.coords).toMatchObject({ latitude: DEMO_LOCATIONS.tokyo.latitude, longitude: DEMO_LOCATIONS.tokyo.longitude })
    // 画面を移って、URLから指定が消えても、続く
    expect(resolveDemoLocation('', store, false)?.key).toBe('tokyo')
  })

  it('指定が無ければ、デモにならない。知らない名前も、デモにならない', () => {
    expect(resolveDemoLocation('', memory(), false)).toBeNull()
    expect(resolveDemoLocation('?loc=mars', memory(), false)).toBeNull()
    expect(resolveDemoLocation('?foo=1', memory(), false)).toBeNull()
  })

  it('?loc=off で、すぐ止まる', () => {
    const store = memory('tokyo')
    expect(resolveDemoLocation('?loc=off', store, false)).toBeNull()
    expect(store.peek()).toBeNull()
  })

  it('NFCタグで開いたとき（本当の緊急時の経路）は、使わない。前の設定も消す', () => {
    const store = memory('tokyo')
    expect(resolveDemoLocation('?loc=tokyo', store, true)).toBeNull()
    expect(store.peek()).toBeNull()
    // タグのトークンを消したあとも、そのまま使わない
    expect(resolveDemoLocation('', store, true)).toBeNull()
  })
})
