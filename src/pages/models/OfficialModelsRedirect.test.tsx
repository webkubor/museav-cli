/**
 * 控制台旧模型页 → 官网中转（prd#1272）
 * 路由：/models、/models/discovery、/models/:modelId
 * API：POST /tenants/:tenantId/onboarding/steps/browse_marketplace（经 reportOnboardingStep）
 *
 * 钉住三件浏览器里不好复现的事：登录态访问广场要先等引导上报落地再整页跳（不等就被页面卸载掐掉），
 * 上报卡住时 1.5s 照跳不把人卡在中转页，以及同一标签页刚跳过又回来时停下给手动入口（防两站互相弹）。
 */
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_DOMESTIC_SITE', 'https://modelgo.com')
vi.stubEnv('VITE_DOMESTIC_CONSOLE', 'https://console.modelgo.com')
vi.stubEnv('VITE_DOMESTIC_DOCS', 'https://docs.modelgo.com')
vi.stubEnv('VITE_GLOBAL_SITE', 'https://modelgo.ai')
vi.stubEnv('VITE_GLOBAL_CONSOLE', 'https://console.modelgo.ai')
vi.stubEnv('VITE_GLOBAL_DOCS', 'https://docs.modelgo.ai')

const auth = vi.hoisted(() => ({ isAuthenticated: false }))
const reportOnboardingStep = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<void>>())

vi.mock('@/hooks/useMarket', () => ({ useMarket: () => 'china' }))
vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}))
vi.mock('@/store/use-onboarding-store', () => ({ reportOnboardingStep }))

const { default: i18n } = await import('@/i18n')
const { OfficialModelsRedirect } = await import('./OfficialModelsRedirect')

const realLocation = window.location
const replace = vi.fn()

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/models">
          <Route index element={<OfficialModelsRedirect kind="catalog" />} />
          <Route path="discovery" element={<OfficialModelsRedirect kind="rankings" />} />
          <Route path=":modelId" element={<OfficialModelsRedirect kind="detail" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  vi.useFakeTimers()
  sessionStorage.clear()
  auth.isAuthenticated = false
  reportOnboardingStep.mockReset()
  replace.mockReset()
  Object.defineProperty(window, 'location', {
    value: { ...realLocation, replace },
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
  it('sends anonymous visitors straight to the official catalog without reporting onboarding', async () => {
    renderAt('/models?gclid=G1&market=global')
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(reportOnboardingStep).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('https://modelgo.com/models?gclid=G1&from=console')
  })

  it('waits for the onboarding report before leaving when a signed-in user opens the catalog', async () => {
    auth.isAuthenticated = true
    let settle!: () => void
    reportOnboardingStep.mockReturnValue(new Promise<void>((resolve) => { settle = resolve }))

    renderAt('/models')
    await act(() => vi.advanceTimersByTimeAsync(200))
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

  it('only reports the marketplace step from the catalog, not from rankings or detail', async () => {
    auth.isAuthenticated = true

    renderAt('/models/deepseek%2Fdeepseek-v3?utm_source=bing')
    await act(() => vi.advanceTimersByTimeAsync(0))

    expect(reportOnboardingStep).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('https://modelgo.com/models/deepseek%2Fdeepseek-v3?utm_source=bing&from=console')
  })

  it('stops and offers a manual link when this tab was just redirected and came back', async () => {
    sessionStorage.setItem('mg_official_models_redirect_at', String(Date.now()))

    renderAt('/models/discovery')
    await act(() => vi.advanceTimersByTimeAsync(2_000))

    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByText(i18n.t('common.officialModels.manual'))).toBeTruthy()
    expect(screen.getByRole('link', { name: i18n.t('common.officialModels.go') }).getAttribute('href'))
      .toBe('https://modelgo.com/models/rankings?from=console')
  })
})
