/**
 * prd46#1207：默认空间「设了不生效 / 刷新又跳回 Default」的前端半回归用例。
 *
 * 两条根因各自钉死：
 * ① 空间真源是接口 —— /auth/session 下发的 active_workspace_id 才是落点，localStorage 只是缓存，
 *    不得反过来覆盖接口（旧写法 `persistedWs || result.active_workspace_id`）。
 * ② 看详情 ≠ 换空间 —— 空间管理页挂载时只按所看空间重解析权限（保需求方#255 的 tab 显隐），
 *    绝不改写活跃空间；一旦改写，刷新时它会被当成显式 workspace_id 发出去，而显式参数
 *    优先于默认偏好，用户设的默认空间就永远落不回去。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  applySessionToStore,
  getInitialSession,
  getSessionWorkspaceIdFromLocation,
  resolvePermissionsForWorkspace,
  switchActiveWorkspace,
} from '@/lib/auth/refresh-session'
import { useAuthStore } from '@/store/auth'
import { storageKeys } from '@/lib/storage'
import { getSession } from '@/services/auth'
import { listWorkspaces } from '@/services/workspaces'
import { getProfile, setDefaultWorkspace } from '@/services/account'
import type { SessionResult, AccountProfile } from '@/types'

vi.mock('react-i18next', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-i18next')>(),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/services/auth', () => ({ getSession: vi.fn() }))
vi.mock('@/services/workspaces', () => ({ listWorkspaces: vi.fn() }))
vi.mock('@/services/account', () => ({ getProfile: vi.fn(), setDefaultWorkspace: vi.fn() }))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => true }) }))
vi.mock('@/hooks/use-tenant-role', () => ({ useTenantRole: () => ({ isEnterprise: true, canManage: true }) }))
vi.mock('@/lib/app-toast', () => ({ appToast: { success: vi.fn(), requestError: vi.fn() } }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn(), trackPageView: vi.fn(), trackAction: vi.fn() }))
vi.mock('./workspace-dashboard', () => ({
  WorkspaceDashboard: ({ workspaceId }: { workspaceId: string }) => <div data-testid="dashboard">{workspaceId}</div>,
}))
vi.mock('./workspace-create-modal', () => ({ WorkspaceCreateModal: () => null }))

import WorkspacesPage from './index'

const TENANT = 'tenant-1'
const realLocation = window.location

/**
 * 替换成轻量 location 对象（同 lib/market.test.ts 的做法）。
 * hostname/search 必须一并给：storageKeys 走 detectMarket 读 hostname，少了会在建 key 时就炸。
 */
function setPath(pathname: string) {
  Object.defineProperty(window, 'location', {
    value: { pathname, hostname: 'console.modelgo.com', search: '' },
    writable: true,
    configurable: true,
  })
}

/** 构造一份 /auth/session 回包；只关心空间与权限两段，其余字段补齐给类型 */
function sessionResult(activeWorkspaceId: string, granted: string[] = []): SessionResult {
  return {
    account: { account_id: 'acc-1', email: 'qa@modelgo.com', display_name: 'QA' },
    active_tenant_id: TENANT,
    active_workspace_id: activeWorkspaceId,
    tenants: [{ tenant_id: TENANT, name: 'Tenant 1' }],
    permissions: { granted, menus: [] },
    session: {},
  } as unknown as SessionResult

}

const workspaces = [
  { workspace_id: 'ws-1', name: 'Default', slug: 'default', is_default: true, my_role: 'ws_owner', owner: { account_id: 'me' } },
  { workspace_id: 'ws-2', name: '新项目空间', slug: 'new-project', is_default: false, my_role: 'ws_owner', owner: { account_id: 'me' } },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setPath('/workspaces')
  useAuthStore.setState({
    account: { account_id: 'me', email: 'qa@modelgo.com', display_name: 'QA' } as SessionResult['account'],
    activeTenantId: TENANT,
    activeWorkspaceId: 'ws-preferred',
    permissions: [],
    menus: [],
  })
})

afterEach(() => {
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
})

