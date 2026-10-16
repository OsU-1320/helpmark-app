// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import * as api from './api'
import { MemoryStore } from './store'
import { rotateSealedFields } from './rotate'
import { createEphemeralVault, createVault, type Vault } from './vault'

const SECRET = (c: string) => c.repeat(40)

let vault: Vault
beforeAll(async () => {
  vault = await createEphemeralVault()
})

function setup() {
  const store = new MemoryStore()
  let now = Date.parse('2026-10-01T10:00:00Z')
  const sent: Array<{ title: string; body: string }> = []
  const ctxFor = async (id: string, secret = SECRET(id[0])): Promise<api.Ctx> => ({
    store,
    vault,
    callerId: await api.authenticate(store, id, secret, now),
    notify: async (title, body) => {
      sent.push({ title, body })
      return 1
    },
    now: () => now,
    contactDisclosure: true,
  })
  return { store, ctxFor, sent, advance: (ms: number) => (now += ms) }
}

const BEACON = 'beacon-0001'
const PARTNER = 'partner-001'
const PARTNER2 = 'partner-002'
const STRANGER = 'stranger-01'

async function registered() {
  const t = setup()
  const beacon = await t.ctxFor(BEACON)
  const { tagToken } = await api.putProfile(beacon, {
    profile: {
      nickname: 'たろう',
      categories: ['medical'],
      subOptions: ['med-contact'],
      note: '持病の薬を持っています',
      emergencyContactName: 'はなこ',
      emergencyContactPhone: '090-0000-0000',
      emergencyContactRelation: '母',
    },
    notificationLabels: ['急に倒れてしまうことがある'],
  })
  for (const id of [PARTNER, PARTNER2]) {
    const p = await t.ctxFor(id)
    await api.putProfile(p, { profile: { nickname: id } })
    await api.putSupporter(p, { token: `tok-${id}`, nickname: id })
  }
  /** 確認コード（要請者の画面に出るもの） */
  const codeOf = async (alertId: string) => ((await api.getAlert(beacon, alertId)) as { code: string }).code
  return { ...t, beacon, tagToken, codeOf }
}

describe('端末認証', () => {
  it('初回は登録され、別のシークレットでは拒否される', async () => {
    const { store } = setup()
    await expect(api.authenticate(store, BEACON, SECRET('a'), 0)).resolves.toBe(BEACON)
    await expect(api.authenticate(store, BEACON, SECRET('a'), 0)).resolves.toBe(BEACON)
    await expect(api.authenticate(store, BEACON, SECRET('b'), 0)).rejects.toMatchObject({ status: 401 })
    await expect(api.authenticate(store, null, SECRET('a'), 0)).rejects.toMatchObject({ status: 401 })
  })
})

describe('保存時の暗号化', () => {
  it('緊急連絡先・健康に関わる情報・タグのトークン・確認コードは、平文で保存されない', async () => {
    const { store, beacon, tagToken } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const dump = JSON.stringify(
      await Promise.all([
        store.get(`profiles/${BEACON}`),
        store.get(`emergencyContacts/${BEACON}`),
        store.get(`devices/${BEACON}`),
        store.get(`alerts/${alertId}`),
      ]),
    )
    for (const plain of ['090-0000-0000', 'はなこ', '持病の薬', 'med-contact', '急に倒れてしまう', tagToken]) {
      expect(dump).not.toContain(plain)
    }
    expect(dump).toContain('"v2.')
  })

  it('暗号文を別の文書にコピーしても、復号できない', async () => {
    const { store, beacon } = await registered()
    const copy = await store.get<{ enc: string }>(`emergencyContacts/${BEACON}`)
    await expect(vault.open(copy!.enc, 'emergencyContacts/someone-else')).rejects.toBeTruthy()
    expect(beacon).toBeTruthy()
  })
})

