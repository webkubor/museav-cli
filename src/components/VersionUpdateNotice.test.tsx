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
  const tree = () => (
    <MemoryRouter initialEntries={['/a']}>
      <Nav />
      <VersionUpdateNotice />
    </MemoryRouter>
  )
  const wrap = () => (strict ? <StrictMode>{tree()}</StrictMode> : tree())
  const view = render(wrap())
  // 模拟 /version.json 的响应到达：改完 latestCommit 后重渲染（必须是新元素，否则 React 会跳过渲染）
  return { ...view, responseArrived: () => view.rerender(wrap()) }
}
/** 整页刷新后的新文档：导航类型是 reload。 */
const asReloadedDocument = () =>
  vi.spyOn(window.performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as PerformanceNavigationTiming])

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

  // 真实时序：刷新后的新文档首次渲染时 /version.json 还没回来（latestCommit 为 undefined），
  // 响应到达后才有值。上面几条防循环用例都是一上来就给好 latestCommit，覆盖不到这一步（#1255 验收项 5）。
  it('新文档里 /version.json 还没回来时不清防循环标记；响应到达后仍是旧 bundle，切页不再重载', () => {
    asReloadedDocument()
    window.sessionStorage.setItem(KEY, 'new-commit')
    latestCommit.current = undefined
    const { responseArrived } = mount(true)
    expect(window.sessionStorage.getItem(KEY)).toBe('new-commit')
    latestCommit.current = 'new-commit'
    responseArrived()
    go('/b')
    go('/c')
    expect(reloadCurrentPage).not.toHaveBeenCalled()
  })

  it('响应到达后确认已是新版，才清掉刷新标记', () => {
    asReloadedDocument()
    window.sessionStorage.setItem(KEY, 'new-commit')
    latestCommit.current = undefined
    const { responseArrived } = mount()
    expect(window.sessionStorage.getItem(KEY)).toBe('new-commit')
    latestCommit.current = 'old-commit'
    responseArrived()
    expect(window.sessionStorage.getItem(KEY)).toBeNull()
  })

  it('完整链路：旧页切页刷新一次，刷新后仍是旧 bundle，之后无论切多少次页都不再刷新', () => {
    const firstDocument = mount()
    go('/b')
    expect(reloadCurrentPage).toHaveBeenCalledOnce()
    firstDocument.unmount()

    // 整页刷新后的新文档：标记还在 sessionStorage，bundle 仍是旧的，/version.json 还没回来
    asReloadedDocument()
    latestCommit.current = undefined
    const secondDocument = mount()
    latestCommit.current = 'new-commit'
    secondDocument.responseArrived()
    go('/b')
    go('/a')
    go('/c')
    expect(reloadCurrentPage).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(KEY)).toBe('new-commit')
  })
})
