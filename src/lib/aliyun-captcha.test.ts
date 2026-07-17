import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// market is read at call time; mock it so we control region without a real DOM host.
// getInitialLang 供依赖图中的 use-brand-store 模块级初始化使用（缺了会整树加载失败）。
vi.mock('@/lib/market', () => ({
  getMarket: () => 'china',
  getMarketDefaultLang: () => 'zh',
  getInitialLang: () => 'zh',
}))

// 运行时验证码配置请求离线打桩：默认「接口不可达」→ 走 build-time env 旧路径，
// 保持下面既有用例语义不变；单个用例可用 mockResolvedValueOnce 覆盖。
const configGet = vi.hoisted(() =>
  vi.fn<() => Promise<unknown>>(() => Promise.reject(new Error('offline')))
)
vi.mock('@/lib/request', () => ({ get: configGet }))

describe('aliyun-captcha graceful degrade (qa#299)', () => {
  beforeEach(() => {
    vi.resetModules()
    // ensure no SceneId env for the default disabled case
    delete (import.meta.env as Record<string, string | undefined>).VITE_ALIYUN_CAPTCHA_SCENE_ID_DOMESTIC
    delete (import.meta.env as Record<string, string | undefined>).VITE_ALIYUN_CAPTCHA_PREFIX_DOMESTIC
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('isCaptchaEnabled is false when the region has no SceneId', async () => {
    const { isCaptchaEnabled } = await import('./aliyun-captcha')
    expect(isCaptchaEnabled()).toBe(false)
  })

  it('getCaptchaParam resolves null (proceed) when disabled — never touches the SDK/DOM', async () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const { getCaptchaParam } = await import('./aliyun-captcha')
    await expect(getCaptchaParam()).resolves.toBeNull()
    expect(appendSpy).not.toHaveBeenCalled() // no script injected when disabled
    expect(window.initAliyunCaptcha).toBeUndefined()
  })

  it('getCaptchaParam dispatches to alicaptcha and degrades to null when ct4.js unavailable', async () => {
    configGet.mockImplementationOnce(() =>
      Promise.resolve({ enabled: true, provider: 'alicaptcha', app_id: 'app_1' })
    )
    // ct4.js 加载失败（未部署/被墙）→ 降级 null，不阻断
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: unknown) => {
      const el = node as HTMLScriptElement
      queueMicrotask(() => el.onerror?.(new Event('error')))
      return el as never
    })
    const { getCaptchaParam } = await import('./aliyun-captcha')
    await expect(getCaptchaParam()).resolves.toBeNull()
  })

  it('getCaptchaParam resolves null when runtime config says disabled', async () => {
    configGet.mockImplementationOnce(() => Promise.resolve({ enabled: false }))
    const appendSpy = vi.spyOn(document.head, 'appendChild')
    const { getCaptchaParam } = await import('./aliyun-captcha')
    await expect(getCaptchaParam()).resolves.toBeNull()
    expect(appendSpy).not.toHaveBeenCalled()
  })

  it('getCaptchaParam degrades to null when SceneId set but SDK fails to load', async () => {
    const env = import.meta.env as Record<string, string | undefined>
    env.VITE_ALIYUN_CAPTCHA_SCENE_ID_DOMESTIC = 'scene_x'
    env.VITE_ALIYUN_CAPTCHA_PREFIX_DOMESTIC = 'abcde'
    // simulate script load failure: appended script fires onerror
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: unknown) => {
      const s = node as HTMLScriptElement
      queueMicrotask(() => s.onerror?.(new Event('error')))
      return s
    })
    const { getCaptchaParam } = await import('./aliyun-captcha')
    await expect(getCaptchaParam()).resolves.toBeNull() // load failure → degrade, not throw
    env.VITE_ALIYUN_CAPTCHA_SCENE_ID_DOMESTIC = ''
    env.VITE_ALIYUN_CAPTCHA_PREFIX_DOMESTIC = ''
  })
})
