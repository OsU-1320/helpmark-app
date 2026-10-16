import { describe, expect, it } from 'vitest'
import { radarPoint, ringDistances, ringLabel } from './radar'

describe('radarPoint（北が上）', () => {
  it('北は上、東は右、南は下、西は左', () => {
    const n = radarPoint(0, 100, 200, 100)
    expect(n.x).toBeCloseTo(0)
    expect(n.y).toBeCloseTo(-50)
    expect(radarPoint(90, 200, 200, 100)).toMatchObject({ x: expect.closeTo(100), y: expect.closeTo(0) })
    expect(radarPoint(180, 200, 200, 100).y).toBeCloseTo(100)
    expect(radarPoint(270, 200, 200, 100).x).toBeCloseTo(-100)
  })
  it('距離は半径に比例し、範囲を超えたものは外周に置く', () => {
    expect(Math.hypot(...Object.values(radarPoint(45, 100, 300, 120)))).toBeCloseTo(40)
    expect(Math.hypot(...Object.values(radarPoint(45, 9999, 300, 120)))).toBeCloseTo(120)
  })
})

describe('同心円の目印', () => {
  it('300m は 100m・200m・300m、2km は 650m→700m ではなく、丸い数字にそろえる', () => {
    expect(ringDistances(300)).toEqual([100, 200, 300])
    expect(ringDistances(2000)).toEqual([650, 1350, 2000])
  })
  it('1km 以上は km で書く', () => {
    expect(ringLabel(300)).toBe('300m')
    expect(ringLabel(2000)).toBe('2km')
    expect(ringLabel(1000)).toBe('1km')
  })
})
