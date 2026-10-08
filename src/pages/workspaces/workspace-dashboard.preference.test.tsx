import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkspaceDashboard } from './workspace-dashboard'
import { getWorkspace } from '@/services/workspaces'
import { getProfile, setDefaultWorkspace } from '@/services/account'
import type { WorkspaceDetail, AccountProfile } from '@/types'
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
const perms = vi.hoisted(() => ({ allow: false }))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => perms.allow }) }))
vi.mock('@/hooks/use-tenant-role', () => ({ useTenantRole: () => ({ isEnterprise: true }) }))
vi.mock('@/lib/auth/refresh-session', () => ({ switchActiveWorkspace: vi.fn() }))
vi.mock('@/services/account', () => ({ getProfile: vi.fn(), setDefaultWorkspace: vi.fn() }))
vi.mock('@/services/workspaces', () => ({ getWorkspace: vi.fn(), updateWorkspace: vi.fn(), deleteWorkspace: vi.fn() }))
vi.mock('@/pages/settings/workspace-detail', async () => ({ SettingsTab: (await import('@/pages/settings/workspace-detail/settings-tab')).SettingsTab, MembersTab: () => null, LogsForwardingTab: () => null }))
vi.mock('@/lib/app-toast', () => ({ appToast: { success: vi.fn(), requestError: vi.fn() } }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn(), trackAction: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  perms.allow = false
  vi.mocked(getWorkspace).mockResolvedValue({ workspace_id: 'member-ws', name: 'Member workspace', slug: 'member', is_default: false } as WorkspaceDetail)
  vi.mocked(getProfile).mockResolvedValue({ default_workspace_id: '' } as AccountProfile)
  vi.mocked(setDefaultWorkspace).mockResolvedValue({ default_workspace_id: 'member-ws' })
})
describe('real workspace parent keeps personal preferences reachable #1097', () => {
  it('无空间设置权限的成员深链到设置：按原型看不到设置页签，落到概览（prd46#1209）', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={qc}><MemoryRouter><WorkspaceDashboard workspaceId="member-ws" initialTab="settings" onDeleted={vi.fn()} /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByRole('tab', { name: /workspaces.detail.tabs.overview/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /workspaces.detail.tabs.settings/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(setDefaultWorkspace).not.toHaveBeenCalled()
  })
  it('切换空间时页签回到概览（原型），再进设置看到的是当前空间自己的名称（prd46#1206 QA 复现路径）', async () => {
    perms.allow = true
    const byId: Record<string, WorkspaceDetail> = {
      'ws-a': { workspace_id: 'ws-a', name: 'Workspace A', slug: 'a', is_default: false } as WorkspaceDetail,
      'ws-b': { workspace_id: 'ws-b', name: 'Workspace B', slug: 'b', is_default: false } as WorkspaceDetail,
    }
    vi.mocked(getWorkspace).mockImplementation(async (id: string) => byId[id])
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const view = (id: string) => <QueryClientProvider client={qc}><MemoryRouter><WorkspaceDashboard workspaceId={id} initialTab="settings" onDeleted={vi.fn()} /></MemoryRouter></QueryClientProvider>
    const { rerender } = render(view('ws-a'))
    expect(await screen.findByDisplayValue('Workspace A')).toBeInTheDocument()
    rerender(view('ws-b'))
    await waitFor(() => expect(screen.getByRole('tab', { name: /workspaces.detail.tabs.overview/ })).toHaveAttribute('aria-selected', 'true'))
    rerender(view('ws-a'))
    const settingsTab = await screen.findByRole('tab', { name: /workspaces.detail.tabs.settings/ })
    expect(screen.getByRole('tab', { name: /workspaces.detail.tabs.overview/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.mouseDown(settingsTab, { button: 0 })
    expect(await screen.findByDisplayValue('Workspace A')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Workspace B')).not.toBeInTheDocument()
  })
})
