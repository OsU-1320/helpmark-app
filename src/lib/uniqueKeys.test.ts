import { describe, expect, it } from 'vitest'
import { uniqueKeys } from './uniqueKeys'

describe('uniqueKeys', () => {
  it('重ならないものは、そのまま', () => {
    expect(uniqueKeys([{ key: 'a' }, { key: 'b' }]).map((r) => r.key)).toEqual(['a', 'b'])
  })
  it('重なったものは、2つ目以降に番号を付ける。すべて異なる識別子になる', () => {
    const r = uniqueKeys([{ key: 'toilet:A:1' }, { key: 'toilet:A:1' }, { key: 'x' }, { key: 'toilet:A:1' }])
    expect(r.map((x) => x.key)).toEqual(['toilet:A:1', 'toilet:A:1#2', 'x', 'toilet:A:1#3'])
    expect(new Set(r.map((x) => x.key)).size).toBe(4)
  })
  it('ほかの項目は、変えない', () => {
    expect(uniqueKeys([{ key: 'a', v: 1 }, { key: 'a', v: 2 }]).map((x) => x.v)).toEqual([1, 2])
  })
})
