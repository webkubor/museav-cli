import { describe, expect, it, vi } from 'vitest'

/**
 * 锁住「模型调用网关域名按市场分叉」（需求方 shared/modelgo_prd#376）。
 *
 * 这个 bug 在 test 环境**验不出来**——test 只有一套网关，两个市场都是 api.test.modelgo.com，
 * 修复前后长得一模一样。真实分叉只有生产能眼见，所以用单测把映射钉死，防止有人再把它
 * 收敛回一个构建期常量（那正是国际站把国内网关地址发给用户的原因）。
 *
 * 要测生产行为就必须让 isTestOrDev() 为 false：DEV/MODE 和 hostname 三个条件都得避开，
 * 且必须在 import 之前设好——configs 是模块级常量，加载时就求值完了。
 */
vi.stubEnv('DEV', false)
vi.stubEnv('MODE', 'production')
Object.defineProperty(window, 'location', {
  value: { hostname: 'console.modelgo.ai', search: '' },
  writable: true,
})

// market.ts 的 requireEnv 会校验这些，缺一个模块就抛错
vi.stubEnv('VITE_DOMESTIC_SITE', 'https://modelgo.com')
vi.stubEnv('VITE_DOMESTIC_CONSOLE', 'https://console.modelgo.com')
vi.stubEnv('VITE_DOMESTIC_DOCS', 'https://docs.modelgo.com')
vi.stubEnv('VITE_GLOBAL_SITE', 'https://modelgo.ai')
vi.stubEnv('VITE_GLOBAL_CONSOLE', 'https://console.modelgo.ai')
vi.stubEnv('VITE_GLOBAL_DOCS', 'https://docs.modelgo.ai')
vi.stubEnv('VITE_DOMESTIC_GATEWAY_DOMAIN', 'api.modelgo.com')
vi.stubEnv('VITE_GLOBAL_GATEWAY_DOMAIN', 'api.modelgo.ai')

const { getGatewayDomain, getGatewayEndpoints } = await import('./gateway')

describe('网关域名按市场分叉', () => {
  it('国内站用 api.modelgo.com', () => {
    expect(getGatewayDomain('china')).toBe('api.modelgo.com')
  })

  it('国际站用 api.modelgo.ai，不是国内域名', () => {
    expect(getGatewayDomain('global')).toBe('api.modelgo.ai')
  })

  it('两个市场的网关域名必须不同——相同就是 #376 复发', () => {
    expect(getGatewayDomain('global')).not.toBe(getGatewayDomain('china'))
  })
})

describe('getGatewayEndpoints', () => {
  it('OpenAI 兼容带 /v1、Anthropic 兼容不带', () => {
    expect(getGatewayEndpoints('china').map((e) => e.baseUrl)).toEqual([
      'https://api.modelgo.com/v1',
      'https://api.modelgo.com',
    ])
  })

  it('国际站两个协议地址都落在 .ai 上', () => {
    expect(getGatewayEndpoints('global').map((e) => e.baseUrl)).toEqual([
      'https://api.modelgo.ai/v1',
      'https://api.modelgo.ai',
    ])
  })
})
