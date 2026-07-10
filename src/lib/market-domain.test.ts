import { describe, expect, it } from 'vitest'
import { marketFromHostname } from '@/lib/market-domain'

describe('marketFromHostname — 域名→市场唯一真源', () => {
  it('modelgo.ai 系域名 = 海外', () => {
    expect(marketFromHostname('console.modelgo.ai')).toBe('global')
    expect(marketFromHostname('modelgo.ai')).toBe('global')
    expect(marketFromHostname('CONSOLE.MODELGO.AI')).toBe('global')
  })

  it('其余域名（含生产/测试/本地）一律国内', () => {
    expect(marketFromHostname('console.modelgo.com')).toBe('domestic')
    expect(marketFromHostname('console.test.modelgo.com')).toBe('domestic')
    expect(marketFromHostname('localhost')).toBe('domestic')
    expect(marketFromHostname('127.0.0.1')).toBe('domestic')
  })
})
