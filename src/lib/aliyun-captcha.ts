/**
 * 阿里云验证码 2.0（滑块/智能验证）前端接入（qa#299）。
 * 触发点：登录 / 注册 / 发送短信·邮箱验证码。验证通过拿到 captchaVerifyParam，
 * 随对应请求提交给后端做二次校验（VerifyIntelligentCaptcha）。
 *
 * getCaptchaParam() 契约（始终 resolve，从不 reject——不阻断主流程是硬要求）：
 *   resolve(string) → 人机验证通过，把该 param 附到请求体的 captcha_verify_param
 *   resolve(null)   → 验证码「未启用」（未配 SceneId）、SDK 不可用（加载失败/CSP/被墙）
 *                     或用户未在超时内完成挑战 → 调用方【照常放行】，不阻断主流程
 *                     （后端对缺失 param 亦 fail-open，默认 staged rollout 姿态）
 *
 * 设计要点：
 * - SceneId/prefix 走 build-time env，按国内(china)/海外(global)双端区分，未配即
 *   「禁用」，绝不因缺失而抛错或阻断（不进 vite REQUIRED_URL_ENV）。
 * - SDK 脚本异步注入、promise 去重单例，任何加载失败都降级为 resolve(null)。
 */
import { getMarketDefaultLang, type Market } from '@/lib/market'
import { useLangStore } from '@/store/use-brand-store'

const SDK_SRC = 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js'
const LOAD_TIMEOUT_MS = 8000
const RENDER_TIMEOUT_MS = 15000

type CaptchaVerifyResult = { captchaResult: boolean; bizResult?: boolean }
interface AliyunCaptchaInitOptions {
  SceneId: string
  prefix: string
  mode: 'popup' | 'embed'
  element: string
  button?: string
  captchaVerifyCallback: (captchaVerifyParam: string) => Promise<CaptchaVerifyResult>
  onBizResultCallback?: (bizResult: boolean) => void
  getInstance: (instance: unknown) => void
  slideStyle?: { width: number; height: number }
  language?: 'cn' | 'en'
  region?: 'cn' | 'sgp'
}
declare global {
  interface Window {
    initAliyunCaptcha?: (opts: AliyunCaptchaInitOptions) => void
  }
}

/** Per-region scene config from build-time env; null when this region is unconfigured (= disabled). */
function resolveSceneConfig(market: Market): { sceneId: string; prefix: string } | null {
  // env 变量名后缀是部署配置键（VITE_ALIYUN_CAPTCHA_*_DOMESTIC），不随市场词汇改名
  const suffix = market === 'china' ? 'DOMESTIC' : 'GLOBAL'
  const env = import.meta.env as Record<string, string | undefined>
  const sceneId = (env[`VITE_ALIYUN_CAPTCHA_SCENE_ID_${suffix}`] ?? '').trim()
  const prefix = (env[`VITE_ALIYUN_CAPTCHA_PREFIX_${suffix}`] ?? '').trim()
  if (!sceneId || !prefix) return null
  return { sceneId, prefix }
}

/** True when the active region has a configured scene — the frontend "enabled" switch. */
export function isCaptchaEnabled(): boolean {
  // 走 platform-config 驱动的 store（初值=域名探测,配置到达后覆盖）——test 单域名可切两端（#466）
  return resolveSceneConfig(useLangStore.getState().market) !== null
}

let sdkPromise: Promise<boolean> | null = null

/** Inject the Aliyun Captcha SDK once. Resolves false (never throws) on any failure. */
function loadSdk(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false)
  if (typeof window.initAliyunCaptcha === 'function') return Promise.resolve(true)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<boolean>((resolve) => {
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      if (!ok) sdkPromise = null // allow a later retry after a transient failure
      resolve(ok)
    }
    const timer = window.setTimeout(() => done(false), LOAD_TIMEOUT_MS)
    const s = document.createElement('script')
    s.src = SDK_SRC
    s.async = true
    s.onload = () => {
      window.clearTimeout(timer)
      done(typeof window.initAliyunCaptcha === 'function')
    }
    s.onerror = () => {
      window.clearTimeout(timer)
      done(false)
    }
    document.head.appendChild(s)
  })
  return sdkPromise
}

let mountSeq = 0

/**
 * Pops the Aliyun captcha challenge once and resolves its captchaVerifyParam.
 * See the contract at the top of this file. ALWAYS resolves (string|null), never
 * rejects — disabled / SDK-unavailable / user-didn't-finish-before-timeout all
 * resolve null so the caller proceeds (backend fail-open).
 *
 * ⚠️ ENABLED-PATH SMOKE REQUIRED: Aliyun Captcha 2.0 popup mode binds the
 * challenge to a click on `button`; our flow is "get param, then submit", so we
 * mount an off-screen trigger button + container, init, then open the popup via
 * the instance's show() (or by clicking the bound button). The exact
 * trigger/anchor semantics are SDK-version-specific and cannot be validated
 * without a live SceneId — whoever provisions the Aliyun scene MUST smoke-test
 * that the popup renders and captchaVerifyCallback fires before flipping the
 * SceneId on. Until then the deploy runs disabled (SceneId blank → this returns
 * null immediately and never touches the SDK).
 */
export function getCaptchaParam(): Promise<string | null> {
  const market = useLangStore.getState().market
  const scene = resolveSceneConfig(market)
  if (!scene) return Promise.resolve(null) // disabled for this region

  return loadSdk().then((ok) => {
    const init = window.initAliyunCaptcha
    if (!ok || typeof init !== 'function') return null // SDK unavailable → degrade
    return new Promise<string | null>((resolve) => {
      const id = `aliyun-captcha-${++mountSeq}`
      // Off-screen (NOT display:none — the SDK computes layout) host holding the
      // widget mount element + the trigger button popup mode binds to.
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;overflow:hidden'
      host.innerHTML = `<div id="${id}-el"></div><button id="${id}-btn" type="button" aria-hidden="true"></button>`
      document.body.appendChild(host)
      const btn = host.querySelector<HTMLButtonElement>(`#${id}-btn`)

      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        window.setTimeout(() => host.remove(), 0)
        fn()
      }
      // If the widget never produces a result (blocked / user closed / hung),
      // degrade rather than hang the form forever.
      const timer = window.setTimeout(() => finish(() => resolve(null)), RENDER_TIMEOUT_MS)

      try {
        init({
          SceneId: scene.sceneId,
          prefix: scene.prefix,
          mode: 'popup',
          element: `#${id}-el`,
          button: `#${id}-btn`,
          language: getMarketDefaultLang(market) === 'zh' ? 'cn' : 'en',
          region: market === 'china' ? 'cn' : 'sgp',
          // The SDK invokes this with the verify token once the user solves the
          // challenge. We resolve the outer promise with it and tell the widget
          // the "business" step succeeded so it closes; the real request is done
          // by the caller, not here.
          captchaVerifyCallback: async (captchaVerifyParam: string) => {
            window.clearTimeout(timer)
            finish(() => resolve(captchaVerifyParam))
            return { captchaResult: true, bizResult: true }
          },
          // Open the popup on demand: prefer the instance's show(); fall back to
          // clicking the bound trigger button.
          getInstance: (instance: unknown) => {
            const inst = instance as { show?: () => void }
            if (typeof inst?.show === 'function') inst.show()
            else queueMicrotask(() => btn?.click())
          },
        })
      } catch {
        window.clearTimeout(timer)
        finish(() => resolve(null)) // init threw → degrade, never block login
      }
    })
  })
}