describe('暗号化の鍵の入れ替え', () => {
  const keyOf = (c: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(c)))

  it('入れ替え中も、古い鍵のデータが読める。読み直したあとは、新しい鍵だけですべて読める', async () => {
    const t = setup()
    const vaultA = await createVault({ id: 'a', key: keyOf(1) })
    const beacon = { ...(await t.ctxFor(BEACON)), vault: vaultA }
    await api.putProfile(beacon, {
      profile: { nickname: 'たろう', categories: ['medical'], note: '持病あり', emergencyContactName: 'はなこ', emergencyContactPhone: '090-0000-0000' },
      notificationLabels: ['急に倒れてしまう'],
    })
    const partner = { ...(await t.ctxFor(PARTNER)), vault: vaultA }
    await api.putProfile(partner, { profile: { nickname: PARTNER } })
    await api.putSupporter(partner, { token: 't', nickname: PARTNER })
    const { alertId } = await api.postAlert(beacon, {})
    const code = ((await api.getAlert(beacon, alertId)) as { code: string }).code
    const tagToken = ((await api.getMe(beacon)) as { tagToken: string }).tagToken

    // 入れ替えの開始：新しい鍵（b）で書き、前の鍵（a）でも読む。すべてのデータが、そのまま読める
    const vaultB = await createVault({ id: 'b', key: keyOf(2) }, [{ id: 'a', key: keyOf(1) }])
    const asB = (c: api.Ctx): api.Ctx => ({ ...c, vault: vaultB })
    expect(await api.getMe(asB(beacon))).toMatchObject({ tagToken })
    expect(((await api.getAlert(asB(beacon), alertId)) as { code: string }).code).toBe(code)

    // 読み直す：確認だけ（dry-run）では、何も変わらない
    const dry = await rotateSealedFields(t.store, vaultB, { dryRun: true })
    expect(dry.rotated).toBe(0)
    expect(dry.before['emergencyContacts.enc']).toEqual({ a: 1 })

    // 今の鍵で暗号化し直す
    const done = await rotateSealedFields(t.store, vaultB, { dryRun: false })
    expect(done.rotated).toBeGreaterThanOrEqual(5)
    const again = await rotateSealedFields(t.store, vaultB, { dryRun: false })
    expect(again.rotated).toBe(0)
    for (const counts of Object.values(again.before)) expect(Object.keys(counts).filter((k) => k !== 'b')).toEqual([])

    // 前の鍵を外しても（鍵 a を捨てても）、すべて読める。要請の流れも、そのまま動く
    const vaultC = await createVault({ id: 'b', key: keyOf(2) })
    const asC = (c: api.Ctx): api.Ctx => ({ ...c, vault: vaultC })
    expect(await api.getMe(asC(beacon))).toMatchObject({ tagToken })
    expect(((await api.getAlert(asC(beacon), alertId)) as { code: string }).code).toBe(code)
    await api.respond(asC(partner), alertId, {})
    await api.arrive(asC(partner), alertId)
    await api.verifyAlertTag(asC(partner), alertId, { token: tagToken })
    expect(await api.emergencyContact(asC(partner), alertId)).toMatchObject({ phone: '090-0000-0000' })
    expect(((await api.getAlert(asC(partner), alertId)) as { helpCard: { note: string } }).helpCard.note).toBe('持病あり')
  })

  it('読み直しの間に、アプリが書き換えたデータには、触れない', async () => {
    const t = setup()
    const vaultA = await createVault({ id: 'a', key: keyOf(1) })
    const beacon = { ...(await t.ctxFor(BEACON)), vault: vaultA }
    await api.putProfile(beacon, { profile: { nickname: 'たろう', emergencyContactPhone: '090-0000-0000' } })
    const vaultB = await createVault({ id: 'b', key: keyOf(2) }, [{ id: 'a', key: keyOf(1) }])
    // 読み直しの途中で、本人が、緊急連絡先を保存し直したことにする
    const racing = new Proxy(t.store, {
      get(target, prop, receiver) {
        if (prop === 'get') {
          return async (path: string) => {
            if (path === `emergencyContacts/${BEACON}`) {
              await api.putProfile({ ...beacon, vault: vaultB }, { profile: { nickname: 'たろう', emergencyContactPhone: '080-9999-9999' } })
            }
            return target.get(path)
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    })
    const report = await rotateSealedFields(racing, vaultB, { dryRun: false })
    expect(report.skipped).toBeGreaterThanOrEqual(1)
    const vaultC = await createVault({ id: 'b', key: keyOf(2) })
    const partner = await t.ctxFor(PARTNER)
    await api.putSupporter(partner, { token: 't', nickname: PARTNER })
    const stored = await t.store.get<{ enc: string }>(`emergencyContacts/${BEACON}`)
    expect(JSON.parse(await vaultC.open(stored!.enc, `emergencyContacts/${BEACON}`)).phone).toBe('080-9999-9999')
  })
})

describe('端末の引き継ぎ（紛失・機種変更）', () => {
  it('登録すると、引き継ぎコードが発行され、マイページで見られる。保存し直しても変わらない', async () => {
    const { beacon } = await registered()
    const me = (await api.getMe(beacon)) as { recoveryCode: string }
    expect(me.recoveryCode).toMatch(/^([A-Z2-9]{4}-){4}[A-Z2-9]{4}$/)
    const again = await api.putProfile(beacon, { profile: { nickname: 'たろう2' } })
    expect(again.recoveryCode).toBe(me.recoveryCode)
  })

  it('新しい端末で引き継ぐと、登録内容がそのまま戻り、元の端末は使えなくなる', async () => {
    const { store, beacon, ctxFor, tagToken } = await registered()
    const code = ((await api.getMe(beacon)) as { recoveryCode: string }).recoveryCode
    const oldSecret = SECRET(BEACON[0])

    const fresh = await ctxFor('new-phone-01')
    // 小文字・ハイフンなし・空白入りでも、照合できる
    const typed = ` ${code.replace(/-/g, '').toLowerCase()} `
    const r = await api.recoverProfile(fresh, { code: typed })
    expect(r.profileId).toBe(BEACON)
    expect(r.recoveryCode).not.toBe(code)

    // 新しい端末は、元の本人のIDで動く。登録内容（緊急連絡先を含む）も、そのまま取り出せる
    const moved = { ...fresh, callerId: await api.authenticate(store, BEACON, SECRET('n')) }
    expect(await api.getOwnProfile(moved)).toMatchObject({
      nickname: 'たろう',
      categories: ['medical'],
      note: '持病の薬を持っています',
      emergencyContactName: 'はなこ',
      emergencyContactRelation: '母',
      emergencyContactPhone: '090-0000-0000',
    })
    // タグは、そのまま使える。新しい端末のマイページに、新しい引き継ぎコードが出る
    expect(await api.getMe(moved)).toMatchObject({ tagToken, recoveryCode: r.recoveryCode })
    // 元の端末は、使えなくなる（端末の失効）
    await expect(api.authenticate(store, BEACON, oldSecret)).rejects.toMatchObject({ status: 401 })
    // 引き継ぎの前に、仮に作られていた登録は、片付けられる
    expect(await store.get('devices/new-phone-01')).toBeNull()
  })

  it('コードは一度使うと使えなくなる。間違えたコードは拒否され、回数に上限がある', async () => {
    const { beacon, ctxFor } = await registered()
    const code = ((await api.getMe(beacon)) as { recoveryCode: string }).recoveryCode
    const fresh = await ctxFor('new-phone-01')
    await api.recoverProfile(fresh, { code })
    const other = await ctxFor('new-phone-02')
    await expect(api.recoverProfile(other, { code })).rejects.toMatchObject({ status: 403 })
    await expect(api.recoverProfile(other, { code: '' })).rejects.toMatchObject({ status: 403 })
    for (let i = 0; i < 18; i++) await expect(api.recoverProfile(other, { code: 'AAAA-AAAA-AAAA-AAAA-AAAA' })).rejects.toMatchObject({ status: 403 })
    await expect(api.recoverProfile(other, { code: 'AAAA-AAAA-AAAA-AAAA-AAAA' })).rejects.toMatchObject({ status: 429 })
  })

  it('自分の端末で、自分のコードは使えない', async () => {
    const { beacon } = await registered()
    const code = ((await api.getMe(beacon)) as { recoveryCode: string }).recoveryCode
    await expect(api.recoverProfile(beacon, { code })).rejects.toMatchObject({ status: 400 })
  })

  it('パートナーの通知先は、引き継ぎで消える（元の端末に、通知が届き続けない）', async () => {
    const { store, ctxFor } = await registered()
    const partner = await ctxFor(PARTNER)
    const code = ((await api.getMe(partner)) as { recoveryCode: string }).recoveryCode
    expect(await api.getMe(partner)).toMatchObject({ isSupporter: true })
    await api.recoverProfile(await ctxFor('new-phone-03'), { code })
    expect(await store.get(`supporters/${PARTNER}`)).toBeNull()
  })

  it('再発行すると、古い引き継ぎコードはすぐに使えなくなる', async () => {
    const { beacon, ctxFor } = await registered()
    const old = ((await api.getMe(beacon)) as { recoveryCode: string }).recoveryCode
    const { recoveryCode } = await api.reissueRecoveryCode(beacon)
    expect(recoveryCode).not.toBe(old)
    await expect(api.recoverProfile(await ctxFor('new-phone-04'), { code: old })).rejects.toMatchObject({ status: 403 })
  })

  it('引き継ぎコードは、暗号化して保存され、ハッシュでしか引けない', async () => {
    const { store, beacon } = await registered()
    const code = ((await api.getMe(beacon)) as { recoveryCode: string }).recoveryCode
    expect(JSON.stringify(await store.get(`devices/${BEACON}`))).not.toContain(code.replace(/-/g, ''))
    expect(await store.get(`recoveryCodes/${code}`)).toBeNull()
  })
})

describe('タグのトークン', () => {
  it('トークンは、本人のIDや短い数字ではなく、長いランダムな文字列', async () => {
    const { tagToken } = await registered()
    expect(tagToken).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(tagToken).not.toContain(BEACON)
  })

  it('マイページで、同じトークンをもう一度取得できる', async () => {
    const { beacon, tagToken } = await registered()
    expect(await api.getMe(beacon)).toMatchObject({ tagToken })
  })

  it('プロフィールを保存し直しても、トークンは変わらない', async () => {
    const { beacon, tagToken } = await registered()
    const again = await api.putProfile(beacon, { profile: { nickname: 'たろう2' } })
    expect(again.tagToken).toBe(tagToken)
  })

  it('再発行すると、古いトークンはすぐに使えなくなる', async () => {
    const { beacon, ctxFor, tagToken } = await registered()
    const stranger = await ctxFor(STRANGER)
    await expect(api.tagStatus(stranger, { token: tagToken })).resolves.toMatchObject({ isOwn: false })
    const { tagToken: next } = await api.reissueTagToken(beacon)
    expect(next).not.toBe(tagToken)
    await expect(api.tagStatus(stranger, { token: tagToken })).rejects.toMatchObject({ status: 403 })
    await expect(api.tagStatus(stranger, { token: next })).resolves.toMatchObject({ open: false })
  })

  it('形式が違う・知らないトークンは、同じように拒否される（パスの注入もできない）', async () => {
    const { ctxFor } = await registered()
    const stranger = await ctxFor(STRANGER)
    for (const bad of ['', 'x', 'a'.repeat(32), '../profiles/beacon-0001', `${BEACON}/../../x`, 123, null]) {
      await expect(api.tagStatus(stranger, { token: bad })).rejects.toMatchObject({ status: 403 })
    }
  })

  it('自分のタグを、自分の端末で読んだと分かる', async () => {
    const { beacon, tagToken } = await registered()
    await expect(api.tagStatus(beacon, { token: tagToken })).resolves.toMatchObject({ isOwn: true })
  })
})

describe('支援要請の流れ', () => {
  it('緊急連絡先はプロフィールと分けて保存され、ヘルプカードに電話番号は載らない', async () => {
    const { store, beacon, ctxFor } = await registered()
    const profile = await store.get<Record<string, unknown>>(`profiles/${BEACON}`)
    expect(profile).not.toHaveProperty('emergencyContactPhone')
    expect(profile?.hasEmergencyContact).toBe(true)

    const { alertId } = await api.postAlert(beacon, { coords: { latitude: 35.68, longitude: 139.76 } })
    const partner = await ctxFor(PARTNER)
    await api.respond(partner, alertId, {})
    const view = (await api.getAlert(partner, alertId)) as { helpCard: Record<string, unknown> }
    expect(view.helpCard.hasEmergencyContact).toBe(true)
    expect(view.helpCard.note).toBe('持病の薬を持っています')
    expect(JSON.stringify(view)).not.toContain('090-0000-0000')
  })

  it('ヘルプカードを登録していない端末は、自分の要請を送れない', async () => {
    const { ctxFor } = await registered()
    await expect(api.postAlert(await ctxFor(STRANGER), {})).rejects.toMatchObject({ status: 403 })
  })

  it('同じ端末からの2回目の要請は新規作成も通知もしない', async () => {
    const { beacon, sent } = await registered()
    const first = await api.postAlert(beacon, {})
    const second = await api.postAlert(beacon, {})
    expect(second).toMatchObject({ alertId: first.alertId, duplicate: true })
    expect(sent).toHaveLength(1)
  })

  it('取り消しても、続けて送れるのは1分後から', async () => {
    const { beacon, advance } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    await api.cancel(beacon, alertId)
    await expect(api.postAlert(beacon, {})).rejects.toMatchObject({ status: 429 })
    advance(api.ALERT_MIN_INTERVAL_MS + 1000)
    await expect(api.postAlert(beacon, {})).resolves.toMatchObject({ ok: true })
  })

  it('通知の本文に、配慮事項（健康に関わる情報）を入れない', async () => {
    const { beacon, sent } = await registered()
    await api.postAlert(beacon, {})
    expect(JSON.stringify(sent)).not.toContain('倒れ')
    expect(sent[0].title).toContain('たろう')
  })

  it('他人のヘルプカードで送るにはタグのトークンが必要', async () => {
    const { ctxFor, tagToken } = await registered()
    const other = await ctxFor(STRANGER)
    await expect(api.postAlert(other, { token: 'x'.repeat(32) })).rejects.toMatchObject({ status: 403 })
    await expect(api.postAlert(other, { token: BEACON })).rejects.toMatchObject({ status: 403 })
    const ok = await api.postAlert(other, { token: tagToken })
    expect(ok.alertId).toBeTruthy()
  })

  it('要請一覧はパートナー登録済みの端末だけが見られる', async () => {
    const { beacon, ctxFor } = await registered()
    await api.postAlert(beacon, {})
    await expect(api.listActiveAlerts(await ctxFor(STRANGER))).rejects.toMatchObject({ status: 403 })
    const { alerts } = await api.listActiveAlerts(await ctxFor(PARTNER))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ activeResponderCount: 0, iResponded: false })
    await expect(api.getAlert(await ctxFor(STRANGER), alerts[0].id)).rejects.toMatchObject({ status: 403 })
  })

  it('一覧や対応前のパートナーには、要請者の恒久のIDを返さず、位置も約200mに丸める', async () => {
    const { beacon, ctxFor } = await registered()
    const { alertId } = await api.postAlert(beacon, { coords: { latitude: 36.09651, longitude: 140.10572 } })
    const partner = await ctxFor(PARTNER)
    const list = await api.listActiveAlerts(partner)
    expect(JSON.stringify(list)).not.toContain(BEACON)
    expect(list.alerts[0].lat).not.toBe(36.09651)
    expect(Math.abs((list.alerts[0].lat as number) - 36.09651)).toBeLessThan(0.002)
    const viewer = (await api.getAlert(partner, alertId)) as { role: string; alert: { lat: number } }
    expect(viewer.role).toBe('viewer')
    expect(viewer.alert.lat).not.toBe(36.09651)
    expect(JSON.stringify(viewer)).not.toContain(BEACON)

    // 対応を始めると、正確な位置が見える。要請者の恒久のIDは、それでも返さない
    await api.respond(partner, alertId, {})
    const responder = (await api.getAlert(partner, alertId)) as { alert: { lat: number } }
    expect(responder.alert.lat).toBe(36.09651)
    expect(JSON.stringify(responder)).not.toContain(BEACON)
    expect((await api.listActiveAlerts(partner)).alerts[0].lat).toBe(36.09651)
  })

  it('確認コードは、要請者にだけ見える', async () => {
    const { beacon, ctxFor, codeOf } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const code = await codeOf(alertId)
    expect(code).toMatch(/^\d{6}$/)
    const partner = await ctxFor(PARTNER)
    await api.respond(partner, alertId, {})
    expect(JSON.stringify(await api.getAlert(partner, alertId))).not.toContain(code)
    expect(JSON.stringify(await api.listActiveAlerts(partner))).not.toContain(code)
  })

  it('1時間を過ぎた要請は一覧に出ず、再送信で新しい要請になる', async () => {
    const { beacon, ctxFor, advance } = await registered()
    const first = await api.postAlert(beacon, {})
    advance(61 * 60 * 1000)
    expect((await api.listActiveAlerts(await ctxFor(PARTNER))).alerts).toHaveLength(0)
    const second = await api.postAlert(beacon, {})
    expect(second.alertId).not.toBe(first.alertId)
  })

  it('緊急連絡先は、到着後にタグまたはコードを確認した応答者だけが取得できる', async () => {
    const { beacon, ctxFor, tagToken, codeOf } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const partner = await ctxFor(PARTNER)
    await expect(api.emergencyContact(partner, alertId)).rejects.toMatchObject({ status: 403 })
    await api.respond(partner, alertId, {})
    await expect(api.emergencyContact(partner, alertId)).rejects.toMatchObject({ status: 403 })
    await api.arrive(partner, alertId)
    // 確認する前は渡さない
    await expect(api.emergencyContact(partner, alertId)).rejects.toMatchObject({ status: 403 })
    await expect(api.verifyAlertTag(partner, alertId, { code: '000000' })).rejects.toMatchObject({ status: 403 })
    await expect(api.emergencyContact(partner, alertId)).rejects.toMatchObject({ status: 403 })
    // タグ（トークン）で確認
    await api.verifyAlertTag(partner, alertId, { token: tagToken })
    await expect(api.emergencyContact(partner, alertId)).resolves.toEqual({ name: 'はなこ', relation: '母', phone: '090-0000-0000' })

    // コードで確認する別のパートナーでも同じ
    const p2 = await ctxFor(PARTNER2)
    await api.respond(p2, alertId, {})
    await api.arrive(p2, alertId)
    const fullWidth = (await codeOf(alertId)).replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0))
    await api.verifyAlertTag(p2, alertId, { code: ` ${fullWidth} ` })
    await expect(api.emergencyContact(p2, alertId)).resolves.toMatchObject({ phone: '090-0000-0000' })
  })

  it('別の人のタグでは確認できない', async () => {
    const { beacon, ctxFor, tagToken } = await registered()
    const other = await ctxFor('other-user-1')
    await api.putProfile(other, { profile: { nickname: '別の人' } })
    const otherToken = ((await api.getMe(other)) as { tagToken: string }).tagToken
    const { alertId } = await api.postAlert(beacon, {})
    const partner = await ctxFor(PARTNER)
    await api.respond(partner, alertId, {})
    await api.arrive(partner, alertId)
    await expect(api.verifyAlertTag(partner, alertId, { token: otherToken })).rejects.toMatchObject({ status: 403 })
    await expect(api.verifyAlertTag(partner, alertId, { token: tagToken })).resolves.toEqual({ ok: true })
  })

  it('コードを間違え続けると、その要請では、それ以上試せない（離脱と再対応でも戻らない）', async () => {
    const { beacon, ctxFor, codeOf } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const real = await codeOf(alertId)
    const wrong = real === '123456' ? '654321' : '123456'
    const partner = await ctxFor(PARTNER)
    await api.respond(partner, alertId, {})
    await api.arrive(partner, alertId)
    for (let i = 0; i < 10; i++) {
      // 5回ごとに、離脱して再対応しても、回数は戻らない
      if (i === 5) {
        await api.leave(partner, alertId)
        await api.respond(partner, alertId, {})
        await api.arrive(partner, alertId)
      }
      await expect(api.verifyAlertTag(partner, alertId, { code: wrong })).rejects.toMatchObject({ status: 403 })
    }
    await expect(api.verifyAlertTag(partner, alertId, { code: real })).rejects.toMatchObject({ status: 429 })
    // 本人がコードを作り直すと、また使える
    const { code } = await api.renewAlertCode(beacon, alertId)
    await expect(api.verifyAlertTag(partner, alertId, { code })).resolves.toEqual({ ok: true })
  })

  it('コードを作り直せるのは要請した本人だけ', async () => {
    const { beacon, ctxFor } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    await expect(api.renewAlertCode(await ctxFor(PARTNER), alertId)).rejects.toMatchObject({ status: 403 })
  })

  it('対応完了は、到着して相手のNFCタグを読んだ応答者か、要請者だけができる', async () => {
    const { beacon, ctxFor, tagToken } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const p1 = await ctxFor(PARTNER)
    const p2 = await ctxFor(PARTNER2)
    await api.respond(p1, alertId, {})
    await api.respond(p2, alertId, {})
    await expect(api.complete(p2, alertId)).rejects.toMatchObject({ status: 403 })
    await api.arrive(p1, alertId)
    // タグを読む前は押せない
    await expect(api.complete(p1, alertId)).rejects.toMatchObject({ status: 403 })
    await expect(api.verifyAlertTag(p1, alertId, { token: 'x'.repeat(32) })).rejects.toMatchObject({ status: 403 })
    await api.verifyAlertTag(p1, alertId, { token: tagToken })
    await api.complete(p1, alertId)
    const owner = (await api.getAlert(beacon, alertId)) as { alert: { status: string }; responders: Array<{ id: string; status: string }> }
    expect(owner.alert.status).toBe('completed')
    expect(owner.responders.find((r) => r.id === PARTNER)?.status).toBe('completed')
  })

  it('取り消しは要請した端末だけができる', async () => {
    const { beacon, ctxFor } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    await expect(api.cancel(await ctxFor(PARTNER), alertId)).rejects.toMatchObject({ status: 403 })
    await api.cancel(beacon, alertId)
    expect(((await api.getAlert(beacon, alertId)) as { alert: { status: string } }).alert.status).toBe('cancelled')
  })

  it('対応できなくなったら状態がleftになり位置も消える', async () => {
    const { beacon, ctxFor } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const partner = await ctxFor(PARTNER)
    await api.respond(partner, alertId, { coords: { latitude: 35.69, longitude: 139.77 } })
    await api.leave(partner, alertId)
    const owner = (await api.getAlert(beacon, alertId)) as { responders: Array<Record<string, unknown>> }
    expect(owner.responders[0]).toMatchObject({ status: 'left', lat: undefined, lng: undefined })
  })

  it('同じ種類の追加支援は60秒に1回まで、1つの要請で上限もある', async () => {
    const { beacon, ctxFor, advance } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const partner = await ctxFor(PARTNER)
    await api.respond(partner, alertId, {})
    await api.extraHelp(partner, alertId, { type: 'aed' })
    await expect(api.extraHelp(partner, alertId, { type: 'aed' })).rejects.toMatchObject({ status: 429 })
    await api.extraHelp(partner, alertId, { type: 'staff' })
    advance(61 * 1000)
    await expect(api.extraHelp(partner, alertId, { type: 'aed' })).resolves.toMatchObject({ ok: true })
    // 上限（12回）まで送り続けると、止まる
    let blocked = false
    for (let i = 0; i < 20 && !blocked; i++) {
      advance(61 * 1000)
      try {
        await api.extraHelp(partner, alertId, { type: 'more-hands' })
      } catch (e) {
        blocked = (e as { status: number }).status === 429
      }
    }
    expect(blocked).toBe(true)
  })

  it('対応できなくなった人が同じ要請にもう一度対応すると、向かっている状態に戻る', async () => {
    const { beacon, ctxFor } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const partner = await ctxFor(PARTNER)
    await api.respond(partner, alertId, {})
    await api.leave(partner, alertId)
    await api.respond(partner, alertId, {})
    const view = (await api.getAlert(partner, alertId)) as { myResponder: { status: string } }
    expect(view.myResponder.status).toBe('going')
  })

  it('1時間を過ぎた要請は応答者にも終了（expired）として見える', async () => {
    const { beacon, ctxFor, advance } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const partner = await ctxFor(PARTNER)
    await api.respond(partner, alertId, {})
    advance(61 * 60 * 1000)
    const view = (await api.getAlert(partner, alertId)) as { alert: { status: string } }
    expect(view.alert.status).toBe('expired')
  })

  it('Safariなど別の端末からタグで送った要請も、タグの持ち主の端末から見られ・取り消せる', async () => {
    const { ctxFor, tagToken } = await registered()
    const safari = await ctxFor(STRANGER)
    const { alertId } = await api.postAlert(safari, { token: tagToken })
    const owner = await ctxFor(BEACON)
    expect(await api.getMe(owner)).toMatchObject({ activeAlertId: alertId })
    expect(await api.getAlert(owner, alertId)).toMatchObject({ role: 'owner' })
    await api.cancel(owner, alertId)
    expect(((await api.getAlert(owner, alertId)) as { alert: { status: string } }).alert.status).toBe('cancelled')
  })

  it('タグの持ち主の要請が進行中なら、別の端末がタグを読んでも新しい要請は作られない', async () => {
    const { beacon, ctxFor, tagToken, sent } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    const partner = await ctxFor(PARTNER)
    await expect(api.tagStatus(partner, { token: tagToken })).resolves.toMatchObject({ open: true, alertId, isOwn: false })
    await expect(api.tagStatus(partner, { token: 'x'.repeat(32) })).rejects.toMatchObject({ status: 403 })
    const r = await api.postAlert(partner, { token: tagToken })
    expect(r).toMatchObject({ duplicate: true, othersAlert: true })
    expect(sent).toHaveLength(1)
  })

  it('送信時に位置が無くても、あとから本人の位置を更新できる（他人は不可）', async () => {
    const { beacon, ctxFor } = await registered()
    const { alertId } = await api.postAlert(beacon, {})
    await expect(api.updateRequesterLocation(await ctxFor(PARTNER), alertId, { coords: { latitude: 35.6, longitude: 139.7 } })).rejects.toMatchObject({ status: 403 })
    await api.updateRequesterLocation(beacon, alertId, { coords: { latitude: 35.6, longitude: 139.7 } })
    expect(((await api.getAlert(beacon, alertId)) as { alert: { lat: number } }).alert.lat).toBe(35.6)
  })
})

