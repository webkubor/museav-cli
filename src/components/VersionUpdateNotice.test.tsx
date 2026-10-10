/**
 * 新版静默刷新组件测试（qa#741，口径对齐 prd#838）。
 * 路由：全局 App 外壳（Router 内）
 * API：轮询 /version.json
 */
import { StrictMode, useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionUpdateNotice } from './VersionUpdateNotice'

const { latestCommit, reloadCurrentPage } = vi.hoisted(() => ({
  latestCommit: { current: undefined as string | undefined },
  reloadCurrentPage: vi.fn(),
}))
const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
const KEY = 'app-version-refresh-target'

vi.mock('@/lib/version-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/version-check')>()),
  useLatestVersionCommit: () => latestCommit.current,
}))
vi.mock('@/lib/page-navigation', () => ({ reloadCurrentPage }))

const nav: { navigate: ((to: string) => void) | null } = { navigate: null }
const go = (to: string) => act(() => nav.navigate?.(to))
function Nav() {
  const navigate = useNavigate()
  useEffect(() => {
    nav.navigate = navigate
  }, [navigate])
  return null
}
function mount(strict = false) {
  const tree = (
    <MemoryRouter initialEntries={['/a']}>
      <Nav />
      <VersionUpdateNotice />
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

describe('VersionUpdateNotice（prd#838：静默、切页时刷新）', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    latestCommit.current = 'new-commit'
    vi.stubGlobal('__BUILD_COMMIT__', 'old-commit')
    reloadCurrentPage.mockClear()
  })

  afterEach(() => {
    if (sessionStorageDescriptor) Object.defineProperty(window, 'sessionStorage', sessionStorageDescriptor)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('发现新版时不立即刷新，长时间停留同一页保持旧版本', () => {
    mount(true)
    expect(reloadCurrentPage).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('发现新版后，下一次路由切换时刷新', () => {
    mount()
    go('/b')
    expect(reloadCurrentPage).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(KEY)).toBe('new-commit')
  })

  it('刷新后仍是旧 bundle 时，再切页也不再重载（防循环）', () => {
    vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as PerformanceNavigationTiming])
    window.sessionStorage.setItem(KEY, 'new-commit')
    mount()
    go('/b')
    expect(reloadCurrentPage).not.toHaveBeenCalled()
  })

  it('复制标签页继承刷新标记时，切页仍刷新一次', () => {
    vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' } as PerformanceNavigationTiming])
    window.sessionStorage.setItem(KEY, 'new-commit')
    mount()
    go('/b')
    expect(reloadCurrentPage).toHaveBeenCalledOnce()
  })

  it('已是最新版本：清除刷新标记，切页也不刷新', () => {
    latestCommit.current = 'old-commit'
    window.sessionStorage.setItem(KEY, 'new-commit')
    mount()
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
    go('/b')
    expect(reloadCurrentPage).not.toHaveBeenCalled()
  })

  it('线上没返回 commit 时不刷新', () => {
    latestCommit.current = undefined
    mount()
    go('/b')
    expect(reloadCurrentPage).not.toHaveBeenCalled()
  })

  it('刷新标记不可写时不冒险刷新', () => {
    const blocked = {
      ...window.sessionStorage,
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('storage unavailable') }),
      removeItem: vi.fn(),
    } as unknown as Storage
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: blocked })
    mount()
    go('/b')
    expect(blocked.setItem).toHaveBeenCalledWith(KEY, 'new-commit')
    expect(reloadCurrentPage).not.toHaveBeenCalled()
  })
})
