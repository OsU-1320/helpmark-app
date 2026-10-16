/**
 * アプリ内ピクトグラム（24×24 グリッド）
 * fill="currentColor" を SVG 要素に設定済み。stroke パスは fill="none" を明示。
 * 人物を含む図形は手描きだと崩れやすいため、Google Material Symbols のパスを使う（materialSymbolPaths.ts）。
 */
import type { ReactNode } from 'react'
import { MS_GUIDE, MS_PARTNERS, MS_SEAT, MS_SIGN, MS_WATCH_ONLY, MS_WILL_HELP } from './materialSymbolPaths'
import {
  PICT_ANXIETY,
  PICT_COMMUNICATION,
  PICT_ENTRY_NEED_HELP,
  PICT_MEDICAL,
  PICT_MOBILITY,
  PICT_OTHER,
  PICT_SENSORY,
} from './pictogramPaths'

/** Material Symbols（viewBox 0 -960 960 960）のパスを24×24グリッドに変換して描く */
function ms(d: string): ReactNode {
  return <path d={d} transform="translate(0 24) scale(0.025)" />
}

/** 24×24グリッドの塗りパス（白抜きはパスの穴） */
function evenodd(d: string): ReactNode {
  return <path fillRule="evenodd" d={d} />
}

export type PictName =
  | 'anxiety'
  | 'sensory'
  | 'communication'
  | 'mobility'
  | 'medical'
  | 'other'
  | 'seat'
  | 'guide'
  | 'watch-only'
  | 'phone'
  | 'pin'
  | 'aed'
  | 'warn'
  | 'bell'
  | 'bell-off'
  | 'pen'
  | 'sign'
  | 'elevator'
  | 'wc'
  | 'braille'
  | 'map'
  | 'partners'
  | 'entry-need-help'
  | 'entry-will-help'

interface Props {
  name: PictName
  size?: number
}

export function Pict({ name, size = 20 }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: '-0.2em' }}
    >
      {GLYPHS[name]}
    </svg>
  )
}

/** カテゴリID → ピクト名 */
export function pictForId(id: string): PictName {
  const known: PictName[] = [
    'anxiety', 'sensory', 'communication', 'mobility', 'medical', 'other',
    'seat', 'guide', 'watch-only',
  ]
  return (known as string[]).includes(id) ? (id as PictName) : 'other'
}

// ─── 共通ストロークスタイル（JSXには直接書く） ───────────────────────────
// strokeWidth=2.5 / strokeLinecap="round" / strokeLinejoin="round"

const GLYPHS: Record<PictName, ReactNode> = {

  // ━━━ 6カテゴリ ━━━━━━━━━━━━━━━━━━━━━━━━━

  // 区分（ClaudeDesignで作成した塗りのみのパス）
  anxiety: evenodd(PICT_ANXIETY),
  sensory: evenodd(PICT_SENSORY),
  communication: evenodd(PICT_COMMUNICATION),
  mobility: evenodd(PICT_MOBILITY),
  medical: evenodd(PICT_MEDICAL),
  other: evenodd(PICT_OTHER),

  // ━━━ サポートアクション ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 着席を確保する → 座っている人
  seat: ms(MS_SEAT),

  // 道案内 → 道しるべ
  guide: ms(MS_GUIDE),

  // 見守り → 目
  'watch-only': ms(MS_WATCH_ONLY),

  // ━━━ 連絡・ナビ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  phone: (
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.21c.27-.26.66-.36 1.01-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.46.57 3.58.11.35.03.74-.25 1.02l-2.2 2.19z" />
  ),

  pin: (
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  ),

  aed: (
    <>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      <polyline
        points="6.5,11 9.5,11 11,8 13,14.5 14.5,11 17.5,11"
        fill="none" stroke="white" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  ),

  warn: (
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  ),

  bell: (
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  ),

  'bell-off': (
    <>
      <path
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"
        opacity="0.4"
      />
      <path d="M4.2 3.5l16.3 16.3-1.4 1.4L2.8 4.9z" />
    </>
  ),

  pen: (
    <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 000-1.41L18.37 3.3a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.82-1.84z" />
  ),

  // ━━━ アクセシビリティ施設 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 手話対応 → 手話
  sign: ms(MS_SIGN),

  elevator: (
    <>
      <rect x="4.5" y="2.5" width="15" height="19" rx="2"
        fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9.2 9.2L12 5.8l2.8 3.4h-1.8v1.8h-2v-1.8H9.2zM9.2 14.8h1.8V13h2v1.8h1.8L12 18.2l-2.8-3.4z" />
    </>
  ),

  wc: (
    <>
      <circle cx="7.2" cy="4.5" r="2" />
      <path d="M7.2 7.5c-1.8 0-3.2 1.4-3.2 3.2v4.8h1.9V21h2.6v-5.5h1.9v-4.8c0-1.8-1.4-3.2-3.2-3.2z" />
      <circle cx="16.8" cy="4.5" r="2" />
      <path d="M16.8 7.5l-3.1 7h2.1L14.4 21h4.8l-1.4-6.5h2.1l-3.1-7z" />
    </>
  ),

  braille: (
    <>
      <circle cx="8"  cy="5"  r="2.2" />
      <circle cx="16" cy="5"  r="2.2" />
      <circle cx="8"  cy="12" r="2.2" />
      <circle cx="16" cy="12" r="2.2" />
      <circle cx="8"  cy="19" r="2.2" />
    </>
  ),

  map: (
    <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
  ),

  // パートナー（支援者）→ 手とハート
  partners: ms(MS_PARTNERS),

  // 登録の入口。will = Material Symbols「volunteer_activism」、need = それにヘルプマークの十字をくり抜いた改変版（Apache License 2.0）
  'entry-need-help': evenodd(PICT_ENTRY_NEED_HELP),
  'entry-will-help': ms(MS_WILL_HELP),
}
