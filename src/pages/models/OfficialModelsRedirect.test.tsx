/**
 * 控制台旧模型页 → 官网中转（prd#1272）
 * 路由：/models、/models/discovery、/models/:modelId、/models/*
 * API：GET /platform-config（非锁定域名定市场）；POST /tenants/:tenantId/onboarding/steps/browse_marketplace（经 reportOnboardingStep）
 *
 * 钉住浏览器里不好复现的几件事：登录态访问广场要先等引导上报落地再整页跳（不等就被页面卸载掐掉），
 * 上报卡住时 1.5s 照跳不把人卡在中转页，等待期间离开就不再跳；非锁定域名要等 platform-config
 * 定下市场再算目标（第一帧的市场可能是旧的）；防环只数整页落地、第 3 次才停，站内跳转永远照跳。
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_DOMESTIC_SITE', 'https://modelgo.com')
vi.stubEnv('VITE_DOMESTIC_CONSOLE', 'https://console.modelgo.com')
vi.stubEnv('VITE_DOMESTIC_DOCS', 'https://docs.modelgo.com')
vi.stubEnv('VITE_GLOBAL_SITE', 'https://modelgo.ai')
vi.stubEnv('VITE_GLOBAL_CONSOLE', 'https://console.modelgo.ai')
vi.stubEnv('VITE_GLOBAL_DOCS', 'https://docs.modelgo.ai')

const auth = vi.hoisted(() => ({ isAuthenticated: false }))
const platform = vi.hoisted(() => ({ site: 'china' as string }))
const reportOnboardingStep = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())

// 渲染期市场故意写成 china：用来证明自动跳转用的是 platform-config 定下来的市场，不是第一帧的值
vi.mock('@/hooks/useMarket', () => ({ useMarket: () => 'china' }))
vi.mock('@/services/platform', () => ({ getPlatformConfig: () => Promise.resolve({ site: platform.site }) }))
vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}))
vi.mock('@/store/use-onboarding-store', () => ({ reportOnboardingStep }))

const { default: i18n } = await import('@/i18n')
const { OfficialModelsRedirect } = await import('./OfficialModelsRedirect')

const LOOP_GUARD_KEY = 'mg_official_models_redirect'
const realLocation = window.location
const replace = vi.fn()

/** 站内入口：点一下用 navigate 进 /models*，location.key 不再是 'default'（模拟顶栏/引导气泡） */
function InAppLink({ to }: { to: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(to)}>go</button>
}

function renderAt(url: string, { inApp = false } = {}) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[inApp ? '/start' : url]}>
        <Routes>
          <Route path="/start" element={<InAppLink to={url} />} />
          <Route path="/elsewhere" element={<p>elsewhere</p>} />
          <Route path="/models">
            <Route index element={<OfficialModelsRedirect kind="catalog" />} />
            <Route path="discovery" element={<OfficialModelsRedirect kind="rankings" />} />
            <Route path=":modelId" element={<OfficialModelsRedirect kind="detail" />} />
            <Route path="*" element={<OfficialModelsRedirect kind="detail" />} />
          </Route>
        </Routes>
        {inApp && <InAppLink to="/elsewhere" />}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function seedLoopRecord(path: string, count: number) {
  sessionStorage.setItem(LOOP_GUARD_KEY, JSON.stringify({ path, count, at: Date.now() }))
}

beforeEach(async () => {
  vi.useFakeTimers()
  sessionStorage.clear()
  auth.isAuthenticated = false
  platform.site = 'china'
  reportOnboardingStep.mockReset()
  replace.mockReset()
  // localhost 不是生产锁定域名，市场走 platform-config（与 console.test 同一条路径）
  Object.defineProperty(window, 'location', {
    value: { hostname: 'localhost', search: '', pathname: '/', replace },
    writable: true,
    configurable: true,
  })
  await i18n.changeLanguage('zh')
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
})

describe('OfficialModelsRedirect', () => {
  it('sends anonymous visitors to the official catalog, keeping ad params and dropping market', async () => {
    renderAt('/models?gclid=G1&market=global')
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(reportOnboardingStep).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('https://modelgo.com/models?gclid=G1&from=console')
  })

  it('waits for platform-config before choosing the market site', async () => {
    platform.site = 'global'

    renderAt('/models/discovery')
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(replace).toHaveBeenCalledWith('https://modelgo.ai/zh/models/rankings?from=console')
  })

  it('waits for the onboarding report before leaving when a signed-in user opens the catalog', async () => {
    auth.isAuthenticated = true
    let settle!: () => void
    reportOnboardingStep.mockReturnValue(new Promise<void>((resolve) => { settle = resolve }))

    renderAt('/models')
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(reportOnboardingStep).toHaveBeenCalledTimes(1)
    expect(reportOnboardingStep).toHaveBeenCalledWith('marketplace', 'page_visit', 'marketplace')
    expect(replace).not.toHaveBeenCalled()

    await act(async () => { settle() })
    expect(replace).toHaveBeenCalledWith('https://modelgo.com/models?from=console')
  })

  it('leaves after 1.5s even if the onboarding report hangs', async () => {
    auth.isAuthenticated = true
    reportOnboardingStep.mockReturnValue(new Promise<void>(() => {}))

    renderAt('/models')
    await act(() => vi.advanceTimersByTimeAsync(1_499))
    expect(replace).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('does not drag the user away if they leave the page while it is waiting', async () => {
    auth.isAuthenticated = true
    reportOnboardingStep.mockReturnValue(new Promise<void>(() => {}))

    renderAt('/models', { inApp: true })
    fireEvent.click(screen.getAllByText('go')[0])
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(reportOnboardingStep).toHaveBeenCalled()

    fireEvent.click(screen.getAllByText('go')[0])
    await act(() => vi.advanceTimersByTimeAsync(2_000))
    expect(screen.getByText('elsewhere')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it('only reports the marketplace step from the catalog, not from detail', async () => {
    auth.isAuthenticated = true

    renderAt('/models/deepseek%2Fdeepseek-v3?utm_source=bing')
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(reportOnboardingStep).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('https://modelgo.com/models/deepseek%2Fdeepseek-v3?utm_source=bing&from=console')
  })

  it('maps pre-#983 unencoded multi-segment detail links to one encoded id', async () => {
    renderAt('/models/deepseek/deepseek-v3')
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(replace).toHaveBeenCalledWith('https://modelgo.com/models/deepseek%2Fdeepseek-v3?from=console')
  })

  it('still redirects on the second full-page landing within the window', async () => {
    seedLoopRecord('/models', 1)

    renderAt('/models')
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(replace).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sessionStorage.getItem(LOOP_GUARD_KEY) ?? '{}')).toMatchObject({ path: '/models', count: 2 })
  })

  it('stops on the third full-page landing of the same path and offers a manual link', async () => {
    seedLoopRecord('/models/discovery', 2)

    renderAt('/models/discovery')
    await act(() => vi.advanceTimersByTimeAsync(2_000))

    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByText(i18n.t('common.officialModels.manual'))).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('common.officialModels.go') }).getAttribute('href'))
      .toBe('https://modelgo.com/models/rankings?from=console')
  })

  it('never blocks in-app navigation, even right after automatic redirects', async () => {
    seedLoopRecord('/models/discovery', 5)

    renderAt('/models/discovery', { inApp: true })
    fireEvent.click(screen.getAllByText('go')[0])
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(replace).toHaveBeenCalledWith('https://modelgo.com/models/rankings?from=console')
  })
})
