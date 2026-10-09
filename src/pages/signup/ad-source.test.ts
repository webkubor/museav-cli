import { beforeEach, describe, expect, it } from 'vitest'
import { adSourceFromSearchParams, clearPersistedAdSource, resolveAdSource } from './ad-source'

describe('ad-source', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('picks only known ad keys and drops empty values', () => {
    const sp = new URLSearchParams('gclid=g1&utm_source=google&foo=bar&campaign_id=&ad_group_id=ag9')
    expect(adSourceFromSearchParams(sp)).toEqual({ gclid: 'g1', utm_source: 'google', ad_group_id: 'ag9' })
  })

  it('persists URL values and falls back to session when URL has none', () => {
    resolveAdSource(new URLSearchParams('gclid=g1'))
    expect(resolveAdSource(new URLSearchParams(''))).toEqual({ gclid: 'g1' })
  })

  it('unwraps ad params folded into redirect query', () => {
    const sp = new URLSearchParams({ redirect: '/?utm_campaign=c7' })
    expect(resolveAdSource(sp)).toEqual({ utm_campaign: 'c7' })
  })

  it('returns undefined when nothing was ever captured', () => {
    expect(resolveAdSource(new URLSearchParams('aff=CN1'))).toBeUndefined()
  })

  it('clears the persisted value after registration', () => {
    resolveAdSource(new URLSearchParams('gclid=g1'))
    clearPersistedAdSource()
    expect(resolveAdSource(new URLSearchParams(''))).toBeUndefined()
  })
})
