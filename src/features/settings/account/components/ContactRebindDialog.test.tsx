/**
 * 换绑弹窗（shared/modelgo_prd#837）。对应 QA 用例 TC-MINOR-021：
 * 步骤条 验证身份 → 验证新邮箱 → 完成、当前停在第一步、脱敏当前凭证、发送验证码、人工客服兜底。
 * 另覆盖后端票据式契约（2026-09-14，permissions CommitRebind 按票据 channel 决定替换哪个凭证）：
 * 验身 channel 跟换绑目标走（改邮箱验当前邮箱 / 改手机验当前手机）；当前码发码走 rebind 专用端点；
 * 「下一步」真调 verify-current 拿票据；commit 带票据 + 新凭证；40103 票据失效退回第一步并可恢复；
 * 成功后完成页只留「重新登录」（会话已被后端吊销）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ModelGoApiError } from '@/lib/request'
import { useAuthStore } from '@/store/auth'
import type { AccountBrief, AccountProfile } from '@/types'
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

const accountBrief: AccountBrief = {
  account_id: profile.account_id,
  display_name: profile.display_name,
  email: profile.email,
  phone: profile.phone,
  avatar_url: null,
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

const stepItems = () => screen.getAllByRole('listitem')
const codeInput = () => screen.getByPlaceholderText('6 位验证码')
const sendCodeButton = () => screen.getByRole('button', { name: /发送验证码/ })
const nextButton = () => screen.getByRole('button', { name: '下一步' })

/** 第一步：发当前码 → 填码 → 下一步（真调 verify-current），断言进入第二步 */
async function passIdentityStep(channel: 'phone' | 'email', code = '123456') {
  fireEvent.click(sendCodeButton())
  await waitFor(() => expect(sendRebindCurrentCode).toHaveBeenCalledWith(channel))
  fireEvent.change(codeInput(), { target: { value: code } })
  fireEvent.click(nextButton())
  await waitFor(() => expect(verifyRebindCurrent).toHaveBeenCalledWith(channel, code))
  await waitFor(() => expect(stepItems()[1]).toHaveAttribute('aria-current', 'step'))
}

