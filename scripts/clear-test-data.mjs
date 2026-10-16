#!/usr/bin/env node
/**
 * 本番Firestoreのテストデータを消すスクリプト。何も指定しなければ「件数を数えるだけ」で、消さない。
 *
 *   node scripts/clear-test-data.mjs                      # 件数だけ表示（消さない）
 *   node scripts/clear-test-data.mjs --scope=requests --yes   # 支援要請（応答者を含む）だけ消す
 *   node scripts/clear-test-data.mjs --scope=all --yes        # 全コレクションを消す
 *
 * scope=all は、プロフィール・緊急連絡先・パートナーの通知先・端末の認証情報・タグのトークンの対応表も消す。
 * 消したあとは、全端末で登録し直しになり、NFCタグも書き直しが必要（トークンが新しくなるため）。
 * サービスアカウントの鍵のパスは、環境変数 GOOGLE_APPLICATION_CREDENTIALS（なければ ~/.config/helpmark-net/firebase-admin.json）。
 */
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const scope = (args.find((a) => a.startsWith('--scope=')) ?? '').slice(8)
const yes = args.includes('--yes')
if (yes && !['requests', 'all'].includes(scope)) {
  console.error('--yes を使うときは、--scope=requests か --scope=all を指定してください')
  process.exit(1)
}

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(homedir(), '.config/helpmark-net/firebase-admin.json')
const key = JSON.parse(readFileSync(keyPath, 'utf-8'))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')

async function token() {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  })
  if (!res.ok) throw new Error(`トークン取得に失敗: ${res.status}`)
  return (await res.json()).access_token
}

const BASE = `https://firestore.googleapis.com/v1/projects/${key.project_id}/databases/(default)/documents`
const auth = { Authorization: `Bearer ${await token()}` }

/** コレクション直下のドキュメントのパス（alerts/xxx など）を全部返す */
async function list(path) {
  const out = []
  let pageToken = ''
  do {
    const res = await fetch(`${BASE}/${path}?pageSize=300&showMissing=true${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: auth })
    if (!res.ok) throw new Error(`${path} の取得に失敗: ${res.status}`)
    const body = await res.json()
    for (const d of body.documents ?? []) out.push(d.name.split('/documents/')[1])
    pageToken = body.nextPageToken ?? ''
  } while (pageToken)
  return out
}

async function remove(docPath) {
  const res = await fetch(`${BASE}/${docPath}`, { method: 'DELETE', headers: auth })
  if (!res.ok && res.status !== 404) throw new Error(`${docPath} の削除に失敗: ${res.status}`)
}

const alerts = await list('alerts')
const responders = (await Promise.all(alerts.map((a) => list(`${a}/responders`)))).flat()
const others = {}
for (const c of ['profiles', 'emergencyContacts', 'supporters', 'devices', 'tagTokens']) others[c] = await list(c)

console.log(`alerts: ${alerts.length}件（応答者 ${responders.length}件）`)
for (const [c, docs] of Object.entries(others)) console.log(`${c}: ${docs.length}件`)

if (!yes) {
  console.log('\n（件数の表示だけです。消すには --scope=requests --yes か --scope=all --yes を付けてください）')
  process.exit(0)
}
const targets = scope === 'all' ? [...responders, ...alerts, ...Object.values(others).flat()] : [...responders, ...alerts]
for (const p of targets) await remove(p)
console.log(`\n${targets.length}件を削除しました（scope=${scope}）`)