describe('① 空间落点以接口为准（prd46#1207 ①）', () => {
  it('applySessionToStore 用接口下发的 active_workspace_id，localStorage 里的旧空间不得反盖', () => {
    localStorage.setItem(storageKeys.activeTenantId(), TENANT)
    localStorage.setItem(storageKeys.activeWorkspaceId(TENANT), 'ws-stale-default')

    applySessionToStore(sessionResult('ws-new-project'))

    expect(useAuthStore.getState().activeWorkspaceId).toBe('ws-new-project')
    // 缓存同步回写成接口权威值，避免下一次又拿旧值去问
    expect(localStorage.getItem(storageKeys.activeWorkspaceId(TENANT))).toBe('ws-new-project')
  })

  // 浏览器实测揪出来的：接口不给空间时若直接传 undefined，store 的 `activeWorkspaceId || null`
  // 会把活跃空间清空（侧栏空间直接没了）。方向必须是「接口优先、缓存兜底」，不是「丢掉缓存」。
  it('接口没下发空间时退回缓存兜底，不得把活跃空间清空', () => {
    localStorage.setItem(storageKeys.activeTenantId(), TENANT)
    localStorage.setItem(storageKeys.activeWorkspaceId(TENANT), 'ws-cached')
    useAuthStore.setState({ activeWorkspaceId: 'ws-cached' })

    applySessionToStore(sessionResult(''))

    expect(useAuthStore.getState().activeWorkspaceId).toBe('ws-cached')
  })

  it('非空间路由刷新时不带 workspace_id，让后端按账号在该企业的默认偏好落点', async () => {
    // QA 复现前提：localStorage 里压着上次被空间管理页写进去的 Default。
    // 显式参数优先于默认偏好 —— 发出去就等于永远落回 Default。
    localStorage.setItem(storageKeys.activeTenantId(), TENANT)
    localStorage.setItem(storageKeys.activeWorkspaceId(TENANT), 'ws-stale-default')
    vi.mocked(getSession).mockResolvedValueOnce(sessionResult('ws-preferred'))

    expect(getSessionWorkspaceIdFromLocation()).toBeUndefined()
    await getInitialSession()

    expect(getSession).toHaveBeenCalledWith(undefined)
  })

  it('空间专属路由（/workspace/:id/*）刷新时按 URL 指定空间解析，保住深链权限', async () => {
    setPath('/workspace/ws-specific/api-keys')
    vi.mocked(getSession).mockResolvedValueOnce(sessionResult('ws-specific'))

    expect(getSessionWorkspaceIdFromLocation()).toBe('ws-specific')
    await getInitialSession()

    expect(getSession).toHaveBeenCalledWith('ws-specific')
  })
})

describe('② 看详情只重解析权限，不改写活跃空间（prd46#1207 ②）', () => {
  beforeEach(() => {
    localStorage.setItem(storageKeys.activeTenantId(), TENANT)
    localStorage.setItem(storageKeys.activeWorkspaceId(TENANT), 'ws-preferred')
  })

  it('按所看空间重解析权限码与菜单（保需求方#255：负责人进自有非默认空间仍有 tab）', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(sessionResult('ws-viewed', ['workspace:settings:edit']))

    await resolvePermissionsForWorkspace('ws-viewed')

    expect(getSession).toHaveBeenCalledWith('ws-viewed')
    expect(useAuthStore.getState().permissions).toEqual(['workspace:settings:edit'])
  })

  it('重解析不得改写活跃空间与 localStorage（否则刷新时又把它当显式参数盖掉默认偏好）', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(sessionResult('ws-viewed', ['workspace:settings:edit']))

    await resolvePermissionsForWorkspace('ws-viewed')

    expect(useAuthStore.getState().activeWorkspaceId).toBe('ws-preferred')
    expect(localStorage.getItem(storageKeys.activeWorkspaceId(TENANT))).toBe('ws-preferred')
  })

  it('连点两张卡片时只认最后一次：先发的慢响应不得覆盖后发的权限', async () => {
    // 点 A（慢）→ 点 B（快）。B 先回，A 后回；最终权限必须是 B 的。
    let resolveA!: (v: SessionResult) => void
    vi.mocked(getSession)
      .mockImplementationOnce(() => new Promise<SessionResult>((res) => { resolveA = res }))
      .mockResolvedValueOnce(sessionResult('ws-B', ['perm:B']))

    const pA = resolvePermissionsForWorkspace('ws-A')
    const pB = resolvePermissionsForWorkspace('ws-B')
    await pB
    expect(useAuthStore.getState().permissions).toEqual(['perm:B'])

    resolveA(sessionResult('ws-A', ['perm:A']))
    await pA

    expect(useAuthStore.getState().permissions).toEqual(['perm:B'])
  })

  it('重解析失败时静默保持原权限，不阻断查看详情', async () => {
    useAuthStore.setState({ permissions: ['old:perm'] })
    vi.mocked(getSession).mockRejectedValueOnce(new Error('boom'))

    await expect(resolvePermissionsForWorkspace('ws-viewed')).resolves.toBeUndefined()

    expect(useAuthStore.getState().permissions).toEqual(['old:perm'])
    expect(useAuthStore.getState().activeWorkspaceId).toBe('ws-preferred')
  })
})

