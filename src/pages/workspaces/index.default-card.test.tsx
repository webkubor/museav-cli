import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getProfile, setDefaultWorkspace } from '@/services/account'
import { listWorkspaces } from '@/services/workspaces'
import type { AccountProfile } from '@/types'

const role = vi.hoisted(() => ({ canManage: true }))
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/store/auth', () => ({ useAuthStore: (select: (s: object) => unknown) => select({ activeTenantId: 't1', account: { account_id: 'me' } }) }))
vi.mock('@/hooks/use-tenant-role', () => ({ useTenantRole: () => ({ isEnterprise: true, tenant: undefined, canManage: role.canManage }) }))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => false }) }))
vi.mock('@/services/workspaces', () => ({ listWorkspaces: vi.fn() }))
vi.mock('@/services/account', () => ({ getProfile: vi.fn(), setDefaultWorkspace: vi.fn() }))
vi.mock('@/lib/app-toast', () => ({ appToast: { success: vi.fn(), requestError: vi.fn() } }))
vi.mock('@/lib/track', () => ({ trackAction: vi.fn(), trackPageView: vi.fn(), trackEvent: vi.fn() }))
vi.mock('./workspace-dashboard', () => ({ WorkspaceDashboard: ({ workspaceId }: { workspaceId: string }) => <div data-testid="dashboard">{workspaceId}</div> }))
vi.mock('./workspace-create-modal', () => ({ WorkspaceCreateModal: () => null }))

import WorkspacesPage from './index'

const workspaces = [
  { workspace_id: 'ws-a', name: 'Alpha', slug: 'a', is_default: true, my_role: 'ws_member' },
  { workspace_id: 'ws-b', name: 'Beta', slug: 'b', is_default: false, my_role: 'ws_member', owner: { account_id: 'someone' } },
  { workspace_id: 'ws-c', name: 'Gamma', slug: 'c', is_default: false, my_role: 'ws_owner', owner: { account_id: 'me' } },
]
const profile = (id: string) => ({ default_workspace_id: id } as AccountProfile)
// 卡片 = 选中按钮（aria-label=空间名）所在容器；设默认按钮是选中按钮的兄弟节点
const selectBtn = (name: string) => screen.getByRole('button', { name })
const card = (name: string) => selectBtn(name).parentElement as HTMLElement
const badge = 'workspaces.defaultBadge'
const setBtn = 'workspaces.card.setDefault'

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><WorkspacesPage /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  role.canManage = true
  vi.mocked(listWorkspaces).mockResolvedValue(workspaces as never)
  vi.mocked(getProfile).mockResolvedValue(profile(''))
  vi.mocked(setDefaultWorkspace).mockResolvedValue({ default_workspace_id: 'ws-b' })
})

describe('默认空间入口在空间卡片上 (prd46#1209)', () => {
  it('账户未设偏好时「默认」回退显示 is_default 那张；其余卡片带「设为默认空间」与提示', async () => {
    setup()
    await waitFor(() => expect(within(card('Beta')).getByText(setBtn)).toBeInTheDocument())
    expect(within(card('Alpha')).getByText(badge)).toBeInTheDocument()
    expect(within(card('Alpha')).queryByText(setBtn)).not.toBeInTheDocument()
    expect(within(card('Beta')).getByRole('tooltip')).toHaveTextContent('workspaces.card.setDefaultTip')
  })

  it('「默认」标签跟账户偏好走，不再读 is_default', async () => {
    vi.mocked(getProfile).mockResolvedValue(profile('ws-b'));setup()
    await waitFor(() => expect(within(card('Beta')).getByText(badge)).toBeInTheDocument())
    expect(within(card('Alpha')).queryByText(badge)).not.toBeInTheDocument()
    expect(within(card('Alpha')).getByText(setBtn)).toBeInTheDocument()
  })

  it('点「设为默认空间」只写账户偏好：不选中卡片、不切详情；拉回后标签移过去', async () => {
    setup()
    const btn = await waitFor(() => within(card('Beta')).getByText(setBtn))
    expect(screen.getByTestId('dashboard')).toHaveTextContent('ws-a')
    vi.mocked(getProfile).mockResolvedValue(profile('ws-b'))
    fireEvent.click(btn)
    await waitFor(() => expect(setDefaultWorkspace).toHaveBeenCalledWith({ workspace_id: 'ws-b' }))
    await waitFor(() => expect(within(card('Beta')).getByText(badge)).toBeInTheDocument())
    expect(within(card('Alpha')).queryByText(badge)).not.toBeInTheDocument()
    expect(selectBtn('Beta')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('dashboard')).toHaveTextContent('ws-a')
  })

  it('「设为默认空间」与选中卡片的按钮是兄弟、不嵌套（原型 space-card-select）', async () => {
    setup()
    const btn = await waitFor(() => within(card('Beta')).getByRole('button', { name: setBtn }))
    expect(selectBtn('Beta').contains(btn)).toBe(false)
    expect(btn).toHaveAttribute('aria-describedby', 'ws-default-tip-ws-b')
    fireEvent.click(selectBtn('Beta'))
    expect(selectBtn('Beta')).toHaveAttribute('aria-pressed', 'true')
    // 选中流光（qa#468）：aria-pressed 挪到内部按钮后由卡片显式加
    expect(card('Beta')).toHaveClass('mg-running-border')
    expect(card('Alpha')).not.toHaveClass('mg-running-border')
    expect(setDefaultWorkspace).not.toHaveBeenCalled()
  })

  it('偏好指向的空间不在列表里时回退 is_default', async () => {
    vi.mocked(getProfile).mockResolvedValue(profile('ws-gone'));setup()
    await waitFor(() => expect(within(card('Alpha')).getByText(badge)).toBeInTheDocument())
  })

  it('偏好读取失败仍给入口（唯一入口），「默认」按 is_default 显示', async () => {
    vi.mocked(getProfile).mockRejectedValue(new Error('offline'));setup()
    await waitFor(() => expect(within(card('Beta')).getByText(setBtn)).toBeInTheDocument())
    expect(within(card('Alpha')).getByText(badge)).toBeInTheDocument()
  })

  it('保存失败报错，标签不动', async () => {
    const { appToast } = await import('@/lib/app-toast')
    vi.mocked(setDefaultWorkspace).mockRejectedValue(new Error('boom'));setup()
    fireEvent.click(await waitFor(() => within(card('Beta')).getByText(setBtn)))
    await waitFor(() => expect(appToast.requestError).toHaveBeenCalled())
    expect(within(card('Alpha')).getByText(badge)).toBeInTheDocument()
  })

  it('普通成员只在自己负责的空间上看到按钮（原型 canManageWorkspace）', async () => {
    role.canManage = false;setup()
    await waitFor(() => expect(within(card('Gamma')).getByText(setBtn)).toBeInTheDocument())
    expect(within(card('Beta')).queryByText(setBtn)).not.toBeInTheDocument()
  })
})
