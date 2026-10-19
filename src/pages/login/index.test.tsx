/**
 * 登录页面回归测试
 * 职责：覆盖登录页前端拦截与真实后端错误展示的边界
 * 路由：/login
 * API：POST /auth/email/check、POST /auth/login、GET /auth/session
 */

import { StrictMode, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { loadLocaleNamespaces } from '@/i18n'
import {
  checkLoginEmail,
  emailCodeLoginRegister,
  oauthAuthorizeUrl,
  sendEmailCode,
} from '@/services/auth'
import { getCaptchaOutcome } from '@/lib/aliyun-captcha'
import { useAuthStore } from '@/store/auth'
import { trackEvent } from '@/lib/track'
import LoginPage from './index'

vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))

const marketState = vi.hoisted(() => ({ value: 'global' as 'china' | 'global' }))

vi.mock('@/components/auth/AuthLayout', () => ({
  AuthLayout: ({ children, footer, title, subtitle, aside }: { children: ReactNode; footer?: ReactNode; title: string; subtitle?: string; aside?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
      {footer}
      {aside}
    </main>
  ),
}))

vi.mock('@/components/auth/SocialLogin', () => ({
  SocialLogin: () => <div data-testid="social-login">social login</div>,
}))

vi.mock('@/constants/oauth', () => ({
  OAUTH_ICONS: { google: null, github: null },
  OAUTH_LABELS: { google: 'Google', github: 'GitHub' },
}))

vi.mock('@/components/auth/PhoneAuth', () => ({
  PhoneAuth: () => <div data-testid="phone-auth">phone auth</div>,
}))

vi.mock('@/services/auth', () => ({
  checkLoginEmail: vi.fn(),
  emailCodeLoginRegister: vi.fn(),
  sendEmailCode: vi.fn(),
  login: vi.fn(),
  getSession: vi.fn(),
  oauthAuthorizeUrl: vi.fn(() => 'https://example.test/authorize'),
}))

// 登录成功后的跳转是异步的模型意图复核（qa#551），本用例只关心接口调用，别真跑它
vi.mock('@/lib/login-intent', () => ({
  navigateAfterLogin: vi.fn(async () => {}),
}))

vi.mock('@/components/auth/CaptchaGate', () => ({
  CaptchaGate: () => null,
}))

vi.mock('@/lib/aliyun-captcha', () => ({
  getCaptchaParam: vi.fn(async () => 'captcha-param'),
  getCaptchaOutcome: vi.fn(async () => ({ param: 'captcha-param', presented: true })),
}))

vi.mock('@/hooks/use-platform-config', () => ({
  useOAuthMethods: () => [],
  useEmailAuthEnabled: () => true,
}))

// 本用例测的是邮箱登录链路；jsdom 的 localhost 会判为国内市场（手机号入口），
// 固定为海外市场让入口直达 EmailLoginPage。
vi.mock('@/hooks/useMarket', () => ({
  useMarket: () => marketState.value,
}))

// 折扣橱窗吃的是模型广场那份公开目录。四条样本覆盖四种情况：
// 正常双价 40% / 正常双价 25% / 原价等于现价（后端已知脏数据，必须被丢掉）/ 限免（不进橱窗）
const catalogModels = [
  {
    model_id: 'demo-cheap', display_name: 'demo-cheap', provider: 'DeepSeek', vendor: 'deepseek',
    pricing: { input_per_1m: '0.6', output_per_1m: '1', cache_read_per_1m: '0', currency: 'USD' },
    promotion: { free: false, original_input_per_1m: '1' },
  },
  {
    model_id: 'demo-mid', display_name: 'demo-mid', provider: 'OpenAI', vendor: 'openai',
    pricing: { input_per_1m: '1.5', output_per_1m: '3', cache_read_per_1m: '0', currency: 'USD' },
    promotion: { free: false, original_input_per_1m: '2' },
  },
  {
    model_id: 'demo-flat', display_name: 'demo-flat', provider: 'Z.ai', vendor: 'zhipu',
    pricing: { input_per_1m: '3', output_per_1m: '6', cache_read_per_1m: '0', currency: 'USD' },
    promotion: { free: false, original_input_per_1m: '3' },
  },
  {
    model_id: 'demo-free', display_name: 'demo-free', provider: 'Qwen', vendor: 'qwen',
    pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'USD' },
    promotion: { free: true, original_input_per_1m: '5' },
  },
]

