/**
 * 新版提示组件测试（qa#741）。
 * 路由：全局 App 外壳
 * API：轮询 /version.json
 */
import { act, StrictMode } from 'react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionUpdateNotice } from './VersionUpdateNotice'

const { latestCommit, updateRefreshing, updateRefreshFailed, reloadCurrentPage } = vi.hoisted(() => ({
  latestCommit: { current: undefined as string | undefined },
  updateRefreshing: vi.fn(),
  updateRefreshFailed: vi.fn(),
  reloadCurrentPage: vi.fn(),
}))
const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage')

vi.mock('@/lib/version-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/version-check')>()),
  useLatestVersionCommit: () => latestCommit.current,
}))

vi.mock('@/lib/toast', () => ({
  toast: { updateRefreshing, updateRefreshFailed },
}))

vi.mock('@/lib/page-navigation', () => ({ reloadCurrentPage }))

describe('VersionUpdateNotice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.sessionStorage.clear()
    latestCommit.current = 'new-commit'
    vi.stubGlobal('__BUILD_COMMIT__', 'old-commit')
    updateRefreshing.mockClear()
    updateRefreshFailed.mockClear()
    reloadCurrentPage.mockClear()
  })

  afterEach(() => {
    if (sessionStorageDescriptor) {
      Object.defineProperty(window, 'sessionStorage', sessionStorageDescriptor)
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('提示新版后自动刷新，不等待点击', () => {
    render(
      <StrictMode>
        <VersionUpdateNotice />
      </StrictMode>,
    )

    expect(updateRefreshing).toHaveBeenCalledOnce()
    expect(reloadCurrentPage).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1500))
    expect(reloadCurrentPage).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('app-version-refresh-target')).toBe('new-commit')
  })

  it('同一新版刷新后仍未更新时停止重载循环', () => {
    vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as PerformanceNavigationTiming])
    window.sessionStorage.setItem('app-version-refresh-target', 'new-commit')
    render(<VersionUpdateNotice />)

    expect(updateRefreshFailed).toHaveBeenCalledOnce()
    act(() => vi.runOnlyPendingTimers())
    expect(reloadCurrentPage).not.toHaveBeenCalled()
  })

  it('复制标签页继承刷新标记时仍自动刷新一次', () => {
    vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' } as PerformanceNavigationTiming])
    window.sessionStorage.setItem('app-version-refresh-target', 'new-commit')
    render(<VersionUpdateNotice />)

    expect(updateRefreshing).toHaveBeenCalledOnce()
    expect(updateRefreshFailed).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1500))
    expect(reloadCurrentPage).toHaveBeenCalledOnce()
  })

  it('已处于最新版本时清除刷新标记且不显示提示', () => {
    latestCommit.current = 'old-commit'
    window.sessionStorage.setItem('app-version-refresh-target', 'new-commit')
    render(<VersionUpdateNotice />)

    expect(window.sessionStorage.getItem('app-version-refresh-target')).toBeNull()
    expect(updateRefreshing).not.toHaveBeenCalled()
    expect(updateRefreshFailed).not.toHaveBeenCalled()
  })

  it('刷新标记不可写时不冒险自动刷新', () => {
    expect(latestCommit.current).toBe('new-commit')
    expect(window.sessionStorage.getItem('app-version-refresh-target')).toBeNull()
    const blockedStorage = {
      ...window.sessionStorage,
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('storage unavailable')
      }),
      removeItem: vi.fn(),
    } as unknown as Storage
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: blockedStorage })
    render(<VersionUpdateNotice />)

    expect(blockedStorage.setItem).toHaveBeenCalledWith('app-version-refresh-target', 'new-commit')
    expect(updateRefreshFailed).toHaveBeenCalledOnce()
    act(() => vi.runOnlyPendingTimers())
    expect(reloadCurrentPage).not.toHaveBeenCalled()
  })

  it('组件卸载时取消待执行的自动刷新', async () => {
    const { unmount } = render(<VersionUpdateNotice />)
    unmount()
    await act(async () => Promise.resolve())
    act(() => vi.advanceTimersByTime(1500))

    expect(reloadCurrentPage).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('app-version-refresh-target')).toBeNull()
  })

  it('新版检测值消失时取消待执行的自动刷新', async () => {
    const { rerender } = render(<VersionUpdateNotice />)
    latestCommit.current = undefined
    rerender(<VersionUpdateNotice />)
    await act(async () => Promise.resolve())
    act(() => vi.advanceTimersByTime(1500))

    expect(reloadCurrentPage).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('app-version-refresh-target')).toBeNull()
  })
})