describe('タグでの本人確認の位置の確認と、連絡先の開示の停止', () => {
  const NEAR = { latitude: 35.6812, longitude: 139.7671 }
  const FAR = { latitude: 35.7812, longitude: 139.7671 }

  async function arrivedAt(coords: { latitude: number; longitude: number } | null) {
    const r = await registered()
    const { alertId } = await api.postAlert(r.beacon, { coords: NEAR })
    const partner = await r.ctxFor(PARTNER)
    await api.respond(partner, alertId, coords ? { coords } : {})
    await api.arrive(partner, alertId)
    return { ...r, alertId, partner }
  }

  it('要請の場所の近くにいる応答者は、タグで確認でき、連絡先を受け取れる', async () => {
    const { alertId, partner, tagToken } = await arrivedAt(NEAR)
    await api.verifyAlertTag(partner, alertId, { token: tagToken })
    expect(await api.emergencyContact(partner, alertId)).toMatchObject({ phone: '090-0000-0000' })
  })

  it('要請の場所から遠い・位置が無い応答者は、タグでは確認できない', async () => {
    const far = await arrivedAt(FAR)
    await expect(api.verifyAlertTag(far.partner, far.alertId, { token: far.tagToken })).rejects.toMatchObject({ status: 403 })
    const none = await arrivedAt(null)
    await expect(api.verifyAlertTag(none.partner, none.alertId, { token: none.tagToken })).rejects.toMatchObject({ status: 403 })
  })

  it('要請に位置が無いときは、位置では止めない', async () => {
    const r = await registered()
    const { alertId } = await api.postAlert(r.beacon, {})
    const partner = await r.ctxFor(PARTNER)
    await api.respond(partner, alertId, {})
    await api.arrive(partner, alertId)
    await expect(api.verifyAlertTag(partner, alertId, { token: r.tagToken })).resolves.toMatchObject({ ok: true })
  })

  it('開示を止めている間は、タグで確認できても、連絡先を渡さない（既定は、止めている）', async () => {
    const { alertId, partner, tagToken } = await arrivedAt(NEAR)
    await api.verifyAlertTag(partner, alertId, { token: tagToken })
    await expect(api.emergencyContact({ ...partner, contactDisclosure: false }, alertId)).rejects.toMatchObject({ status: 403 })
    await expect(api.emergencyContact({ ...partner, contactDisclosure: undefined }, alertId)).rejects.toMatchObject({ status: 403 })
    expect(await api.emergencyContact(partner, alertId)).toMatchObject({ phone: '090-0000-0000' })
  })
})
