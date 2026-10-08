import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceDashboard } from './workspace-dashboard'
import { getWorkspace } from '@/services/workspaces'
import { getProfile, setDefaultWorkspace } from '@/services/account'
import type { WorkspaceDetail, AccountProfile } from '@/types'
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => false }) }))
vi.mock('@/hooks/use-tenant-role', () => ({ useTenantRole: () => ({ isEnterprise: true }) }))
vi.mock('@/lib/auth/refresh-session', () => ({ switchActiveWorkspace: vi.fn() }))
vi.mock('@/services/account', () => ({ getProfile: vi.fn(), setDefaultWorkspace: vi.fn() }))
vi.mock('@/services/workspaces', () => ({ getWorkspace: vi.fn(), updateWorkspace: vi.fn(), deleteWorkspace: vi.fn() }))
vi.mock('@/pages/settings/workspace-detail', async () => ({ SettingsTab: (await import('@/pages/settings/workspace-detail/settings-tab')).SettingsTab, MembersTab: () => null, LogsForwardingTab: () => null }))
vi.mock('@/lib/app-toast', () => ({ appToast: { success: vi.fn(), requestError: vi.fn() } }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn(), trackAction: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getWorkspace).mockResolvedValue({ workspace_id: 'member-ws', name: 'Member workspace', slug: 'member', is_default: false } as WorkspaceDetail)
  vi.mocked(getProfile).mockResolvedValue({ default_workspace_id: '' } as AccountProfile)
  vi.mocked(setDefaultWorkspace).mockResolvedValue({ default_workspace_id: 'member-ws' })
})
describe('real workspace parent keeps personal preferences reachable #1097', () => {
  it('成员打开设置深链：只读字段，没有默认空间开关与管理操作（默认入口已迁到卡片，prd46#1209）', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={qc}><MemoryRouter><WorkspaceDashboard workspaceId="member-ws" initialTab="settings" onDeleted={vi.fn()} /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByDisplayValue('Member workspace')).toBeDisabled()
    expect(screen.getByRole('tab', { name: /workspaces.detail.tabs.settings/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'workspaces.detail.settings.delete' })).not.toBeInTheDocument()
    expect(setDefaultWorkspace).not.toHaveBeenCalled()
  })
  it('切到另一个空间时设置表单按新空间重建，不残留上一个空间的名称（prd46#1206 QA 复现）', async () => {
    const byId: Record<string, WorkspaceDetail> = {
      'ws-a': { workspace_id: 'ws-a', name: 'Workspace A', slug: 'a', is_default: false } as WorkspaceDetail,
      'ws-b': { workspace_id: 'ws-b', name: 'Workspace B', slug: 'b', is_default: false } as WorkspaceDetail,
    }
    vi.mocked(getWorkspace).mockImplementation(async (id: string) => byId[id])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const view = (id: string) => <QueryClientProvider client={qc}><MemoryRouter><WorkspaceDashboard workspaceId={id} initialTab="settings" onDeleted={vi.fn()} /></MemoryRouter></QueryClientProvider>
    // 先把 A、B 的详情都加载进缓存，再从 B 切回已缓存的 A：此时 dashboard 不经过 loading，
    // 设置表单若不按空间重建就会沿用 B 的本地 state（QA 现场就是切回已看过的空间）
    const { rerender } = render(view('ws-a'))
    expect(await screen.findByDisplayValue('Workspace A')).toBeInTheDocument()
    rerender(view('ws-b'))
    expect(await screen.findByDisplayValue('Workspace B')).toBeInTheDocument()
    rerender(view('ws-a'))
    await waitFor(() => expect(screen.getByDisplayValue('Workspace A')).toBeInTheDocument())
    expect(screen.queryByDisplayValue('Workspace B')).not.toBeInTheDocument()
  })
})
