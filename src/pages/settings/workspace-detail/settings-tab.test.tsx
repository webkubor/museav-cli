import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SettingsTab } from './settings-tab'
import { getProfile, setDefaultWorkspace } from '@/services/account'
import { appToast } from '@/lib/app-toast'
import type { AccountProfile, WorkspaceDetail } from '@/types'
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => false }) }))
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
beforeEach(() => { vi.clearAllMocks();vi.mocked(getProfile).mockResolvedValue(profile(''));vi.mocked(setDefaultWorkspace).mockResolvedValue({ default_workspace_id: 'w-own' }) })
const saveButton = () => screen.getByRole('button', { name: 'workspaces.detail.settings.save' })

describe('默认空间：表单内一行、随「保存」提交（prd46#1206，账户偏好 #1097）', () => {
  it('拨开关只改表单，点保存才提交；成员无空间编辑权限也能设', async () => {
    const { invalidation } = setup()
    const toggle = await screen.findByRole('switch')
    expect(toggle).not.toBeChecked();expect(toggle).toBeEnabled()
    expect(saveButton()).toBeDisabled()
    fireEvent.click(toggle)
    expect(toggle).toBeChecked();expect(setDefaultWorkspace).not.toHaveBeenCalled()
    vi.mocked(getProfile).mockResolvedValue(profile('w-own'))
    fireEvent.click(saveButton())
    await waitFor(() => expect(setDefaultWorkspace).toHaveBeenCalledWith({ workspace_id: 'w-own' }))
    await waitFor(() => expect(invalidation).toHaveBeenCalledWith({ queryKey: ['account-profile'] }))
    await waitFor(() => expect(appToast.success).toHaveBeenCalledWith('workspaces.detail.settings.preferenceSaved'))
  })
  it('已是默认空间：开关开启且置灰不可关闭，并提示「当前空间是默认空间」', async () => {
    vi.mocked(getProfile).mockResolvedValue(profile('w-own'));setup()
    const toggle = await screen.findByRole('switch')
    expect(toggle).toBeChecked();expect(toggle).toBeDisabled()
    expect(screen.getByText('workspaces.detail.settings.defaultWorkspaceCurrent')).toBeInTheDocument()
  })
  it('别的空间是默认时，本空间开关为关', async () => {
    vi.mocked(getProfile).mockResolvedValue(profile('w-other'));setup()
    expect(await screen.findByRole('switch')).not.toBeChecked()
  })
  it('开关拨回关闭则没有改动，保存不可点', async () => {
    setup()
    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle);fireEvent.click(toggle)
    expect(toggle).not.toBeChecked();expect(saveButton()).toBeDisabled()
  })
  it('保存失败：报错、不弹成功提示，开关保持用户的选择可重试', async () => {
    let reject!: (error: Error) => void
    vi.mocked(setDefaultWorkspace).mockImplementation(() => new Promise((_, fail) => { reject = fail }))
    setup();const toggle = await screen.findByRole('switch');fireEvent.click(toggle);fireEvent.click(saveButton())
    await waitFor(() => expect(toggle).toBeDisabled())
    const error = new Error('membership removed');await act(async () => reject(error))
    await waitFor(() => expect(appToast.requestError).toHaveBeenCalledWith(error, 'workspaces.detail.settings.preferenceError'))
    expect(appToast.success).not.toHaveBeenCalled()
    expect(toggle).toBeChecked();expect(toggle).toBeEnabled();expect(saveButton()).toBeEnabled()
  })
  it('偏好读取失败时隐藏开关，重试可恢复', async () => {
    vi.mocked(getProfile).mockRejectedValueOnce(new Error('offline'));setup()
    await screen.findByRole('alert');expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(await screen.findByRole('switch')).toBeEnabled()
  })
})
