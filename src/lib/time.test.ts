import { describe, expect, it } from 'vitest'
import { formatSentTime } from './time'

describe('formatSentTime', () => {
  it('端末のタイムゾーンに関係なく日本時間で表示する', () => {
    // 2026-10-04T23:05:00Z = 日本時間 10/5 08:05
    const sent = Date.parse('2026-10-04T23:05:00Z')
    expect(formatSentTime(sent, Date.parse('2026-10-04T23:30:00Z'))).toBe('08:05')
  })

  it('日本時間で日付が違えば月日を付ける', () => {
    const sent = Date.parse('2026-10-04T14:00:00Z') // 10/4 23:00 JST
    expect(formatSentTime(sent, Date.parse('2026-10-04T16:00:00Z'))).toBe('10/4 23:00') // 現在は10/5 01:00 JST
  })
})
