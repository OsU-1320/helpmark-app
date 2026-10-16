import { radarPoint, ringDistances, ringLabel } from '../lib/radar'
import './NearbyRadar.css'

export interface RadarItem {
  key: string
  /** 一覧の番号と同じ（1から） */
  no: number
  /** 現在地から見た方位角（北=0・時計回り） */
  bearing: number
  distanceM: number
  color: string
}

interface Props {
  items: RadarItem[]
  /** 図の端の距離（メートル）。通常は300、防災モードは2000 */
  maxM: number
  selectedKey: string | null
  onSelect: (key: string) => void
}

const SIZE = 340
const C = SIZE / 2
/** 外周の半径。外側に、北の目印と輪の文字を置く余白を残す */
const R = 138

/**
 * 簡易の周辺図。現在地を中心に、方角と距離だけで、一覧の番号つきの点を置く（北が上）。
 * 道路の背景は無い（軽く保つため）。点をタップすると、一覧の同じ行が開く。
 */
export default function NearbyRadar({ items, maxM, selectedKey, onSelect }: Props) {
  const rings = ringDistances(maxM)
  return (
    <svg
      className="radar"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={`現在地を中心にした周辺図。外周は${ringLabel(maxM)}。点の番号は、下の一覧の番号と同じです`}
    >
      <g transform={`translate(${C} ${C})`}>
        {rings.map((m, i) => (
          <circle key={m} className={`radar__ring${i === rings.length - 1 ? ' radar__ring--outer' : ''}`} r={(R * (i + 1)) / rings.length} />
        ))}
        <line className="radar__axis" x1={0} y1={-R} x2={0} y2={R} />
        <line className="radar__axis" x1={-R} y1={0} x2={R} y2={0} />
        {rings.map((m, i) => (
          <text key={m} className="radar__ring-label" x={(R * (i + 1)) / rings.length - 4} y={-5} textAnchor="end">
            {ringLabel(m)}
          </text>
        ))}
        <text className="radar__north" x={0} y={-R - 12} textAnchor="middle">北</text>

        {items.map((it) => {
          const p = radarPoint(it.bearing, it.distanceM, maxM, R)
          const selected = selectedKey === it.key
          return (
            <g
              key={it.key}
              className={`radar__dot${selected ? ' is-selected' : ''}`}
              transform={`translate(${p.x} ${p.y})`}
              onClick={() => onSelect(it.key)}
              role="button"
              aria-label={`${it.no}番`}
            >
              <circle className="radar__hit" r={20} />
              {selected && <circle className="radar__halo" r={19} />}
              <circle className="radar__marker" r={13} fill={it.color} />
              <text className="radar__no" textAnchor="middle" dy="0.35em">{it.no}</text>
            </g>
          )
        })}

        <circle className="radar__me" r={9} />
        <text className="radar__me-label" x={0} y={26} textAnchor="middle">現在地</text>
      </g>
    </svg>
  )
}