describe('设为默认空间后的即时反馈', () => {
  it('设默认成功后活跃空间同步为该空间，侧栏切换器无需刷新即对齐', async () => {
    vi.mocked(listWorkspaces).mockResolvedValue(workspaces as never)
    vi.mocked(getProfile).mockResolvedValue({ default_workspace_id: 'ws-1' } as AccountProfile)
    vi.mocked(setDefaultWorkspace).mockResolvedValue({ default_workspace_id: 'ws-2' })

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/workspaces']}>
          <WorkspacesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('新项目空间')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'workspaces.card.setDefault' }))

    await waitFor(() => {
      expect(setDefaultWorkspace).toHaveBeenCalledWith({ workspace_id: 'ws-2' })
      expect(useAuthStore.getState().activeWorkspaceId).toBe('ws-2')
    })
  })
})

// 评审（Codex / Claude Code）发现的两条回归，均由「看详情不再改写活跃空间」这一解耦带出。
describe('解耦带出的回归（评审发现）', () => {
  it('在 /workspace/A/* 深链上切到 B：必须按 B 重拉，不能被滞后的 URL(A) 写回 A', async () => {
    setPath('/workspace/ws-A/api-keys')
    localStorage.setItem(storageKeys.activeTenantId(), TENANT)
    useAuthStore.setState({ activeWorkspaceId: 'ws-A' })
    // 后端按请求回显：传谁返回谁
    vi.mocked(getSession).mockImplementation(async (id?: string) => sessionResult(id || 'ws-FALLBACK'))

    // 切换发生在导航之前，此刻 location 仍是 /workspace/ws-A/*
    await switchActiveWorkspace('ws-B')

    expect(getSession).toHaveBeenCalledWith('ws-B')
    expect(useAuthStore.getState().activeWorkspaceId).toBe('ws-B')
    expect(localStorage.getItem(storageKeys.activeWorkspaceId(TENANT))).toBe('ws-B')
  })

  it('在非活跃空间里改完负责人，要按「所看空间」重解析权限，而不是活跃空间', async () => {
    // 活跃空间 A，正在空间管理里看 B；对 B 执行了改权限的操作
    localStorage.setItem(storageKeys.activeTenantId(), TENANT)
    localStorage.setItem(storageKeys.activeWorkspaceId(TENANT), 'ws-ACTIVE')
    useAuthStore.setState({ activeWorkspaceId: 'ws-ACTIVE' })
    vi.mocked(getSession).mockImplementation(async (id?: string) => sessionResult(id || 'ws-ACTIVE', [`perm:${id}`]))

    await resolvePermissionsForWorkspace('ws-VIEWED')

    expect(getSession).toHaveBeenLastCalledWith('ws-VIEWED')
    expect(useAuthStore.getState().permissions).toEqual(['perm:ws-VIEWED'])
    // 且活跃空间不被这次操作带走
    expect(useAuthStore.getState().activeWorkspaceId).toBe('ws-ACTIVE')
  })
})
