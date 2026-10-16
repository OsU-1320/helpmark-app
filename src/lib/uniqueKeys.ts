/**
 * 一覧の行の識別子（key）を、重複しないようにする。
 * 同じ名前・同じ位置の施設（階違いのトイレなど）が複数あると、識別子が重なり、画面の部品が前の行を取り残してしまう。
 * 重なったものには、2つ目以降に「#2」「#3」を付ける（並びが同じなら、同じ識別子になる）。
 */
export function uniqueKeys<T extends { key: string }>(rows: T[]): T[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const n = (seen.get(r.key) ?? 0) + 1
    seen.set(r.key, n)
    return n === 1 ? r : { ...r, key: `${r.key}#${n}` }
  })
}
