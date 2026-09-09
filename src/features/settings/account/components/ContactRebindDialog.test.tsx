/**
 * 换绑弹窗（shared/modelgo_prd#837）。对应 QA 用例 TC-MINOR-021：
 * 步骤条 验证身份 → 验证新邮箱 → 完成、当前停在第一步、脱敏手机号 +86 188****2332、发送验证码、人工客服兜底。
 * 另覆盖：第二步同邮箱拦截、后端端点未落地（40401）时给「暂未开放」文案而不是资源不存在。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ModelGoApiError } from '@/lib/request'
import type { AccountProfile } from '@/types'
import { ContactRebindDialog } from './ContactRebindDialog'

vi.mock('@/services/account', () => ({
  rebindPhone: vi.fn(),
  rebindEmail: vi.fn(),
}))
vi.mock('@/services/auth', () => ({
  sendSmsCode: vi.fn(async () => ({ expires_in: 300 })),
  sendEmailCode: vi.fn(async () => ({ expires_in: 300 })),
}))
vi.mock('@/lib/aliyun-captcha', () => ({ getCaptchaParam: vi.fn(async () => null) }))
vi.mock('@/lib/app-toast', () => ({
  appToast: { success: vi.fn(), error: vi.fn(), requestError: vi.fn() },
}))

const { rebindEmail } = await import('@/services/account')
const { sendSmsCode } = await import('@/services/auth')
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

function renderDialog(mode: 'phone' | 'email' = 'email') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <ContactRebindDialog mode={mode} profile={profile} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose }
}

async function passIdentityStep() {
  fireEvent.click(screen.getByRole('button', { name: /发送验证码/ }))
  await waitFor(() => expect(sendSmsCode).toHaveBeenCalledWith('18812342332', null))
  fireEvent.change(screen.getByPlaceholderText('6 位验证码'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
}

describe('ContactRebindDialog', () => {
  beforeEach(() => {
    vi.mocked(rebindEmail).mockReset()
    vi.mocked(sendSmsCode).mockClear()
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

  it('第二步：新邮箱与当前邮箱相同时拦截，且发码按钮不可用', async () => {
    renderDialog('email')
    await passIdentityStep()
    expect(screen.getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step')
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'Louie@Example.com' } })
    expect(screen.getByRole('alert')).toHaveTextContent('新邮箱不能与当前邮箱相同')
    expect(screen.getByRole('button', { name: /发送验证码/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: '确认更换' })).toBeDisabled()
  })

  it('换绑端点未落地（40401）时提示「暂未开放」，两码随同一请求提交', async () => {
    vi.mocked(rebindEmail).mockRejectedValue(new ModelGoApiError({ code: 40401, msg: 'resource not found' }))
    renderDialog('email')
    await passIdentityStep()
    fireEvent.change(screen.getByPlaceholderText('name@company.com'), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /发送验证码/ }))
    await waitFor(() => expect(screen.getByText('验证码已发送至 ne***@example.com')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('6 位验证码'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: '确认更换' }))
    await waitFor(() => expect(rebindEmail).toHaveBeenCalledWith('new@example.com', '654321', {
      current_channel: 'phone',
      current_code: '123456',
    }))
    await waitFor(() => expect(appToast.error).toHaveBeenCalledWith('换绑服务暂未开放，请稍后再试或联系人工客服'))
  })
})
