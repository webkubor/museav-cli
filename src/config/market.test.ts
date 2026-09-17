import { describe, expect, it, vi } from 'vitest'

// market.ts 用 requireEnv 读 VITE_* 环境变量，测试里先注入再动态 import
vi.stubEnv('VITE_DOMESTIC_SITE', 'https://modelgo.com')
vi.stubEnv('VITE_DOMESTIC_CONSOLE', 'https://console.modelgo.com')
vi.stubEnv('VITE_DOMESTIC_DOCS', 'https://docs.modelgo.com')
vi.stubEnv('VITE_GLOBAL_SITE', 'https://modelgo.ai')
vi.stubEnv('VITE_GLOBAL_CONSOLE', 'https://console.modelgo.ai')
vi.stubEnv('VITE_GLOBAL_DOCS', 'https://docs.modelgo.ai')

const { siteUrlForLocale, getMarketConfig } = await import('./market')

/**
 * 锁住官网语言前缀映射（shared/modelgo_prd#374）。
 * 官网 modelgo-global-web 用 Astro 路径式 i18n：/ = en（默认）、/zh/ = 中文。
 * 退化成不带前缀，就是「控制台切中文、官网还是英文」那个 bug。
 */
describe('siteUrlForLocale', () => {
  it('国际站中文界面走 /zh 前缀', () => {
    expect(siteUrlForLocale('global', 'zh-CN')).toBe('https://modelgo.ai/zh')
    expect(siteUrlForLocale('global', 'zh')).toBe('https://modelgo.ai/zh')
  })

  it('国际站英文界面用默认语言根路径，不加前缀', () => {
    expect(siteUrlForLocale('global', 'en-US')).toBe('https://modelgo.ai')
  })

  it('国内站只有中文且为默认语言，任何语言都不加前缀（官网无 /zh 目录）', () => {
    expect(siteUrlForLocale('china', 'zh-CN')).toBe('https://modelgo.com')
    expect(siteUrlForLocale('china', 'en-US')).toBe('https://modelgo.com')
  })

  it('带子路径时前缀在子路径之前', () => {
    expect(siteUrlForLocale('global', 'zh-CN', 'enterprise')).toBe('https://modelgo.ai/zh/enterprise')
    expect(siteUrlForLocale('global', 'en-US', '/enterprise')).toBe('https://modelgo.ai/enterprise')
  })

  it('locale 缺省按非中文处理，不误加前缀', () => {
    expect(siteUrlForLocale('global', '')).toBe('https://modelgo.ai')
  })
})

/** 换绑弹窗求助出口（shared/modelgo_prd#837）：两个市场都用同一个反馈邮箱 feedback@modelgo.com（boss 09-15 定） */
describe('supportEmail', () => {
  it.each(['china', 'global'] as const)('%s 市场配置了合法邮箱', (market) => {
    expect(getMarketConfig(market).supportEmail).toMatch(/^[^\s@]+@modelgo\.com$/)
  })
})
