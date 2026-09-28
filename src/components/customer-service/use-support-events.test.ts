import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { pollMock } = vi.hoisted(() => ({ pollMock: vi.fn() }))
vi.mock('@/services/support', () => ({ pollSupportEvents: pollMock }))

import { useSupportEvents } from './use-support-events'

beforeEach(() => { vi.useFakeTimers(); pollMock.mockReset() })
afterEach(() => { vi.useRealTimers() })

it('carries since_version + wait, advances the cursor, and only calls back when events arrive', async () => {
  pollMock
    .mockResolvedValueOnce({ events: [{ id: 'e1', ticket_id: 'CS-1', version: 3, type: 'ticket.created' }], server_versions: [{ ticket_id: 'CS-1', version: 5 }] })
    .mockResolvedValueOnce(null) // 204：等到超时没新事件
    .mockImplementation(() => new Promise(() => {}))
  const onEvent = vi.fn()
  renderHook(() => useSupportEvents(true, 'CS-1', onEvent))

  await vi.advanceTimersByTimeAsync(0)
  expect(pollMock).toHaveBeenNthCalledWith(1, { ticketId: 'CS-1', sinceVersion: 0, wait: 25 }, expect.any(AbortSignal))
  expect(onEvent).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(0)
  // 第二轮游标取已见最大版本（server_versions 5 > event 3）
  expect(pollMock).toHaveBeenNthCalledWith(2, { ticketId: 'CS-1', sinceVersion: 5, wait: 25 }, expect.any(AbortSignal))
  expect(onEvent).toHaveBeenCalledTimes(1)
})

it('never storms: an empty round that returns instantly still waits ≥2s before the next one (2026-09-28 实测 60 次/秒)', async () => {
  pollMock.mockResolvedValue({ events: [], server_versions: [] })
  renderHook(() => useSupportEvents(true, 'CS-1', vi.fn()))
  await vi.advanceTimersByTimeAsync(0)
  expect(pollMock).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(1900)
  expect(pollMock).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(200)
  expect(pollMock).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(pollMock.mock.calls.length).toBeLessThanOrEqual(8)
})

it('aborts the in-flight poll when disabled', async () => {
  let seen: AbortSignal | undefined
  pollMock.mockImplementation((_q: unknown, signal: AbortSignal) => { seen = signal; return new Promise(() => {}) })
  const { rerender } = renderHook(({ on }) => useSupportEvents(on, 'CS-1', vi.fn()), { initialProps: { on: true } })
  await vi.advanceTimersByTimeAsync(0)
  expect(seen?.aborted).toBe(false)
  rerender({ on: false })
  expect(seen?.aborted).toBe(true)
})
