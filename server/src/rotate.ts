/**
 * 暗号化の鍵の入れ替え：暗号化して保存している項目を、すべて読み直して、今の鍵で暗号化し直す。
 * scripts/rotate-encryption-key.mjs から使う。
 */
import type { Store } from './store'
import { SEALED_FIELDS, type Vault } from './vault'

export interface RotationReport {
  /** 項目ごとの、鍵の名前別の件数（入れ替え前） */
  before: Record<string, Record<string, number>>
  /** 今回、今の鍵で暗号化し直した件数 */
  rotated: number
  /** 読み直しの間に、別の書き込みで変わっていたため、触れなかった件数（今の鍵で書かれたものなので、問題ない） */
  skipped: number
}

/** dryRun のときは、件数を数えるだけで、何も書き換えない */
export async function rotateSealedFields(store: Store, vault: Vault, opts: { dryRun: boolean }): Promise<RotationReport> {
  const report: RotationReport = { before: {}, rotated: 0, skipped: 0 }
  for (const { collection, field, aad } of SEALED_FIELDS) {
    const label = `${collection}.${field}`
    report.before[label] = {}
    for (const doc of await store.list<Record<string, unknown>>(collection)) {
      const sealed = doc.data[field]
      if (typeof sealed !== 'string') continue
      const kid = vault.keyIdOf(sealed)
      report.before[label][kid] = (report.before[label][kid] ?? 0) + 1
      if (vault.isCurrent(sealed) || opts.dryRun) continue

      const path = `${collection}/${doc.id}`
      const plain = await vault.open(sealed, aad(doc.id))
      // 読んでから書くまでの間に、アプリが書き換えていないか確かめる（書き換えられていたら、触れない）
      const latest = await store.get<Record<string, unknown>>(path)
      if (latest?.[field] !== sealed) {
        report.skipped++
        continue
      }
      await store.update(path, { [field]: await vault.seal(plain, aad(doc.id)) })
      report.rotated++
    }
  }
  return report
}
