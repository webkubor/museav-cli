/** deriveUserMonthSpend（需求方#570）：本月消费卡按当前用户（负责人）口径 */
import { describe, expect, it, vi } from 'vitest'
import type { ApiKeyItem } from '@/types'

// 同 derive.expired.test.ts：constants.tsx 的 @lobehub 图标在 vitest/node 下无法解析，mock 掉
vi.mock('./constants', () => ({ LIMIT_PERIOD_LABEL: {} }))
const { deriveUserMonthSpend } = await import('./derive')

function key(patch: Record<string, unknown>): ApiKeyItem {
  return { api_key_id: 'k', status: 'active', ...patch } as unknown as ApiKeyItem
}

const me = { account_id: 'acc-me', display_name: '我' }
const other = { account_id: 'acc-other', display_name: '别人' }

describe('deriveUserMonthSpend', () => {
  it('只累加负责人=当前账号的 key，排除他人的消费', () => {
    const items = [
      key({ owner: me, period_spend: { amount: '10.50', currency: 'CNY' } }),
      key({ owner: other, period_spend: { amount: '99.00', currency: 'CNY' } }),
      key({ owner: other, responsible_member: me, period_spend: { amount: '2.00', currency: 'CNY' } }),
    ]
    expect(deriveUserMonthSpend(items, 'acc-me')).toEqual({ amount: '12.50', currency: 'CNY' })
  })

  it('period_spend 缺失回退 total_spend；accountId 未加载时返回 0', () => {
    const items = [key({ owner: me, total_spend: { amount: '3.00', currency: 'CNY' } })]
    expect(deriveUserMonthSpend(items, 'acc-me')).toEqual({ amount: '3.00', currency: 'CNY' })
    expect(deriveUserMonthSpend(items, undefined).amount).toBe('0.00')
  })
})
