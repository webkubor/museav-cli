import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsTab } from './settings-tab'
import { getProfile, setDefaultWorkspace } from '@/services/account'
import { updateWorkspace } from '@/services/workspaces'
import { appToast } from '@/lib/app-toast'
import type { AccountProfile, WorkspaceDetail } from '@/types'
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
const perms = vi.hoisted(() => ({ allow: false }))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => perms.allow }) }))
vi.mock('@/services/account', () => ({ getProfile: vi.fn(), setDefaultWorkspace: vi.fn() }))
vi.mock('@/services/workspaces', () => ({ updateWorkspace: vi.fn(), deleteWorkspace: vi.fn() }))
vi.mock('@/lib/app-toast', () => ({ appToast: { success: vi.fn(), requestError: vi.fn() } }))
vi.mock('@/lib/track', () => ({ trackAction: vi.fn() }))
const ws = { workspace_id: 'w-own', name: 'Owned', slug: 'owned', is_default: false } as WorkspaceDetail
const profile = (id: string): AccountProfile => ({ account_id: 'a', has_password: false, default_workspace_id: id, email: '', email_verified_at: '', display_name: '', avatar_url: null, created_at: '', connected_oauth: [] })
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidation = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}><SettingsTab ws={ws} onDeleted={vi.fn()} /></QueryClientProvider>)
  return { invalidation }
}
beforeEach(() => { vi.clearAllMocks();perms.allow = false;vi.mocked(updateWorkspace).mockResolvedValue({} as never);vi.mocked(getProfile).mockResolvedValue(profile(''));vi.mocked(setDefaultWorkspace).mockResolvedValue({ default_workspace_id: 'w-own' }) })
const saveButton = () => screen.getByRole('button', { name: 'workspaces.detail.settings.save' })

describe('设置页不再有默认空间开关（入口迁到空间卡片，prd46#1209）', () => {
  it('不渲染默认空间开关', async () => {
    perms.allow = true;setup()
    expect(await screen.findByDisplayValue('Owned')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
  it('账户偏好指向本空间时「默认空间不可删除」、不给删除（原型危险区跟随默认）', async () => {
    perms.allow = true;vi.mocked(getProfile).mockResolvedValue(profile('w-own'));setup()
    expect(await screen.findByText('workspaces.detail.settings.defaultCannotDelete')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'workspaces.detail.settings.delete' })).not.toBeInTheDocument()
  })
  it('偏好是别的空间且本空间非结构默认时可删', async () => {
    perms.allow = true;vi.mocked(getProfile).mockResolvedValue(profile('w-other'));setup()
    expect(await screen.findByRole('button', { name: 'workspaces.detail.settings.delete' })).toBeInTheDocument()
  })
  it('保存只提交名称/描述', async () => {
    perms.allow = true;setup()
    fireEvent.change(await screen.findByDisplayValue('Owned'), { target: { value: 'Renamed' } })
    fireEvent.click(saveButton())
    await waitFor(() => expect(updateWorkspace).toHaveBeenCalledWith('w-own', expect.objectContaining({ name: 'Renamed' })))
    await waitFor(() => expect(appToast.success).toHaveBeenCalledWith('workspaces.detail.settings.renameSuccess'))
    expect(setDefaultWorkspace).not.toHaveBeenCalled()
  })
  it('无空间编辑权限时不显示保存', async () => {
    setup()
    expect(await screen.findByDisplayValue('Owned')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'workspaces.detail.settings.save' })).not.toBeInTheDocument()
  })
})
