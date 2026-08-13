import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installChunkReloadGuard } from './chunk-reload'

function firePreloadError() {
  const event = new Event('vite:preloadError', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('installChunkReloadGuard', () => {
  let navigate: ReturnType<typeof vi.fn<(url: string) => void>>
  let nowValue: number
  let uninstall: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    navigate = vi.fn<(url: string) => void>()
    nowValue = 1_000_000
    uninstall = installChunkReloadGuard({ navigate, now: () => nowValue })
  })

  afterEach(() => {
    uninstall()
    vi.useRealTimers()
  })

  it('首次失败立即刷新并带 cache-bust 参数', () => {
    const event = firePreloadError()
    expect(event.defaultPrevented).toBe(true)
    vi.runAllTimers()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate.mock.calls[0][0]).toContain('mg_chunk_retry=1')
  })

  it('第二、三次失败按退避延迟刷新', () => {
    firePreloadError()
    vi.runAllTimers()

    nowValue += 1_000
    firePreloadError()
    vi.advanceTimersByTime(2_999)
    expect(navigate).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(navigate).toHaveBeenCalledTimes(2)
    expect(navigate.mock.calls[1][0]).toContain('mg_chunk_retry=2')

    nowValue += 1_000
    firePreloadError()
    vi.advanceTimersByTime(8_000)
    expect(navigate).toHaveBeenCalledTimes(3)
    expect(navigate.mock.calls[2][0]).toContain('mg_chunk_retry=3')
  })

  it('重试耗尽后不再刷新，交给 ErrorBoundary', () => {
    for (let i = 0; i < 3; i++) {
      nowValue += 1_000
      firePreloadError()
      vi.runAllTimers()
    }
    expect(navigate).toHaveBeenCalledTimes(3)

    nowValue += 1_000
    const event = firePreloadError()
    vi.runAllTimers()
    expect(event.defaultPrevented).toBe(false)
    expect(navigate).toHaveBeenCalledTimes(3)
  })

  it('距上次失败超过重置窗口后计数归零，可再次自动恢复', () => {
    for (let i = 0; i < 3; i++) {
      nowValue += 1_000
      firePreloadError()
      vi.runAllTimers()
    }
    expect(navigate).toHaveBeenCalledTimes(3)

    nowValue += 200_000
    firePreloadError()
    vi.runAllTimers()
    expect(navigate).toHaveBeenCalledTimes(4)
    expect(navigate.mock.calls[3][0]).toContain('mg_chunk_retry=1')
  })
})
