/**
 * llms.txt 构建产物验证
 * 路由：构建期公开资源 /llms.txt
 * API：无
 */
import { describe, expect, it } from 'vitest'
import { renderLlms, renderLlmsWithEnv } from '../../scripts/build-llms.mjs'

const TEST_ENV = {
  VITE_DOMESTIC_CONSOLE: 'console.modelgo.com',
  VITE_DOMESTIC_SITE: 'modelgo.com',
  VITE_DOMESTIC_DOCS: 'docs.modelgo.com',
  VITE_DOMESTIC_GATEWAY_DOMAIN: 'api.modelgo.com',
  VITE_GLOBAL_CONSOLE: 'console.modelgo.ai',
  VITE_GLOBAL_SITE: 'modelgo.ai',
  VITE_GLOBAL_DOCS: 'docs.modelgo.ai',
  VITE_GLOBAL_GATEWAY_DOMAIN: 'api.modelgo.ai',
}

describe('llms.txt API endpoints', () => {
  it('keeps China and Global gateway URLs tied to their named markets', () => {
    const content = renderLlms('both')

    expect(content).toContain('- Base URL (China): `https://api.modelgo.com/v1`')
    expect(content).toContain('- Base URL (Global): `https://api.modelgo.ai/v1`')
    expect(content).not.toContain('- Base URL (China): `https://api.modelgo.ai/v1`')
  })

  it('renders each market from its matching configuration', () => {
    expect(renderLlmsWithEnv('china', TEST_ENV)).toContain('https://api.modelgo.com/v1')
    expect(renderLlmsWithEnv('global', TEST_ENV)).toContain('- Base URL (China): `https://api.modelgo.com/v1`')
    expect(renderLlmsWithEnv('global', TEST_ENV)).toContain('- Base URL (Global): `https://api.modelgo.ai/v1`')
  })

  it('fails closed when the global build cannot render the domestic gateway', () => {
    const withoutDomesticGateway = Object.fromEntries(
      Object.entries(TEST_ENV).filter(([name]) => name !== 'VITE_DOMESTIC_GATEWAY_DOMAIN'),
    )

    expect(() => renderLlmsWithEnv('global', withoutDomesticGateway)).toThrow(/未定义的占位 \{gateway_china\}/)
  })
})
