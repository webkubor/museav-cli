import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('opens settings deep link for member while administrative controls remain unavailable', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={qc}><MemoryRouter><WorkspaceDashboard workspaceId="member-ws" initialTab="settings" onDeleted={vi.fn()} /></MemoryRouter></QueryClientProvider>)
    const toggle = await screen.findByRole('switch')
    expect(screen.getByRole('tab', { name: /workspaces.detail.tabs.settings/ })).toHaveAttribute('aria-selected', 'true')
    expect(toggle).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'workspaces.detail.settings.delete' })).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Member workspace')).toBeDisabled()
    // 默认空间是账户偏好，成员也能设：拨开关只改表单，点「保存」才提交（prd46#1206）
    fireEvent.click(toggle)
    expect(setDefaultWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'workspaces.detail.settings.save' }))
    await waitFor(() => expect(setDefaultWorkspace).toHaveBeenCalledWith({ workspace_id: 'member-ws' }))
  })
})
