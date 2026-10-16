/**
 * Firestore REST API による Store 実装。サービスアカウントで認証するため
 * Firestore のセキュリティルール（全拒否）の影響を受けない。
 */
import { getAccessToken, type GoogleEnv } from './google'
import type { Data, Doc, Store } from './store'

type FsValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } }

interface FsDocument {
  name: string
  fields?: Record<string, FsValue>
}

export function encodeValue(v: unknown): FsValue {
  if (v === null) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as Data) } }
  throw new Error(`Firestoreに保存できない値: ${typeof v}`)
}

export function encodeFields(data: Data): Record<string, FsValue> {
  const fields: Record<string, FsValue> = {}
  for (const [k, v] of Object.entries(data)) if (v !== undefined) fields[k] = encodeValue(v)
  return fields
}

export function decodeValue(v: FsValue): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeValue)
  if ('mapValue' in v) return decodeFields(v.mapValue.fields ?? {})
  return null
}

export function decodeFields(fields: Record<string, FsValue>): Data {
  const out: Data = {}
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v)
  return out
}

const idOf = (name: string) => name.slice(name.lastIndexOf('/') + 1)

export class FirestoreStore implements Store {
  private base: string

  constructor(private env: GoogleEnv) {
    this.base = `https://firestore.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/databases/(default)/documents`
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await getAccessToken(this.env)
    return fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    })
  }

  private async fail(res: Response, what: string): Promise<never> {
    throw new Error(`Firestore ${what} 失敗: ${res.status} ${await res.text()}`)
  }

  async get<T>(path: string): Promise<T | null> {
    const res = await this.call(`${this.base}/${path}`)
    if (res.status === 404) return null
    if (!res.ok) return this.fail(res, `get ${path}`)
    const doc = (await res.json()) as FsDocument
    return decodeFields(doc.fields ?? {}) as T
  }

  async create(path: string, data: Data): Promise<boolean> {
    const i = path.lastIndexOf('/')
    const res = await this.call(
      `${this.base}/${path.slice(0, i)}?documentId=${encodeURIComponent(path.slice(i + 1))}`,
      { method: 'POST', body: JSON.stringify({ fields: encodeFields(data) }) },
    )
    if (res.status === 409) return false
    if (!res.ok) return this.fail(res, `create ${path}`)
    return true
  }

  async set(path: string, data: Data): Promise<void> {
    const res = await this.call(`${this.base}/${path}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: encodeFields(data) }),
    })
    if (!res.ok) return this.fail(res, `set ${path}`)
  }

  async update(path: string, data: Data): Promise<void> {
    const mask = Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join('&')
    const res = await this.call(`${this.base}/${path}?${mask}&currentDocument.exists=true`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: encodeFields(data) }),
    })
    if (!res.ok) return this.fail(res, `update ${path}`)
  }

  async delete(path: string): Promise<void> {
    const res = await this.call(`${this.base}/${path}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) return this.fail(res, `delete ${path}`)
  }

  async list<T>(collectionPath: string): Promise<Doc<T>[]> {
    const out: Doc<T>[] = []
    let pageToken = ''
    do {
      const url = `${this.base}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
      const res = await this.call(url)
      if (!res.ok) return this.fail(res, `list ${collectionPath}`)
      const body = (await res.json()) as { documents?: FsDocument[]; nextPageToken?: string }
      for (const d of body.documents ?? []) out.push({ id: idOf(d.name), data: decodeFields(d.fields ?? {}) as T })
      pageToken = body.nextPageToken ?? ''
    } while (pageToken)
    return out
  }

  async query<T>(collectionPath: string, field: string, value: string | number | boolean): Promise<Doc<T>[]> {
    const i = collectionPath.lastIndexOf('/')
    const parent = i === -1 ? this.base : `${this.base}/${collectionPath.slice(0, i)}`
    const collectionId = collectionPath.slice(i + 1)
    const res = await this.call(`${parent}:runQuery`, {
      method: 'POST',
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeValue(value) } },
        },
      }),
    })
    if (!res.ok) return this.fail(res, `query ${collectionPath}`)
    const rows = (await res.json()) as Array<{ document?: FsDocument }>
    return rows
      .filter((r) => r.document)
      .map((r) => ({ id: idOf(r.document!.name), data: decodeFields(r.document!.fields ?? {}) as T }))
  }
}
