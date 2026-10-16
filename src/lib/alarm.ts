let ctx: AudioContext | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

function beep(freq: number, startTime: number, dur: number, vol: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'square'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(vol, startTime)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)
  osc.start(startTime)
  osc.stop(startTime + dur)
}

function playTone() {
  if (!ctx) return
  const t = ctx.currentTime
  beep(880, t, 0.18, 0.7)
  beep(660, t + 0.22, 0.18, 0.7)
}

export function startAlarm() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  playTone()
  intervalId = setInterval(playTone, 550)
}

export function stopAlarm() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

/** NFC起動などユーザー操作なしのページ遷移では AudioContext がsuspendedになる。最初の操作時に呼んで解除する */
export function resumeAlarmContext() {
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}
