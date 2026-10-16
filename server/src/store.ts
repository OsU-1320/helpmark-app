/**
 * データ保存先の抽象。本番は Firestore（REST・サービスアカウント）、
 * ローカル開発とテストはメモリ上の実装を使う。パスは Firestore と同じ「コレクション/ID/…」形式。
 */
export type Data = Record<string, unknown>

export interface Doc<T = Data> {
  id: string
  data: T
}

export interface Store {
  get<T = Data>(path: string): Promise<T | null>
  /** 存在しない場合だけ作成する。既にあれば false */
  create(path: string, data: Data): Promise<boolean>
  /** ドキュメント全体を置き換える */
  set(path: string, data: Data): Promise<void>
  /** 指定したフィールドだけ更新する（undefined のフィールドは削除）。存在しなければ例外 */
  update(path: string, data: Data): Promise<void>
  delete(path: string): Promise<void>
  list<T = Data>(collectionPath: string): Promise<Doc<T>[]>
  /** 1フィールドの等価条件で検索する */
  query<T = Data>(collectionPath: string, field: string, value: string | number | boolean): Promise<Doc<T>[]>
}

const depth = (path: string) => path.split('/').length

export class MemoryStore implements Store {
  private docs = new Map<string, Data>()

  async get<T>(path: string): Promise<T | null> {
    const d = this.docs.get(path)
    return d ? (structuredClone(d) as T) : null
  }

  async create(path: string, data: Data): Promise<boolean> {
    if (this.docs.has(path)) return false
    this.docs.set(path, stripUndefined(structuredClone(data)))
    return true
  }

  async set(path: string, data: Data): Promise<void> {
    this.docs.set(path, stripUndefined(structuredClone(data)))
  }

  async update(path: string, data: Data): Promise<void> {
    const cur = this.docs.get(path)
    if (!cur) throw new Error(`not found: ${path}`)
    this.docs.set(path, stripUndefined({ ...cur, ...structuredClone(data) }))
  }

  async delete(path: string): Promise<void> {
    this.docs.delete(path)
  }

  async list<T>(collectionPath: string): Promise<Doc<T>[]> {
    const prefix = `${collectionPath}/`
    const out: Doc<T>[] = []
    for (const [path, data] of this.docs) {
      if (path.startsWith(prefix) && depth(path) === depth(collectionPath) + 1) {
        out.push({ id: path.slice(prefix.length), data: structuredClone(data) as T })
      }
    }
    return out
  }

  async query<T>(collectionPath: string, field: string, value: string | number | boolean): Promise<Doc<T>[]> {
    return (await this.list<Data>(collectionPath))
      .filter((d) => d.data[field] === value)
      .map((d) => d as Doc<T>)
  }
}

function stripUndefined(data: Data): Data {
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k]
  return data
}
