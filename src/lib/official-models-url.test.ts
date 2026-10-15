/**
 * 控制台旧模型页 → 官网地址映射（prd#1272）
 * 路由：/models、/models/discovery、/models/:modelId 的重定向目标
 * API：无
 */
import { describe, expect, it, vi } from 'vitest'

// market.ts 用 requireEnv 读 VITE_* 环境变量，测试里先注入再动态 import
vi.stubEnv('VITE_DOMESTIC_SITE', 'https://modelgo.com')
vi.stubEnv('VITE_DOMESTIC_CONSOLE', 'https://console.modelgo.com')
vi.stubEnv('VITE_DOMESTIC_DOCS', 'https://docs.modelgo.com')
vi.stubEnv('VITE_GLOBAL_SITE', 'https://modelgo.ai')
vi.stubEnv('VITE_GLOBAL_CONSOLE', 'https://console.modelgo.ai')
vi.stubEnv('VITE_GLOBAL_DOCS', 'https://docs.modelgo.ai')

const { officialModelsUrl } = await import('./official-models-url')

describe('officialModelsUrl', () => {
  it('maps each console page to the same page on the market site', () => {
    expect(officialModelsUrl('china', 'zh-CN', { kind: 'catalog' })).toBe('https://modelgo.com/models')
    expect(officialModelsUrl('global', 'en-US', { kind: 'catalog' })).toBe('https://modelgo.ai/models')
  })

  it('sends the old discovery path to rankings, which is the official-site name', () => {
    expect(officialModelsUrl('china', 'zh-CN', { kind: 'rankings' })).toBe('https://modelgo.com/models/rankings')
  })

  it('keeps vendor/model ids in one encoded path segment', () => {
    expect(officialModelsUrl('china', 'zh-CN', { kind: 'detail', modelId: 'deepseek/deepseek-v3' }))
      .toBe('https://modelgo.com/models/deepseek%2Fdeepseek-v3')
  })

  it('adds the /zh prefix only for the global site in Chinese', () => {
    expect(officialModelsUrl('global', 'zh-CN', { kind: 'rankings' })).toBe('https://modelgo.ai/zh/models/rankings')
    expect(officialModelsUrl('china', 'zh-CN', { kind: 'rankings' })).toBe('https://modelgo.com/models/rankings')
  })

  it('carries ad and referral params but drops the console-only market switch', () => {
    const url = new URL(
      officialModelsUrl('china', 'zh-CN', { kind: 'catalog' }, {
        search: '?market=global&gclid=abc&utm_source=bing&aff=K9&q=deepseek',
        hash: '#list',
      }),
    )

    expect(url.searchParams.get('market')).toBeNull()
    expect(url.searchParams.get('gclid')).toBe('abc')
    expect(url.searchParams.get('utm_source')).toBe('bing')
    expect(url.searchParams.get('aff')).toBe('K9')
    expect(url.searchParams.get('q')).toBe('deepseek')
    expect(url.hash).toBe('#list')
  })
})
