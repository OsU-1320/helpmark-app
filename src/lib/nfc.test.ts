import { afterEach, describe, expect, it } from 'vitest'
import { buildNfcUrl, getNfcToken, isLegacyNfcLaunch, isNfcLaunch } from './nfc'

const TOKEN = 'Abcdefghijklmnopqrstuvwxyz012345'

function open(url: string) {
  window.history.replaceState(null, '', url)
}

describe('NFCタグURL', () => {
  afterEach(() => open('/'))

  it('URLは、トークンだけを # の後ろに入れた短い形になる', () => {
    const url = new URL(buildNfcUrl(TOKEN))
    expect(url.hash).toBe(`#t=${TOKEN}`)
    expect(url.search).toBe('')
    expect(buildNfcUrl(TOKEN).length).toBeLessThan(80)
  })

  it('# の後ろのトークンを取り出せる（サーバーに送られる ? の後ろには、何も入らない）', () => {
    open(`/#t=${TOKEN}`)
    expect(getNfcToken()).toBe(TOKEN)
    expect(isNfcLaunch()).toBe(true)
  })

  it('形式が違うトークンや、トークンのないURLは、NFC起動とみなさない', () => {
    open('/#t=short')
    expect(isNfcLaunch()).toBe(false)
    open('/')
    expect(getNfcToken()).toBeNull()
  })

  it('古い形式のURLは、NFC起動とはせず、古い形式として判別する', () => {
    open('/?n=abc')
    expect(isNfcLaunch()).toBe(false)
    expect(isLegacyNfcLaunch()).toBe(true)
    open('/?src=nfc&pid=x&k=1')
    expect(isLegacyNfcLaunch()).toBe(true)
  })
})
