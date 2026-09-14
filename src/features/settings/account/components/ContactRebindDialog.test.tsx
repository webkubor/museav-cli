/**
 * 换绑弹窗（shared/modelgo_prd#837）。对应 QA 用例 TC-MINOR-021：
 * 步骤条 验证身份 → 验证新邮箱 → 完成、当前停在第一步、脱敏手机号 +86 188****2332、发送验证码、人工客服兜底。
 * 另覆盖后端票据式契约（2026-09-14）：当前码发码走 rebind 专用端点；「下一步」真调 verify-current 拿票据；
 * commit 带票据 + 新凭证；40103 票据失效退回第一步；成功后完成页只留「重新登录」（会话已被后端吊销）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ModelGoApiError } from '@/lib/request'
import { useAuthStore } from '@/store/auth'
import type { AccountProfile } from '@/types'
import { ContactRebindDialog } from './ContactRebindDialog'

vi.mock('@/services/account', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/account')>()
  return {
    ...actual,
    sendRebindCurrentCode: vi.fn(async () => ({ expires_in: 300 })),
    verifyRebindCurrent: vi.fn(async () => ({ rebind_ticket: 'tk_1', expires_in: 600 })),
    commitRebind: vi.fn(),
  }
})
vi.mock('@/services/auth', () => ({
  sendSmsCode: vi.fn(async () => ({ expires_in: 300 })),
  sendEmailCode: vi.fn(async () => ({ expires_in: 300 })),
}))
vi.mock('@/lib/aliyun-captcha', () => ({ getCaptchaParam: vi.fn(async () => null) }))
vi.mock('@/lib/app-toast', () => ({
  appToast: { success: vi.fn(), error: vi.fn(), requestError: vi.fn() },
}))

const { sendRebindCurrentCode, verifyRebindCurrent, commitRebind } = await import('@/services/account')
const { sendEmailCode, sendSmsCode } = await import('@/services/auth')
const { appToast } = await import('@/lib/app-toast')

i18n.changeLanguage('zh')
await loadLocaleNamespaces(['common', 'account'])

const profile: AccountProfile = {
  account_id: 'acc_1',
  email: 'louie@example.com',
  email_verified_at: '',
  display_name: 'Louie',
  phone: '18812342332',
  avatar_url: null,
  created_at: '',
  connected_oauth: [],
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderDialog(mode: 'phone' | 'email' = 'email') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings/account']}>
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
        <ContactRebindDialog mode={mode} profile={profile} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onClose }
}

async function passIdentityStep() {
  fireEvent.click(screen.getByRole('button', { name: /发送验证码/ }))
  await waitFor(() => expect(sendRebindCurrentCode).toHaveBeenCalledWith('phone'))
  fireEvent.change(screen.getByPlaceholderText('6 位验证码'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  await waitFor(() => expect(verifyRebindCurrent).toHaveBeenCalledWith('phone', '123456'))
  await waitFor(() => expect(screen.getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step'))
}

async function fillNewEmailAndSubmit(email = 'new@example.com', code = '654321') {
  fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: /发送验证码/ }))
  await waitFor(() => expect(sendEmailCode).toHaveBeenCalledWith(email))
  fireEvent.change(screen.getByPlaceholderText('6 位验证码'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: '确认更换' }))
}

describe('ContactRebindDialog', () => {
  beforeEach(() => {
    vi.mocked(sendRebindCurrentCode).mockClear()
    vi.mocked(verifyRebindCurrent).mockReset().mockResolvedValue({ rebind_ticket: 'tk_1', expires_in: 600 })
    vi.mocked(commitRebind).mockReset()
    vi.mocked(sendEmailCode).mockClear()
    vi.mocked(sendSmsCode).mockClear()
    vi.mocked(appToast.error).mockClear()
    vi.mocked(appToast.requestError).mockClear()
    useAuthStore.setState({ isAuthenticated: true, account: { account_id: 'acc_1', email: profile.email, phone: profile.phone } as never })
  })

  it('更换邮箱：三步步骤条、停在验证身份、脱敏手机号、发送验证码与人工客服入口', () => {
    renderDialog('email')
    const steps = screen.getAllByRole('listitem')
    expect(steps.map((li) => li.textContent)).toEqual(['1验证身份', '2验证新邮箱', '3完成'])
    expect(steps[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('验证码将发送至 +86 188****2332')).toBeInTheDocument()
    expect(screen.queryByText(/18812342332/)).toBeNull()
    expect(screen.getByRole('button', { name: /发送验证码/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '无法接收验证码？联系人工客服' })).toBeInTheDocument()
    // 没发码、没填码不能进下一步
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()
  })

  it('第一步：当前码发码走换绑端点（不走 /auth/sms-code/send），「下一步」校验当前码拿票据后才进第二步', async () => {
    renderDialog('email')
    await passIdentityStep()
    expect(sendSmsCode).not.toHaveBeenCalled()
    expect(verifyRebindCurrent).toHaveBeenCalledTimes(1)
  })

  it('第一步：当前验证码错误（40035）留在验证身份并透出后端文案', async () => {
    vi.mocked(verifyRebindCurrent).mockRejectedValue(new ModelGoApiError({ code: 40035, msg: '验证码错误或已过期' }))
    renderDialog('email')
    fireEvent.click(screen.getByRole('button', { name: /发送验证码/ }))
    await waitFor(() => expect(sendRebindCurrentCode).toHaveBeenCalledWith('phone'))
    fireEvent.change(screen.getByPlaceholderText('6 位验证码'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    await waitFor(() => expect(appToast.requestError).toHaveBeenCalled())
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
  })

  it('第二步：新邮箱与当前邮箱相同时拦截，且发码按钮不可用', async () => {
    renderDialog('email')
    await passIdentityStep()
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'Louie@Example.com' } })
    expect(screen.getByRole('alert')).toHaveTextContent('新邮箱不能与当前邮箱相同')
    expect(screen.getByRole('button', { name: /发送验证码/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '确认更换' })).toBeDisabled()
  })

  it('第二步：commit 带票据 + 新邮箱 + 新码；成功后进完成页，「重新登录」清鉴权态跳 /login', async () => {
    vi.mocked(commitRebind).mockResolvedValue({ ...profile, email: 'new@example.com' })
    const { onClose } = renderDialog('email')
    await passIdentityStep()
    await fillNewEmailAndSubmit()
    await waitFor(() => expect(commitRebind).toHaveBeenCalledWith('tk_1', 'new@example.com', '654321'))
    await waitFor(() => expect(screen.getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'step'))
    expect(screen.getByText('邮箱更换成功')).toBeInTheDocument()
    expect(screen.getByText(/所有已登录设备已退出/)).toBeInTheDocument()
    // 完成页不留「完成」按钮，只能重新登录
    expect(screen.queryByRole('button', { name: '完成' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重新登录' }))
    expect(onClose).toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })

  it('第二步：票据失效（40103）提示并退回第一步，必须重新发当前码', async () => {
    vi.mocked(commitRebind).mockRejectedValue(new ModelGoApiError({ code: 40103, msg: 'rebind ticket invalid' }))
    renderDialog('email')
    await passIdentityStep()
    await fillNewEmailAndSubmit()
    await waitFor(() => expect(appToast.error).toHaveBeenCalledWith('身份验证已过期，请重新获取当前验证码'))
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()
  })

  it('第二步：新邮箱被占用（40911）留在第二步并透出后端文案', async () => {
    vi.mocked(commitRebind).mockRejectedValue(new ModelGoApiError({ code: 40911, msg: '该邮箱已被其他账号绑定' }))
    renderDialog('email')
    await passIdentityStep()
    await fillNewEmailAndSubmit()
    await waitFor(() => expect(appToast.requestError).toHaveBeenCalled())
    expect(screen.getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step')
  })
})
