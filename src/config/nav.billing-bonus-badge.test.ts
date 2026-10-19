import { describe, expect, it } from 'vitest'
import zh from '@/locales/zh/nav.json'
import en from '@/locales/en/nav.json'
import { navConfig } from './nav'

const t = (key: string) => key

describe('导航首充角标（#1380）', () => {
  it('中英文文案与需求一致，且金额占位符一致', () => {
    expect(zh.nav.billingBonusBadge).toBe('最高送 {{max}}')
    expect(en.nav.billingBonusBadge).toBe('Up to {{max}} bonus')
    expect(zh.nav.billingBonusBadge.match(/\{\{max\}\}/g)).toHaveLength(1)
    expect(en.nav.billingBonusBadge.match(/\{\{max\}\}/g)).toHaveLength(1)
  })

  it('账单管理项挂上角标文案；无文案时不挂', () => {
    const ctx = { isNonPersonal: true, isDomestic: false, isDevTools: false, isOrgManager: false, isSpaceManager: false }
    const find = (c: typeof ctx & { billingBonusBadge?: string }) =>
      navConfig.groups(c, t, {}).flatMap((g) => g.items).find((i) => i.itemKey === 'billing')

    expect(find({ ...ctx, billingBonusBadge: '最高送 $10.00' })?.badge).toBe('最高送 $10.00')
    expect(find(ctx)?.badge).toBeUndefined()
  })
})
