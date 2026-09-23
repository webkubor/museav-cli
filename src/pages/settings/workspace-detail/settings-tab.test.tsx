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
describe('account default workspace preference #1097', () => {
  it('allows an ordinary member to choose a default without rename/delete permission', async () => {
    const { invalidation } = setup()
    const toggle = await screen.findByRole('switch')
    expect(toggle).not.toBeChecked();expect(toggle).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'workspaces.detail.settings.save' })).not.toBeInTheDocument()
    vi.mocked(getProfile).mockResolvedValue(profile('w-own'));fireEvent.click(toggle)
    await waitFor(() => expect(setDefaultWorkspace).toHaveBeenCalledWith({ workspace_id: 'w-own' }))
    await waitFor(() => expect(invalidation).toHaveBeenCalledWith({ queryKey: ['account-profile'] }))
    await waitFor(() => expect(toggle).toBeChecked())
  })
  it('clears an existing saved preference with explicit empty string', async () => {
    vi.mocked(getProfile).mockResolvedValue(profile('w-own'));setup()
    const toggle = await screen.findByRole('switch');expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    await waitFor(() => expect(setDefaultWorkspace).toHaveBeenCalledWith({ workspace_id: '' }))
  })
  it('does not confuse another preferred workspace or tenant default with this preference', async () => {
    vi.mocked(getProfile).mockResolvedValue(profile('w-other'));setup()
    expect(await screen.findByRole('switch')).not.toBeChecked()
  })
  it('disables pending writes and does not optimistically alter state after rejection', async () => {
    let reject!: (error: Error) => void
    vi.mocked(setDefaultWorkspace).mockImplementation(() => new Promise((_, fail) => { reject = fail }))
    const { invalidation } = setup();const toggle = await screen.findByRole('switch');fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeDisabled());fireEvent.click(toggle)
    expect(setDefaultWorkspace).toHaveBeenCalledTimes(1)
    const error = new Error('membership removed');await act(async () => reject(error))
    await waitFor(() => expect(appToast.requestError).toHaveBeenCalledWith(error, 'workspaces.detail.settings.preferenceError'))
    expect(toggle).not.toBeChecked();expect(toggle).toBeEnabled();expect(invalidation).not.toHaveBeenCalled()
  })
  it('hides the switch on load failure and offers a working retry', async () => {
    vi.mocked(getProfile).mockRejectedValueOnce(new Error('offline'));setup()
    await screen.findByRole('alert');expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(setDefaultWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(await screen.findByRole('switch')).toBeEnabled()
  })
})
