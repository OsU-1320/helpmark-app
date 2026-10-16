#!/usr/bin/env node
/**
 * 暗号化の鍵の入れ替え：本番のFirestoreで暗号化している項目を、すべて、新しい鍵で暗号化し直す。
 * 何も付けなければ「件数を数えるだけ」で、何も書き換えない。
 *
 *   node scripts/rotate-encryption-key.mjs --old-id=1 --new-id=2 --new-key-file=<新しい鍵のファイル>          # 確認だけ
 *   node scripts/rotate-encryption-key.mjs --old-id=1 --new-id=2 --new-key-file=<新しい鍵のファイル> --yes    # 実行
 *
 * --old-key-file は、省略すると ~/.config/helpmark-net/data-encryption-key.txt（今の鍵）。
 * サービスアカウントの鍵は GOOGLE_APPLICATION_CREDENTIALS（省略すると ~/.config/helpmark-net/firebase-admin.json）。
 * 鍵の中身は、画面にも、ログにも、出力しない。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }),
)
const home = join(homedir(), '.config/helpmark-net')
const need = (k) => { if (!args[k] || args[k] === true) { console.error(`--${k} を指定してください`); process.exit(1) } return args[k] }
const oldId = need('old-id')
const newId = need('new-id')
const oldKeyFile = args['old-key-file'] || join(home, 'data-encryption-key.txt')
const newKeyFile = need('new-key-file')
if (oldId === newId) { console.error('新しい鍵の名前は、今の鍵と違う名前にしてください'); process.exit(1) }

const admin = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || join(home, 'firebase-admin.json'), 'utf-8'))
const oldKey = readFileSync(oldKeyFile, 'utf-8').trim()
const newKey = readFileSync(newKeyFile, 'utf-8').trim()

const root = fileURLToPath(new URL('..', import.meta.url))
const vite = await createServer({ configFile: false, root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { createVault } = await vite.ssrLoadModule('/server/src/vault.ts')
  const { rotateSealedFields } = await vite.ssrLoadModule('/server/src/rotate.ts')
  const { FirestoreStore } = await vite.ssrLoadModule('/server/src/firestoreStore.ts')

  const vault = await createVault({ id: newId, key: newKey }, [{ id: oldId, key: oldKey }])
  const store = new FirestoreStore({ FCM_PROJECT_ID: admin.project_id, GOOGLE_CLIENT_EMAIL: admin.client_email, GOOGLE_PRIVATE_KEY: admin.private_key })
  const dryRun = !args.yes
  const report = await rotateSealedFields(store, vault, { dryRun })

  console.log(`暗号化している項目（鍵の名前ごとの件数。今の鍵＝${newId}、前の鍵＝${oldId}）`)
  for (const [label, counts] of Object.entries(report.before)) {
    console.log(`  ${label}: ${Object.keys(counts).length ? Object.entries(counts).map(([k, n]) => `${k}=${n}`).join(', ') : '0件'}`)
  }
  if (dryRun) {
    console.log('\n（件数の表示だけです。書き換えるには --yes を付けてください）')
  } else {
    console.log(`\n新しい鍵で暗号化し直した: ${report.rotated}件／アプリが先に書き換えていたため触れなかった: ${report.skipped}件`)
    console.log('もう一度、--yes なしで実行して、前の鍵の件数が 0 になっていることを確かめてから、前の鍵を外してください')
  }
} finally {
  await vite.close()
}
