/**
 * 支援待ち画面用の線画イラスト（120×90グリッド）。
 * 意味は必ず隣のテキストで伝え、イラストは補助として aria-hidden にする。
 * 本人＝赤（ヘルプマーク色）、パートナー＝ティール、線＝currentColor で統一。
 */
import type { ReactNode } from 'react'
import { MS_WALK, MS_WILL_HELP } from './materialSymbolPaths'

interface Props {
  size?: number
  className?: string
}

function Frame({ size = 120, className, children }: Props & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 90"
      width={size}
      height={(size * 90) / 120}
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/** 知らせました：スマホから周りへ電波が広がる */
export function IllustSending(props: Props) {
  return (
    <Frame {...props}>
      <rect x="45" y="12" width="30" height="60" rx="6" />
      <path d="M55 64 H65" />
      <path
        d="M60 50 C48 42 50 32 56 33 C58 33.5 59.5 35 60 36.5 C60.5 35 62 33.5 64 33 C70 32 72 42 60 50 Z"
        fill="var(--red)"
        stroke="none"
      />
      <g stroke="var(--teal)" className="support-illust__waves">
        <path d="M81 32 Q89 42 81 52" />
        <path d="M88 26 Q100 42 88 58" />
        <path d="M95 20 Q111 42 95 64" />
        <path d="M39 32 Q31 42 39 52" />
        <path d="M32 26 Q20 42 32 58" />
        <path d="M25 20 Q9 42 25 64" />
      </g>
    </Frame>
  )
}

/** 向かっています：パートナーが本人（ピン）へ歩いてくる */
export function IllustWalking(props: Props) {
  return (
    <Frame {...props}>
      <path d={MS_WALK} transform="translate(8 74) scale(0.0625)" fill="var(--teal)" stroke="none" />
      <path d="M52 74 Q70 80 84 64" strokeDasharray="3 6" />
      <path
        d="M92 58 C92 58 80 45 80 37 A12 12 0 0 1 104 37 C104 45 92 58 92 58 Z"
        fill="var(--red)"
        stroke="none"
      />
      <circle cx="92" cy="37" r="4" fill="white" stroke="none" />
    </Frame>
  )
}

/** 到着しました：パートナーと本人が並んでいる */
export function IllustTogether(props: Props) {
  return (
    <Frame {...props}>
      <g fill="var(--teal)" stroke="none">
        <circle cx="44" cy="22" r="8" />
        <rect x="34" y="33" width="20" height="28" rx="9" />
        <rect x="37" y="58" width="5" height="16" rx="2.5" />
        <rect x="46" y="58" width="5" height="16" rx="2.5" />
      </g>
      <g fill="currentColor" stroke="none">
        <circle cx="76" cy="22" r="8" />
        <rect x="66" y="33" width="20" height="28" rx="9" />
        <rect x="69" y="58" width="5" height="16" rx="2.5" />
        <rect x="78" y="58" width="5" height="16" rx="2.5" />
      </g>
      {/* 本人の胸のバッジ。十字だと国旗に見えるため、パートナーのアイコン（手とハート）にする */}
      <circle cx="76" cy="43" r="8" fill="var(--teal)" stroke="none" />
      <path d={MS_WILL_HELP} transform="translate(69.5 49.5) scale(0.0135)" fill="white" stroke="none" />
      <path d="M54 44 H66" stroke="var(--teal)" />
    </Frame>
  )
}

/** 駅員：帽子をかぶった人と駅の看板 */
export function IllustStaff(props: Props) {
  return (
    <Frame {...props}>
      <g fill="currentColor" stroke="none">
        <circle cx="48" cy="30" r="9" />
        <rect x="36" y="42" width="24" height="30" rx="9" />
      </g>
      <path d="M37 23 Q37 13 48 13 Q59 13 59 23 Z" fill="var(--teal)" stroke="none" />
      <path d="M34 23 H62" stroke="var(--teal)" />
      <rect x="74" y="18" width="30" height="18" rx="3" />
      <path d="M89 36 V72" />
      <text
        x="89"
        y="31.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
      >
        駅
      </text>
    </Frame>
  )
}
