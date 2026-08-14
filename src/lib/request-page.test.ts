import { describe, expect, it } from 'vitest'
import { normalizePage } from '@/lib/request'
import type { CursorPage } from '@/types'

/**
 * 分页响应归一契约（需求方#635 的根治点）。
 *
 * 后端同一批列表接口在不同情形下会回三种形态，页面组件曾各自 `?.items.find(...)`
 * 兜底，补一处漏一处（修完同步日志详情浮层，同页异步任务浮层照样崩）。归一收在
 * getPage 一处，这些用例就是那份契约本身——`items` 必须恒为数组。
 */
describe('normalizePage', () => {
  it('正常分页响应原样通过', () => {
    const raw: CursorPage<{ id: string }> = {
      items: [{ id: 'a' }],
      page_size: 20,
      has_more: true,
      next_cursor: 'c1',
    }
    expect(normalizePage(raw)).toEqual(raw)
  })

  it('空列表回 items: null → 归一成空数组（原崩溃点）', () => {
    const raw = { items: null, page_size: 20, has_more: false, next_cursor: null } as unknown as CursorPage<unknown>
    expect(normalizePage(raw).items).toEqual([])
  })

  it('响应完全没有 items 字段 → 归一成空数组', () => {
    const raw = { page_size: 20 } as unknown as CursorPage<unknown>
    expect(normalizePage(raw).items).toEqual([])
  })

  it('接口直接回裸数组 → 包成分页结构', () => {
    const page = normalizePage([{ id: 'a' }, { id: 'b' }] as unknown as CursorPage<{ id: string }>['items'])
    expect(page.items).toHaveLength(2)
    expect(page.has_more).toBe(false)
    expect(page.next_cursor).toBeNull()
  })

  it('null / undefined 响应 → 空分页，不抛错', () => {
    expect(normalizePage(null).items).toEqual([])
    expect(normalizePage(undefined).items).toEqual([])
  })

  it('保留响应上的额外字段（如 members 的 pending_invitations）', () => {
    type MembersPage = CursorPage<unknown> & { pending_invitations: unknown[] }
    const raw = { items: null, pending_invitations: [{ email: 'a@b.c' }] } as unknown as MembersPage
    const page = normalizePage<MembersPage>(raw)
    expect(page.items).toEqual([])
    expect(page.pending_invitations).toEqual([{ email: 'a@b.c' }])
  })
})
