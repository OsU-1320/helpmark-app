// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createVault, SEALED_FIELDS, sealPath, type KeySpec } from './vault'

const key = (c: number): string => btoa(String.fromCharCode(...new Uint8Array(32).fill(c)))
const K1: KeySpec = { id: '1', key: key(1) }
const K2: KeySpec = { id: '2', key: key(2) }

describe('暗号化の鍵の入れ替え', () => {
  it('暗号化して、同じ鍵で復号できる。暗号文には鍵の名前が入る', async () => {
    const v = await createVault(K1)
    const sealed = await v.seal('秘密', 'a')
    expect(sealed.startsWith('v2.1.')).toBe(true)
    expect(await v.open(sealed, 'a')).toBe('秘密')
    expect(v.keyIdOf(sealed)).toBe('1')
    expect(v.isCurrent(sealed)).toBe(true)
  })

  it('保存先が違う（aad が違う）と、復号できない', async () => {
    const v = await createVault(K1)
    await expect(v.open(await v.seal('秘密', 'a'), 'b')).rejects.toBeTruthy()
  })

  it('新しい鍵で書き、前の鍵で作った暗号文も、入れ替え中は読める', async () => {
    const old = await createVault(K1)
    const sealedOld = await old.seal('古い', 'x')
    const rotating = await createVault(K2, [K1])
    expect(await rotating.open(sealedOld, 'x')).toBe('古い')
    expect(rotating.isCurrent(sealedOld)).toBe(false)
    const sealedNew = await rotating.seal('古い', 'x')
    expect(rotating.keyIdOf(sealedNew)).toBe('2')
    // 入れ替えが終わって、前の鍵を外すと、新しい暗号文だけが読める
    const after = await createVault(K2)
    expect(await after.open(sealedNew, 'x')).toBe('古い')
    await expect(after.open(sealedOld, 'x')).rejects.toBeTruthy()
  })

  it('前の鍵を知らない状態では、古い暗号文は読めない（鍵が漏れた鍵を捨てると、古い暗号文は読めなくなる）', async () => {
    const sealed = await (await createVault(K1)).seal('秘密', 'x')
    await expect((await createVault(K2)).open(sealed, 'x')).rejects.toThrow(/鍵/)
  })

  it('古い形式（v1）の暗号文は、名前が "1" の鍵で読める', async () => {
    const v = await createVault(K1)
    const [, , iv, ct] = (await v.seal('旧', 'x')).split('.')
    expect(await v.open(`v1.${iv}.${ct}`, 'x')).toBe('旧')
    expect(v.keyIdOf(`v1.${iv}.${ct}`)).toBe('1')
  })

  it('鍵の長さや名前が正しくないときは、作れない', async () => {
    await expect(createVault({ id: '1', key: btoa('short') })).rejects.toThrow()
    await expect(createVault({ id: 'a.b', key: key(1) })).rejects.toThrow()
    await expect(createVault(K1, [{ id: '1', key: key(2) }])).rejects.toThrow(/重なっ/)
  })

  it('暗号化している項目の一覧が、保存先の名前の規則と対応している', () => {
    expect(SEALED_FIELDS.map((f) => `${f.collection}.${f.field}`).sort()).toEqual([
      'alerts.codeEnc',
      'alerts.considerationsEnc',
      'devices.recoveryEnc',
      'devices.tagTokenEnc',
      'emergencyContacts.enc',
      'profiles.healthEnc',
    ])
    expect(sealPath.contact('x')).toBe('emergencyContacts/x')
    expect(SEALED_FIELDS.find((f) => f.field === 'enc')!.aad('x')).toBe(sealPath.contact('x'))
  })
})
