import { getNfcToken } from './nfc'

// ── デモ用の位置（?loc=tokyo） ─────────────────────────────────────────
/**
 * URLに ?loc=tokyo を付けると、現在地が東京駅になる（東京にいなくても、都内の駅の場面を再現できる。デモ・動作確認用）。
 * 安全のため、次の決まりを守る：
 *   - 画面の上に、必ず「デモ用の位置です」と表示する（App.tsx）。本物の位置と取り違えない
 *   - NFCタグで開いたとき（本当の緊急時の経路）は、使わない。その場合は、前に設定していた分も、消す
 *   - 開いている間だけ有効（sessionStorage）。?loc=off で、すぐ止められる
 */
export const DEMO_LOCATIONS: Record<string, { name: string; latitude: number; longitude: number }> = {
  tokyo: { name: '東京駅', latitude: 35.6812, longitude: 139.7671 },
}

const DEMO_KEY = 'helpmark:demoLoc'

export interface DemoLocation {
  key: string
  name: string
  coords: Coords
}

/** 純粋な判定。search=URLの ?以降、store=保存先、nfcAtStart=NFCタグで開かれたか */
export function resolveDemoLocation(
  search: string,
  store: { get(): string | null; set(v: string | null): void },
  nfcAtStart: boolean,
): DemoLocation | null {
  if (nfcAtStart) {
    store.set(null)
    return null
  }
  const param = new URLSearchParams(search).get('loc')
  if (param === 'off') store.set(null)
  else if (param && DEMO_LOCATIONS[param]) store.set(param)
  const key = store.get()
  const d = key ? DEMO_LOCATIONS[key] : undefined
  return d && key ? { key, name: d.name, coords: { latitude: d.latitude, longitude: d.longitude, accuracy: 10 } } : null
}

/** NFCタグで開かれたかは、タグのトークンを消す前（最初の読み込み時）に、1回だけ確かめる */
const NFC_AT_START = getNfcToken() != null

const sessionStore = {
  get: () => {
    try {
      return sessionStorage.getItem(DEMO_KEY)
    } catch {
      return null
    }
  },
  set: (v: string | null) => {
    try {
      if (v == null) sessionStorage.removeItem(DEMO_KEY)
      else sessionStorage.setItem(DEMO_KEY, v)
    } catch {
      /* 保存できなくても、そのページの間は、URLの指定で動く */
    }
  },
}

/** いまデモ用の位置を使っていれば、その内容。使っていなければ null */
export function getDemoLocation(): DemoLocation | null {
  return resolveDemoLocation(window.location.search, sessionStore, NFC_AT_START)
}

/** デモ用の位置をやめて、URLから ?loc= を外して開き直す */
export function stopDemoLocation(): void {
  sessionStore.set(null)
  const q = new URLSearchParams(window.location.search)
  q.delete('loc')
  const rest = q.toString()
  window.location.replace(window.location.pathname + (rest ? `?${rest}` : ''))
}

export interface Coords {
  latitude: number
  longitude: number
  accuracy: number
}

/**
 * Geolocation API のPromiseラッパー。失敗時はthrow。
 * quick=true は精度より速さを優先する（直近の位置の流用・低精度で可）。最初の表示を早く出すために使う。
 * デモ用の位置を使っているときは、その位置を返す。
 */
export function getCurrentPosition(timeoutMs = 8000, quick = false): Promise<Coords> {
  const demo = getDemoLocation()
  if (demo) return Promise.resolve(demo.coords)
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('位置情報API non対応'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(new Error(`位置情報取得失敗: ${err.message}`)),
      quick
        ? { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120000 }
        : { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    )
  })
}

/**
 * 位置を追い続ける。戻り値は、止める関数。デモ用の位置を使っているときは、その位置を1回だけ返す。
 * onError には、許可が拒否されたか（denied）を渡す。
 */
export function watchPosition(
  onPosition: (c: Coords) => void,
  onError?: (e: { denied: boolean }) => void,
  options: PositionOptions = {},
): () => void {
  const demo = getDemoLocation()
  if (demo) {
    const t = setTimeout(() => onPosition(demo.coords), 0)
    return () => clearTimeout(t)
  }
  if (!('geolocation' in navigator)) return () => {}
  const id = navigator.geolocation.watchPosition(
    (pos) => onPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
    (err) => onError?.({ denied: err.code === err.PERMISSION_DENIED }),
    options,
  )
  return () => navigator.geolocation.clearWatch(id)
}

/** 2点間の距離（メートル・haversine） */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000
  const φ1 = (a.latitude * Math.PI) / 180
  const φ2 = (b.latitude * Math.PI) / 180
  const dφ = ((b.latitude - a.latitude) * Math.PI) / 180
  const dλ = ((b.longitude - a.longitude) * Math.PI) / 180
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

/** a から b を見た方位角（真北=0・時計回り・度） */
export function bearingDegrees(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const φ1 = (a.latitude * Math.PI) / 180
  const φ2 = (b.latitude * Math.PI) / 180
  const dλ = ((b.longitude - a.longitude) * Math.PI) / 180
  const y = Math.sin(dλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

const COMPASS_LABELS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']

/** 方位角(度)を8方位の日本語ラベルに変換 */
export function bearingToCompassLabel(deg: number): string {
  const index = Math.round(((deg % 360) + 360) % 360 / 45) % 8
  return COMPASS_LABELS[index]
}

/** 方位角(度)を8方位の角度(0/45/90/.../315)に丸める（矢印表示用・正確な角度は出さない） */
export function bearingToCompass8(deg: number): number {
  return (Math.round(((deg % 360) + 360) % 360 / 45) % 8) * 45
}
