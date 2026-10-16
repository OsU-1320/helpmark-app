/**
 * 表示に使うタイムゾーン。端末の設定がずれていても（例：UTCのまま）、要請の時刻は日本時間で揃える。
 * 他地域に移植する場合はここを変える。
 */
export const DISPLAY_TIME_ZONE = 'Asia/Tokyo'

function parts(ms: number): { y: string; m: string; d: string; hh: string; mm: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('ja-JP', {
      timeZone: DISPLAY_TIME_ZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  )
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute }
}

/** 送信時刻をHH:mmで返す（日本時間）。今日でなければ「M/D HH:mm」にする */
export function formatSentTime(ms: number, nowMs = Date.now()): string {
  const t = parts(ms)
  const n = parts(nowMs)
  const timeStr = `${t.hh}:${t.mm}`
  const sameDay = t.y === n.y && t.m === n.m && t.d === n.d
  return sameDay ? timeStr : `${t.m}/${t.d} ${timeStr}`
}

/** 経過時間を「5分前」「2時間前」のように表す */
export function formatElapsed(ms: number, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  const day = Math.floor(hr / 24)
  return `${day}日前`
}