vi.mock('@/services/catalog', () => ({
  listModels: vi.fn(async () => ({ items: catalogModels, page_size: 100, has_more: false, next_cursor: null })),
}))

const mockedCheckLoginEmail = vi.mocked(checkLoginEmail)
const mockedEmailCodeLoginRegister = vi.mocked(emailCodeLoginRegister)
const mockedSendEmailCode = vi.mocked(sendEmailCode)
const mockedOauthAuthorizeUrl = vi.mocked(oauthAuthorizeUrl)
const mockedGetCaptchaOutcome = vi.mocked(getCaptchaOutcome)

function resetAuth() {
  useAuthStore.setState({
    account: null,
    activeTenantId: null,
    activeWorkspaceId: null,
    tenants: [],
    permissions: null,
    menus: [],
    isAuthenticated: false,
    isLoading: false,
  })
}

function renderLogin(initialEntry = '/login') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<div>signup</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function completeGlobalCaptcha() {
  fireEvent.click(screen.getByRole('button', { name: '点击完成人机验证' }))
  expect(await screen.findByRole('button', { name: '人机验证已完成' })).toBeInTheDocument()
}

describe('LoginPage', () => {
  it('tracks one login exposure and OAuth submit with enum-only properties', async () => {
    renderLogin()
    expect(vi.mocked(trackEvent)).toHaveBeenCalledWith('login_view')
    fireEvent.click(screen.getByRole('button', { name: /Google/i }))
    await waitFor(() => expect(vi.mocked(trackEvent)).toHaveBeenCalledWith('login_submit', { method: 'oauth' }))
    expect(vi.mocked(trackEvent).mock.calls.filter(([event]) => event === 'login_view')).toHaveLength(1)
  })

  it('counts one login exposure when StrictMode replays effects', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/login']}>
            <LoginPage />
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    )
    expect(vi.mocked(trackEvent).mock.calls.filter(([event]) => event === 'login_view')).toHaveLength(1)
  })

  // 生产环境靠 App.tsx 的 <LocaleNamespaces> 在路由挂载前异步加载 'account' 语言包；
  // 这里直接渲染 <LoginPage> 没经过那层包裹，t() 找不到资源只会回落成原始 key
  // （如 "account.auth.login.continue"），断言真实中文文案会一直找不到元素。
  beforeAll(async () => {
    await loadLocaleNamespaces(['account'])
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    marketState.value = 'global'
    resetAuth()
    mockedSendEmailCode.mockResolvedValue({ expires_in: 300 } as never)
    mockedEmailCodeLoginRegister.mockResolvedValue({} as never)
    mockedGetCaptchaOutcome.mockResolvedValue({ param: 'captcha-param', presented: true })
  })

  it('starts Global login on a provider-or-email choice page', () => {
    renderLogin()

    expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('6 位邮箱验证码')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用邮箱继续' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '免费注册' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'GitHub' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '使用邮箱继续' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '点击完成人机验证' })).toBeInTheDocument()
  })

  it('fills the Global discount showcase from the public model catalog', async () => {
    renderLogin()

    expect(await screen.findByRole('heading', { name: '实时模型折扣' })).toBeInTheDocument()
    // 副标题的「最高」跟着真实数据走，不再是写死的 75%
    expect(screen.getByText('最高节省 40%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '浏览全部模型' })).toHaveAttribute('href', '/models')
    // jsdom 没有布局（scrollHeight 恒为 0）⇒ 判定为"装得下"，不渲染循环克隆轨道，
    // 所以每条只出现一次。真实浏览器里条数够多时才会多出一份克隆（见组件里的 loopable）。
    expect(screen.getAllByTitle('DeepSeek · $0.6/M')).toHaveLength(1)
    expect(screen.getByText('−40%')).toBeInTheDocument()
    expect(screen.getByText('−25%')).toBeInTheDocument()
    expect(screen.queryAllByRole('list', { hidden: true }).filter((el) => el.getAttribute('aria-hidden') === 'true')).toHaveLength(0)
  })

  it('drops promotions that cannot carry two prices, and free models', async () => {
    renderLogin()

    await screen.findByRole('heading', { name: '实时模型折扣' })
    // 原价 == 现价（线上已知脏数据）与限免模型都不该出现在"省多少钱"的列表里
    expect(screen.queryByText('demo-flat')).not.toBeInTheDocument()
    expect(screen.queryByText('demo-free')).not.toBeInTheDocument()
  })

  it('automatically advances the Global discount list', async () => {
    let scheduledFrame: FrameRequestCallback | undefined
    const animationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback
      return 1
    })
    const { container } = renderLogin()
    // 橱窗现在等公开目录接口返回后才渲染，先等它出现再拿 DOM
    await screen.findByRole('heading', { name: '实时模型折扣' })
    const list = container.querySelector<HTMLElement>('.auth-discount-list')

    expect(list).not.toBeNull()
    Object.defineProperties(list!, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1500 },
      scrollTop: { configurable: true, value: 0, writable: true },
    })

    expect(scheduledFrame).toBeTypeOf('function')
    act(() => {
      scheduledFrame?.(0)
      scheduledFrame?.(1000)
    })

    expect(list!.scrollTop).toBeGreaterThan(0)
    animationFrameSpy.mockRestore()
  })

  it('keeps subpixel auto-scroll progress when the browser rounds scrollTop', async () => {
    let scheduledFrame: FrameRequestCallback | undefined
    const animationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback
      return 1
    })
    const { container } = renderLogin()
    await screen.findByRole('heading', { name: '实时模型折扣' })
    const list = container.querySelector<HTMLElement>('.auth-discount-list')!
    let browserScrollTop = 0

    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1500 },
      scrollTop: {
        configurable: true,
        get: () => browserScrollTop,
        set: (value: number) => {
          browserScrollTop = Math.round(value)
        },
      },
    })

    act(() => {
      for (let frame = 0; frame <= 10; frame += 1) {
        scheduledFrame?.(frame * 16.7)
      }
    })

    expect(list.scrollTop).toBeGreaterThan(1)
    animationFrameSpy.mockRestore()
  })

  it('pauses Global discount auto-scroll while the list is hovered', async () => {
    let scheduledFrame: FrameRequestCallback | undefined
    const animationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      scheduledFrame = callback
      return 1
    })
    const { container } = renderLogin()
    await screen.findByRole('heading', { name: '实时模型折扣' })
    const list = container.querySelector<HTMLElement>('.auth-discount-list')!

    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1500 },
      scrollTop: { configurable: true, value: 0, writable: true },
    })

    act(() => {
      scheduledFrame?.(0)
      scheduledFrame?.(1000)
    })
    const scrollTopBeforeHover = list.scrollTop

    fireEvent.mouseEnter(list)
    act(() => scheduledFrame?.(2000))

    expect(list.scrollTop).toBe(scrollTopBeforeHover)
    animationFrameSpy.mockRestore()
  })

  it('unlocks the Global email path after the real human verification passes', async () => {
    renderLogin()

    await completeGlobalCaptcha()

    expect(screen.getByRole('button', { name: 'Google' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'GitHub' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '使用邮箱继续' })).toBeEnabled()
  })

  it('sends the Global third-party sign-in to the real authorize endpoint, captcha token first', async () => {
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: 'Google' }))

    await waitFor(() => {
      // 先解题再导航：token 必须跟着 authorize URL 一起走，否则后端 302 弹回登录页
      expect(mockedGetCaptchaOutcome).toHaveBeenCalled()
      expect(mockedOauthAuthorizeUrl).toHaveBeenCalledWith('google', expect.any(String), 'captcha-param')
    })
  })

  it('does not navigate to the provider when the challenge was shown but not solved', async () => {
    mockedGetCaptchaOutcome.mockResolvedValue({ param: null, presented: true })
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }))

    await waitFor(() => expect(mockedGetCaptchaOutcome).toHaveBeenCalled())
    expect(mockedOauthAuthorizeUrl).not.toHaveBeenCalled()
  })

  it('continues from email entry to a dedicated verification-code page', async () => {
    renderLogin()

    fireEvent.change(screen.getByPlaceholderText('you@company.com'), {
      target: { value: 'global@modelgo.ai' },
    })
    await completeGlobalCaptcha()
    fireEvent.click(screen.getByRole('button', { name: '使用邮箱继续' }))

    await waitFor(() => {
      expect(mockedSendEmailCode).toHaveBeenCalledWith('global@modelgo.ai', 'captcha-param')
      expect(screen.getByText('检查你的邮箱')).toBeInTheDocument()
      expect(screen.getByText(/global@modelgo\.ai/)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('6 位邮箱验证码'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))

    await waitFor(() => {
      // 登录那一步必须带**新的**四元组：发码时那一组已被服务端消费
      expect(mockedEmailCodeLoginRegister).toHaveBeenCalledWith(
        'global@modelgo.ai',
        '123456',
        'captcha-param',
        undefined,
        undefined,
        undefined,
      )
    })
  })

  it('returns from the code page to edit the email address', async () => {
    renderLogin()

    fireEvent.change(screen.getByPlaceholderText('you@company.com'), {
      target: { value: 'change@modelgo.ai' },
    })
    await completeGlobalCaptcha()
    fireEvent.click(screen.getByRole('button', { name: '使用邮箱继续' }))

    expect(await screen.findByRole('button', { name: '使用其他邮箱' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '使用其他邮箱' }))

    expect(screen.getByDisplayValue('change@modelgo.ai')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('6 位邮箱验证码')).not.toBeInTheDocument()
  })

  it('opens domestic email login from the bottom email entry', () => {
    marketState.value = 'china'

    renderLogin('/login?method=email')

    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('social-login')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用手机号登录' })).toBeInTheDocument()
  })

  it('continues email login through the backend without local security masking', async () => {
    marketState.value = 'china'
    mockedCheckLoginEmail.mockResolvedValue({
      registered: true,
      password_login_enabled: true,
    })

    renderLogin('/login?method=email')

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@modelgo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))

    await waitFor(() => {
      expect(mockedCheckLoginEmail).toHaveBeenCalledWith('user@modelgo.com')
    })
  })

  it('guides an unknown domestic email to supported phone onboarding instead of signup', async () => {
    marketState.value = 'china'
    mockedCheckLoginEmail.mockResolvedValue({ registered: false, password_login_enabled: false })
    renderLogin('/login?method=email')
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'new@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    await waitFor(() => expect(mockedCheckLoginEmail).toHaveBeenCalledWith('new@example.invalid'))
    expect(await screen.findByText(/请使用手机号/)).toBeInTheDocument()
    expect(screen.queryByText('signup')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用手机号登录' })).toBeInTheDocument()
  })

  // qa#675：本文件把 useMarket 固定成 'global'，所以渲染的正是当初丢码的那条分支
  // （EmailLoginPage）。根路径 /?aff=X 会被 RequireAuth 折成 /login?redirect=%2F%3Faff%3DX，
  // 码只藏在 redirect 的内嵌 query 里。
  it('persists the referral code hidden in the redirect param (qa#675)', () => {
    sessionStorage.clear()

    renderLogin('/login?redirect=%2F%3Faff%3DINTLCODE')

    expect(sessionStorage.getItem('mg_referral_code')).toBe('INTLCODE')
  })

  it('also takes the referral code straight off the query (qa#675)', () => {
    sessionStorage.clear()

    renderLogin('/login?ref=DIRECTCODE')

    expect(sessionStorage.getItem('mg_referral_code')).toBe('DIRECTCODE')
  })

  it('leaves the stored code untouched when no code is present (qa#675)', () => {
    sessionStorage.clear()

    renderLogin('/login')

    expect(sessionStorage.getItem('mg_referral_code')).toBeNull()
  })
})
