import { describe, expect, it } from 'vitest'
import { crossSiteModelUrl } from './cross-site-model-url'

const consoleUrlOf = (m: 'china' | 'global') =>
  m === 'china' ? 'https://console.modelgo.com' : 'https://console.modelgo.ai'

describe('crossSiteModelUrl', () => {
  it('测试/本地环境不给跨站链接 —— 只有一套控制台，且没配 VITE_GLOBAL_CONSOLE', () => {
    expect(crossSiteModelUrl('claude-fable-5', 'china', true, consoleUrlOf)).toBeNull()
  })

  it('国内站取不到 → 指向国外站；国外站取不到 → 指向国内站', () => {
    expect(crossSiteModelUrl('claude-fable-5', 'china', false, consoleUrlOf))
      .toBe('https://console.modelgo.ai/models/claude-fable-5')
    expect(crossSiteModelUrl('glm-5.2', 'global', false, consoleUrlOf))
      .toBe('https://console.modelgo.com/models/glm-5.2')
  })

  it('modelId 要转义 —— catalog 的 model_id 含点号与大小写，不能裸拼', () => {
    expect(crossSiteModelUrl('MiMo-V2.5-Pro', 'china', false, consoleUrlOf))
      .toBe('https://console.modelgo.ai/models/MiMo-V2.5-Pro')
    expect(crossSiteModelUrl('a/b?c', 'china', false, consoleUrlOf))
      .toBe('https://console.modelgo.ai/models/a%2Fb%3Fc')
  })

  it('没有 modelId 就不给链接，避免拼出 /models/ 这种半截地址', () => {
    expect(crossSiteModelUrl('', 'china', false, consoleUrlOf)).toBeNull()
  })
})
