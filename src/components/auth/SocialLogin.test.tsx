import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SocialLogin } from './SocialLogin'

// OAuth 按钮必须**先解题拿到 token 再导航**（用户实测：点一下立刻跳回来，看不到滑块）。
//
// 后端在跳去厂商之前校验 captcha_verify_param，不带就 302 回登录页 —— 所以"不带 token 直接导航"
// 这件事在用例里必须是红的，否则回归时只会表现为一次静默弹回。
vi.mock('@/hooks/useMarket', () => ({ useMarket: () => 'global' }))
vi.mock('@/hooks/use-platform-config', () => ({ useOAuthMethods: () => ['google'] }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? 'Google' }),
}))

const getCaptchaOutcome = vi.fn()
vi.mock('@/lib/aliyun-captcha', () => ({
  getCaptchaOutcome: () => getCaptchaOutcome(),
}))
// 图标包（@lobehub/icons）在 jsdom 下会拖进 emoji-mart 的 JSON、需要 import attribute —— 与本用例
// 要验的行为无关，直接替掉。
vi.mock('@/constants/oauth', () => ({
  // 图标必须是**真值**：组件用 Boolean(OAUTH_ICONS[method]) 过滤 provider，给 null 会把按钮过滤掉，
  // 用例就会以"找不到 button"失败而不是测到行为。
  OAUTH_ICONS: { google: 'G' },
  OAUTH_ICONS_LG: { google: 'G' },
  OAUTH_LABELS: { google: 'Google' },
}))
vi.mock('@/services/auth', () => ({
  oauthAuthorizeUrl: (provider: string, redirect: string, param?: string | null) =>
    `/api/v1/auth/oauth/${provider}/authorize?redirect=${encodeURIComponent(redirect)}` +
    (param ? `&captcha_verify_param=${encodeURIComponent(param)}` : ''),
}))

function stubNavigation() {
  const href = { value: '' }
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { get href() { return href.value }, set href(v: string) { href.value = v } },
  })
  return href
}

describe('SocialLogin', () => {
  beforeEach(() => {
    getCaptchaOutcome.mockReset()
  })

  it('解题成功后带着 token 导航', async () => {
    const href = stubNavigation()
    getCaptchaOutcome.mockResolvedValue({ param: 'solved-token', presented: true })
    render(<SocialLogin redirectTo="/dashboard" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(href.value).toContain('captcha_verify_param=solved-token'))
  })

  it('呈现过挑战但用户关掉弹窗时不导航', async () => {
    const href = stubNavigation()
    getCaptchaOutcome.mockResolvedValue({ param: null, presented: true })
    render(<SocialLogin redirectTo="/dashboard" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(getCaptchaOutcome).toHaveBeenCalled())
    expect(href.value).toBe('') // 带空 token 过去只会被 302 弹回来
  })

  // 国际站目前没有挑战码：呈现不出来时必须照常导航，否则第三方登录在那边整条被掐死。
  it('呈现不出挑战时照常导航（未启用 / SDK 不可用 —— 例如国际站）', async () => {
    const href = stubNavigation()
    getCaptchaOutcome.mockResolvedValue({ param: null, presented: false })
    render(<SocialLogin redirectTo="/dashboard" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(href.value).toContain('/authorize'))
    expect(href.value).not.toContain('captcha_verify_param')
  })
})
