import { useEffect, useRef, useState } from 'react'
import { getCurrentPosition, watchPosition, type Coords } from '../lib/location'
import {
  updateHelperLocation,
  SHARING_TIMEOUT_MS,
  SHARING_INTERVAL_MS,
  type AlertStatus,
  type ResponderStatus,
} from '../lib/alerts'

/**
 * パートナーの現在地を、自分のresponderドキュメントが'going'の間だけFirestoreへ書き込む
 * （「常時位置共有は禁止」に対し、支援中に限定した能動的共有として実装）。
 * 自分がarrivedになった時・alert全体が(他の応答者やビーコナーによって)completed/cancelledに
 * なった時のどちらでも、即座に位置取得・書き込みを止める。
 * コンパス画面・到着後の支援画面の両方から呼び出し、画面遷移をまたいで共有を継続する。
 */
export function useResponderLocationSharing(
  alertId: string | null,
  profileId: string,
  myStatus: ResponderStatus | undefined,
  alertStatus: AlertStatus | undefined,
): { sharingEnded: boolean } {
  const [sharingEnded, setSharingEnded] = useState(false)
  const myPosRef = useRef<Coords | null>(null)

  const isSharing =
    myStatus === 'going' && alertStatus === 'active'

  useEffect(() => {
    if (!isSharing) return
    getCurrentPosition()
      .then((pos) => {
        myPosRef.current = pos
      })
      .catch(() => {})
    return watchPosition(
      (c) => {
        myPosRef.current = c
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
  }, [isSharing])

  useEffect(() => {
    if (!isSharing) return
    const startedMs = Date.now()
    setSharingEnded(false)
    const write = () => {
      const pos = myPosRef.current
      if (pos && alertId) updateHelperLocation(alertId, profileId, pos).catch(() => {})
    }
    write()
    const id = setInterval(() => {
      if (Date.now() - startedMs > SHARING_TIMEOUT_MS) {
        setSharingEnded(true)
        clearInterval(id)
        return
      }
      write()
    }, SHARING_INTERVAL_MS)
    return () => clearInterval(id)
  }, [alertId, profileId, isSharing])

  return { sharingEnded }
}
