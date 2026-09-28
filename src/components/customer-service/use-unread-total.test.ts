import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }))
vi.mock('@/services/support', () => ({ listSupportTickets: listMock }))

import { useUnreadTotal } from './use-unread-total'

const page = (n: number) => ({ items: [{ ticket_id: 'FB-1', ticket_type: 'feedback', unread_count: n }], next_cursor: null, has_more: false })

beforeEach(() => listMock.mockReset())

it('does not carry account A’s unread count over when switching straight to account B', async () => {
  listMock.mockResolvedValueOnce(page(5))
  let finishB: (v: unknown) => void = () => {}
  listMock.mockImplementationOnce(() => new Promise((r) => { finishB = r }))
  const { result, rerender } = renderHook(({ id }) => useUnreadTotal(id, false, 0), { initialProps: { id: 'acc-A' as string | null } })
  await waitFor(() => expect(result.current).toBe(5))

  rerender({ id: 'acc-B' })
  // B 的数还没回来时不显示 A 的 5
  expect(result.current).toBe(0)
  finishB(page(2))
  await waitFor(() => expect(result.current).toBe(2))
})
