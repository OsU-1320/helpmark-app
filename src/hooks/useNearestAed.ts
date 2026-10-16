import { useEffect, useState } from 'react'
import { getCurrentPosition, type Coords } from '../lib/location'
import { fetchNearestAed, type NearestAed } from '../lib/restInfo'

/** 最寄りAEDと、そのときの現在地を、一度だけ取得する（失敗しても他の機能を妨げない） */
export function useNearestAed(): { aed: NearestAed | null; pos: Coords | null; done: boolean } {
  const [aed, setAed] = useState<NearestAed | null>(null)
  const [pos, setPos] = useState<Coords | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCurrentPosition(8000)
      .then((p) => {
        if (!cancelled) setPos(p)
        return fetchNearestAed(p)
      })
      .then((r) => {
        if (!cancelled && r) setAed(r)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { aed, pos, done }
}
