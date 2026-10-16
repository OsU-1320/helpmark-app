/**
 * 端末のコンパス（方位）ユーティリティ。
 * iOS 13+ は DeviceOrientationEvent.requestPermission() がユーザー操作直後しか呼べないため、
 * 「助ける」ボタンのタップハンドラ内で requestCompassPermission() を呼ぶ設計。
 */

type DOEStatic = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

interface CompassOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number
}

/** コンパス利用の許可を取る（iOSのみ明示要求。Android等は不要）。ユーザー操作直後に呼ぶこと */
export async function requestCompassPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return false
  const DOE = DeviceOrientationEvent as DOEStatic
  if (typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }
  return true
}

/** 方位（真北=0、時計回り360）を購読する。戻り値は解除関数 */
export function subscribeHeading(onHeading: (headingDeg: number | null) => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const e = event as CompassOrientationEvent
    // iOSはwebkitCompassHeading（真北基準）。Androidはalpha（反時計回り）なので変換する
    if (typeof e.webkitCompassHeading === 'number') {
      onHeading(e.webkitCompassHeading)
    } else if (typeof e.alpha === 'number') {
      onHeading((360 - e.alpha) % 360)
    }
  }

  const eventName =
    'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
  window.addEventListener(eventName, handler, true)
  return () => window.removeEventListener(eventName, handler, true)
}
