/**
 * 「本月消费」= 当前空间全部 Key 的消费合计（PRD modelgo_prd/src/App.tsx:13890 的 workspaceSpend）。
 * 不按负责人过滤、不按角色分口径——#570 那套 member=self 的分流是 QA BUG 单、非 PRD，已被打回（prd46#1056）。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ApiKeyItem } from '@/types'

vi.mock('./constants', () => ({ LIMIT_PERIOD_LABEL: {} }))
const { deriveSummary } = await import('./derive')

function key(id: string, ownerId: string, amount: string): ApiKeyItem {
  return {
    api_key_id: id,
    status: 'active',
    expires_at: null,
    scope: 'member',
    owner: { member_id: ownerId, name: ownerId },
    period_spend: { amount, currency: 'CNY' },
    total_spend: { amount: '0', currency: 'CNY' },
  } as unknown as ApiKeyItem
}

describe('deriveSummary.month_spend', () => {
  it('合计整个空间，不区分负责人是不是当前账号', () => {
    const items = [key('k1', 'me', '10.00'), key('k2', 'other', '32.50')]
    expect(deriveSummary(items).month_spend).toEqual({ amount: '42.50', currency: 'CNY' })
  })

  it('空列表 → 0.00，不返回 undefined（卡片要显示 ¥0.00 而非空白）', () => {
    expect(deriveSummary([]).month_spend).toEqual({ amount: '0.00', currency: 'CNY' })
  })
})
