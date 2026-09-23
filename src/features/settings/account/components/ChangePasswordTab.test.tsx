import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangePasswordTab } from './ChangePasswordTab'
import { changePassword } from '@/services/account'
import { appToast } from '@/lib/app-toast'

vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/services/account', () => ({ changePassword: vi.fn() }))
vi.mock('@/lib/app-toast', () => ({ appToast: { success: vi.fn(), requestError: vi.fn() } }))

function setup(hasPassword: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidation = vi.spyOn(client, 'invalidateQueries')
  render(<QueryClientProvider client={client}><ChangePasswordTab hasPassword={hasPassword} /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: hasPassword ? 'account.security.changePassword' : 'account.security.setPassword' }))
  return { invalidation }
}
function fillNew(value = 'Newpassw0rd!', confirm = value) {
  fireEvent.change(screen.getByLabelText('account.security.newPassword'), { target: { value } })
  fireEvent.change(screen.getByLabelText('account.security.confirmPassword'), { target: { value: confirm } })
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(changePassword).mockResolvedValue(null) })

describe('account password possession contract #1093', () => {
  it('starts passwordless users at set, omits old password and refreshes profile only after success', async () => {
    const { invalidation } = setup(false)
    expect(screen.queryByText('••••••••')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('account.security.currentPassword')).not.toBeInTheDocument()
    fillNew()
    fireEvent.click(screen.getByRole('button', { name: 'account.security.completeSet' }))
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ new_password: 'Newpassw0rd!' }))
    await waitFor(() => expect(invalidation).toHaveBeenCalledWith({ queryKey: ['account-profile'] }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('requires existing password before change and preserves it in the request', async () => {
    setup(true)
    expect(screen.getByText('••••••••')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'account.security.next' }))
    expect(screen.getByText('account.security.warningEmpty')).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('account.security.currentPassword'), { target: { value: 'Oldpassw0rd!' } })
    fireEvent.click(screen.getByRole('button', { name: 'account.security.next' }))
    fillNew()
    fireEvent.click(screen.getByRole('button', { name: 'account.security.completeChange' }))
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ current_password: 'Oldpassw0rd!', new_password: 'Newpassw0rd!' }))
  })
  it.each([['short', 'short', 'account.security.errorLength'], ['12345678', '12345679', 'account.security.errorMismatch']])('rejects invalid new password %s', (password, confirm, error) => {
    setup(false);fillNew(password, confirm)
    fireEvent.click(screen.getByRole('button', { name: 'account.security.completeSet' }))
    expect(screen.getByText(error)).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })
  it('keeps dialog open and profile unchanged on rejected first set', async () => {
    const error = new Error('requires fresh proof')
    vi.mocked(changePassword).mockRejectedValue(error)
    const { invalidation } = setup(false);fillNew()
    fireEvent.click(screen.getByRole('button', { name: 'account.security.completeSet' }))
    await waitFor(() => expect(appToast.requestError).toHaveBeenCalledWith(error, 'account.security.toastError'))
    expect(invalidation).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(appToast.success).not.toHaveBeenCalled()
  })
  it('clears abandoned inputs before reopening a passwordless set', () => {
    setup(false);fillNew()
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'account.security.setPassword' }))
    expect(screen.getByLabelText('account.security.newPassword')).toHaveValue('')
    expect(screen.getByLabelText('account.security.confirmPassword')).toHaveValue('')
  })
})
