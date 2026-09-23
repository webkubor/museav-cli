/**
 * 账号设置 · 基本资料（shared/modelgo_prd#1093，需求原文 V1.0.7 小需求 list #4 #5）。
 *
 * 守两条原型口径，防回退：
 * ① 手机号/邮箱以「禁用框」展示 —— 值只读且带只读视觉档 modern-input-readonly。
 *    ⚠️ 这条以前是假成立：字段早就是 readOnly，但 ui/Input 只给 disabled 配了视觉，
 *    readOnly 一点样式都没有，渲染出来跟普通可编辑框一模一样。
 * ② 邮箱未绑定时，绑定入口是与「更换手机号」同款的按钮（框右侧），不是挤在 hint 右下角的文字链；
 *    hint 用「用于接收账号通知与找回。」，状态由框内 placeholder「未绑定」表达。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import type { AccountProfile } from '@/types'
import { BasicInfoTab } from './BasicInfoTab'

vi.mock('@/services/referral', () => ({ getReferralOverview: vi.fn(async () => null) }))
vi.mock('@/lib/app-toast', () => ({
  appToast: { success: vi.fn(), error: vi.fn(), requestError: vi.fn() },
}))
vi.mock('@/hooks/useMarket', () => ({ useMarket: () => 'china' }))

i18n.changeLanguage('zh')
await loadLocaleNamespaces(['common', 'account'])

const baseProfile: AccountProfile = {
  account_id: 'acc_1',
  has_password: true,
  default_workspace_id: '',
  email: 'louie@example.com',
  email_verified_at: '',
  display_name: 'Louie',
  phone: '18812342332',
  avatar_url: null,
  created_at: '',
  connected_oauth: [],
}

function renderTab(profile: AccountProfile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BasicInfoTab profile={profile} />
    </QueryClientProvider>,
  )
}

function wrapperOf(input: HTMLElement) {
  return input.closest('.modern-input-wrapper')
}

describe('prd#1093 账号设置基本资料', () => {
  it('手机号/邮箱是只读且带禁用框视觉', () => {
    renderTab(baseProfile)
    const phone = screen.getByLabelText('手机号码')
    const email = screen.getByLabelText('邮箱地址')
    expect(phone).toHaveAttribute('readonly')
    expect(email).toHaveAttribute('readonly')
    expect(wrapperOf(phone)?.className).toContain('modern-input-readonly')
    expect(wrapperOf(email)?.className).toContain('modern-input-readonly')
    // 显示名是真可编辑字段，不应被误伤成只读态
    const displayName = screen.getByDisplayValue('Louie')
    expect(displayName).not.toHaveAttribute('readonly')
    expect(wrapperOf(displayName)?.className).not.toContain('modern-input-readonly')
  })

  it('邮箱未绑定：禁用框 + 绑定邮箱按钮 + 通用 hint', () => {
    renderTab({ ...baseProfile, email: '' })
    const email = screen.getByLabelText('邮箱地址')
    expect(email).toHaveAttribute('placeholder', '未绑定')
    expect(wrapperOf(email)?.className).toContain('modern-input-readonly')
    // 按钮，不是文字链
    expect(screen.getByRole('button', { name: '绑定邮箱' })).toBeTruthy()
    // 未绑定态不再展示「更换邮箱」入口
    expect(screen.queryByRole('button', { name: '更换邮箱' })).toBeNull()
    expect(screen.getByText('用于接收账号通知与找回。')).toBeTruthy()
    expect(screen.queryByText('暂未绑定电子邮箱。')).toBeNull()
  })

  it('邮箱已绑定：展示脱敏值与更换邮箱入口，不出现绑定按钮', () => {
    renderTab(baseProfile)
    expect(screen.getByRole('button', { name: '更换邮箱' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '绑定邮箱' })).toBeNull()
  })
})
