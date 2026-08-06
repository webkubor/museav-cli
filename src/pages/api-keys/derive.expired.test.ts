/** isExpiredKey（需求方#485）：status 权威 + expires_at 回退口径 */
import { describe, expect, it, vi } from 'vitest'
import type { ApiKeyItem } from '@/types'

// constants.tsx 引 @lobehub 图标，其 fluent-emoji 的 ESM 目录导入在 vitest/node 下无法解析
// （存量环境问题，ModelsCompareModal.test.tsx 同样命中）；本测试只用 isExpiredKey，mock 掉即可
vi.mock('./constants', () => ({ LIMIT_PERIOD_LABEL: {} }))
const { isExpiredKey } = await import('./derive')

function key(patch: Partial<ApiKeyItem>): ApiKeyItem {
  return { api_key_id: 'k1', status: 'active', expires_at: null, scope: 'personal', ...patch } as unknown as ApiKeyItem
}

describe('isExpiredKey', () => {
  it('status=expired 视为已过期（后端权威，即使 expires_at 缺失）', () => {
    expect(isExpiredKey(key({ status: 'expired' }))).toBe(true)
  })

  it('expires_at 已过去 → 已过期（后端 #407 未落地时的回退）', () => {
    expect(isExpiredKey(key({ expires_at: '2000-01-01T00:00:00Z' }))).toBe(true)
  })

  it('expires_at 在未来 / 永不过期 / 非法值 → 未过期', () => {
    expect(isExpiredKey(key({ expires_at: '2999-01-01T00:00:00Z' }))).toBe(false)
    expect(isExpiredKey(key({ expires_at: null }))).toBe(false)
    expect(isExpiredKey(key({ expires_at: 'not-a-date' }))).toBe(false)
  })
})
