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

const getCaptchaParam = vi.fn()
const isCaptchaEnabled = vi.fn()
vi.mock('@/lib/aliyun-captcha', () => ({
  getCaptchaParam: () => getCaptchaParam(),
  isCaptchaEnabled: () => isCaptchaEnabled(),
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
    getCaptchaParam.mockReset()
    isCaptchaEnabled.mockReset()
  })

  it('解题成功后带着 token 导航', async () => {
    const href = stubNavigation()
    getCaptchaParam.mockResolvedValue('solved-token')
    isCaptchaEnabled.mockReturnValue(true)
    render(<SocialLogin redirectTo="/dashboard" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(href.value).toContain('captcha_verify_param=solved-token'))
  })

  it('启用了滑块但没拿到 token（用户关掉弹窗）时不导航', async () => {
    const href = stubNavigation()
    getCaptchaParam.mockResolvedValue(null)
    isCaptchaEnabled.mockReturnValue(true)
    render(<SocialLogin redirectTo="/dashboard" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(getCaptchaParam).toHaveBeenCalled())
    expect(href.value).toBe('') // 带空 token 过去只会被 302 弹回来
  })

  it('本市场未启用滑块时照常导航（没有题可解）', async () => {
    const href = stubNavigation()
    getCaptchaParam.mockResolvedValue(null)
    isCaptchaEnabled.mockReturnValue(false)
    render(<SocialLogin redirectTo="/dashboard" />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(href.value).toContain('/authorize'))
    expect(href.value).not.toContain('captcha_verify_param')
  })
})