async function fillNewEmailAndSubmit(email = 'new@example.com', code = '654321') {
  fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: email } })
  fireEvent.click(sendCodeButton())
  await waitFor(() => expect(sendEmailCode).toHaveBeenCalledWith(email))
  fireEvent.change(codeInput(), { target: { value: code } })
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
    useAuthStore.setState({ isAuthenticated: true, account: accountBrief })
  })

  it('更换邮箱：三步步骤条、停在验证身份、验证码发到脱敏的当前邮箱、人工客服入口', () => {
    renderDialog('email')
    expect(stepItems().map((li) => li.textContent)).toEqual(['1验证身份', '2验证新邮箱', '3完成'])
    expect(stepItems()[0]).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('当前邮箱验证码')).toBeInTheDocument()
    expect(screen.getByText('验证码将发送至 lo***@example.com')).toBeInTheDocument()
    expect(screen.queryByText(/louie@example.com/)).toBeNull()
    expect(sendCodeButton()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '无法接收验证码？联系人工客服' })).toBeInTheDocument()
    // 没发码、没填码不能进下一步
    expect(nextButton()).toBeDisabled()
  })

  it('更换手机号：验证码发到脱敏的当前手机号 +86 188****2332', () => {
    renderDialog('phone')
    expect(stepItems().map((li) => li.textContent)).toEqual(['1验证身份', '2验证新手机号', '3完成'])
    expect(screen.getByText('当前手机验证码')).toBeInTheDocument()
    expect(screen.getByText('验证码将发送至 +86 188****2332')).toBeInTheDocument()
    expect(screen.queryByText(/18812342332/)).toBeNull()
  })

  it('第一步（改邮箱）：验身 channel=email，走换绑端点不走 /auth/*-code/send，「下一步」拿票据后才进第二步', async () => {
    renderDialog('email')
    await passIdentityStep('email')
    expect(sendSmsCode).not.toHaveBeenCalled()
    expect(sendEmailCode).not.toHaveBeenCalled()
    expect(verifyRebindCurrent).toHaveBeenCalledTimes(1)
  })

  it('第一步：当前验证码错误（40035）留在验证身份并把后端错误透给 requestError', async () => {
    const err = new ModelGoApiError({ code: 40035, msg: '验证码错误或已过期' })
    vi.mocked(verifyRebindCurrent).mockRejectedValue(err)
    renderDialog('email')
    fireEvent.click(sendCodeButton())
    await waitFor(() => expect(sendRebindCurrentCode).toHaveBeenCalledWith('email'))
    fireEvent.change(codeInput(), { target: { value: '000000' } })
    fireEvent.click(nextButton())
    await waitFor(() => expect(appToast.requestError).toHaveBeenCalledWith(err, '邮箱更换失败'))
    expect(stepItems()[0]).toHaveAttribute('aria-current', 'step')
  })

  it('票据状态机：「上一步」再「下一步」不重新校验；改了当前码票据作废、再「下一步」会重新校验', async () => {
    renderDialog('email')
    await passIdentityStep('email')
    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(stepItems()[0]).toHaveAttribute('aria-current', 'step')
    fireEvent.click(nextButton())
    await waitFor(() => expect(stepItems()[1]).toHaveAttribute('aria-current', 'step'))
    expect(verifyRebindCurrent).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '上一步' }))
    fireEvent.change(codeInput(), { target: { value: '222222' } })
    fireEvent.click(nextButton())
    await waitFor(() => expect(verifyRebindCurrent).toHaveBeenCalledTimes(2))
    expect(verifyRebindCurrent).toHaveBeenLastCalledWith('email', '222222')
  })

  it('第二步：新邮箱与当前邮箱相同时拦截，且发码按钮不可用', async () => {
    renderDialog('email')
    await passIdentityStep('email')
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'Louie@Example.com' } })
    expect(screen.getByRole('alert')).toHaveTextContent('新邮箱不能与当前邮箱相同')
    expect(sendCodeButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: '确认更换' })).toBeDisabled()
  })

  it('第二步（改邮箱）：commit 带票据 + 新邮箱 + 新码；成功后进完成页，「重新登录」清鉴权态跳 /login', async () => {
    vi.mocked(commitRebind).mockResolvedValue({ ...profile, email: 'new@example.com' })
    const { onClose } = renderDialog('email')
    await passIdentityStep('email')
    await fillNewEmailAndSubmit()
    await waitFor(() => expect(commitRebind).toHaveBeenCalledWith('tk_1', 'new@example.com', '654321'))
    await waitFor(() => expect(stepItems()[2]).toHaveAttribute('aria-current', 'step'))
    expect(screen.getByText('邮箱更换成功')).toBeInTheDocument()
    expect(screen.getByText(/所有已登录设备已退出/)).toBeInTheDocument()
    // 完成页不留「完成」按钮，只能重新登录
    expect(screen.queryByRole('button', { name: '完成' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重新登录' }))
    expect(onClose).toHaveBeenCalled()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })

  it('第二步（改手机）：新号走 /auth/sms-code/send（带滑块参数），commit 的 new_value 为 11 位纯数字', async () => {
    vi.mocked(commitRebind).mockResolvedValue(null)
    renderDialog('phone')
    await passIdentityStep('phone')
    fireEvent.change(screen.getByPlaceholderText('请输入 11 位手机号'), { target: { value: '13900001111' } })
    fireEvent.click(sendCodeButton())
    await waitFor(() => expect(sendSmsCode).toHaveBeenCalledWith('13900001111', null))
    expect(screen.getByText('验证码已发送至 +86 139****1111')).toBeInTheDocument()
    fireEvent.change(codeInput(), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: '确认更换' }))
    await waitFor(() => expect(commitRebind).toHaveBeenCalledWith('tk_1', '13900001111', '654321'))
    await waitFor(() => expect(screen.getByText('手机号更换成功')).toBeInTheDocument())
    expect(sendRebindCurrentCode).toHaveBeenCalledWith('phone')
  })

  it('第二步：票据失效（40103）提示并退回第一步；重发当前码 → 重新校验 → 可再次提交', async () => {
    vi.mocked(commitRebind)
      .mockRejectedValueOnce(new ModelGoApiError({ code: 40103, msg: 'rebind ticket invalid' }))
      .mockResolvedValueOnce(null)
    vi.mocked(verifyRebindCurrent)
      .mockResolvedValueOnce({ rebind_ticket: 'tk_1', expires_in: 600 })
      .mockResolvedValueOnce({ rebind_ticket: 'tk_2', expires_in: 600 })
    renderDialog('email')
    await passIdentityStep('email')
    await fillNewEmailAndSubmit()
    await waitFor(() => expect(appToast.error).toHaveBeenCalledWith('身份验证已过期，请重新获取当前验证码'))
    expect(stepItems()[0]).toHaveAttribute('aria-current', 'step')
    expect(nextButton()).toBeDisabled()

    // 恢复：重发当前码、重新校验拿到新票据，第二步保留已填的新邮箱与新码，直接再提交
    await passIdentityStep('email', '333333')
    expect(verifyRebindCurrent).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: '确认更换' }))
    await waitFor(() => expect(commitRebind).toHaveBeenLastCalledWith('tk_2', 'new@example.com', '654321'))
    await waitFor(() => expect(stepItems()[2]).toHaveAttribute('aria-current', 'step'))
  })

  it('第二步：新邮箱被占用（40911）留在第二步并把后端错误透给 requestError', async () => {
    const err = new ModelGoApiError({ code: 40911, msg: '该邮箱已被其他账号绑定' })
    vi.mocked(commitRebind).mockRejectedValue(err)
    renderDialog('email')
    await passIdentityStep('email')
    await fillNewEmailAndSubmit()
    await waitFor(() => expect(appToast.requestError).toHaveBeenCalledWith(err, '邮箱更换失败'))
    expect(stepItems()[1]).toHaveAttribute('aria-current', 'step')
  })
})
