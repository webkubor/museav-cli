/**
 * 阿里云图形认证（号码认证服务，ct4.js / initAlicom4）前端接入。
 *
 * 与验证码 2.0 的差异：初始化只需 app_id（运行时从
 * GET /api/v1/auth/captcha/config 下发，无 build-time env）；验证成功产出
 * {lot_number, captcha_output, pass_token, gen_time} 四元组，JSON 序列化后放进
 * 请求体现有的 captcha_verify_param 字段，由服务端二次校验。
 *
 * 降级契约与验证码 2.0 一致（不阻断主流程是硬要求）：
 * 配置未启用 / SDK 加载失败（ct4.js 未部署、CSP、断网）/ 初始化异常 → 一律视为
 * 「验证码不可用」，表单照常提交（captcha_verify_param 缺省，后端 fail-open）。
 * 仅当 SDK 正常可用时，页面上的验证条才要求用户完成挑战后再提交。
 */
import { get } from '@/lib/request'

/** ct4.js 为控制台下载的自托管资产（官方无公开 CDN），与前端一同发布。 */
const SDK_SRC = '/vendor/ct4.js'
const LOAD_TIMEOUT_MS = 8000

export interface CaptchaRuntimeConfig {
  enabled: boolean
  provider?: string
  app_id?: string
  scene_id?: string
  prefix?: string
  region_id?: string
}

export interface AlicomValidate {
  lot_number: string
  captcha_output: string
  pass_token: string
  gen_time: string
}

interface AlicomCaptchaObj {
  onReady?: (cb: () => void) => void
  onNextReady?: (cb: () => void) => void
  onSuccess: (cb: () => void) => void
  onError: (cb: (err: unknown) => void) => void
  onFail?: (cb: (err: unknown) => void) => void
  onClose?: (cb: () => void) => void
  showCaptcha: () => void
  getValidate: () => AlicomValidate | undefined
  reset: () => void
  destroy?: () => void
}

declare global {
  interface Window {
    initAlicom4?: (
      opts: { captchaId: string; product: 'bind'; language?: string },
      cb: (captchaObj: AlicomCaptchaObj) => void
    ) => void
  }
}

let configPromise: Promise<CaptchaRuntimeConfig | null> | null = null

/**
 * 运行时验证码配置（单例缓存）。请求失败 → null（视为未启用，绝不阻断登录页）。
 */
export function fetchCaptchaConfig(): Promise<CaptchaRuntimeConfig | null> {
  if (configPromise) return configPromise
  configPromise = get<CaptchaRuntimeConfig>('auth/captcha/config')
    .then((cfg) => cfg ?? null)
    .catch(() => {
      configPromise = null // 瞬时失败允许下次重取
      return null
    })
  return configPromise
}

let sdkPromise: Promise<boolean> | null = null

/** 注入 ct4.js（单例）。任何失败 resolve(false)，从不抛错。 */
function loadSdk(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve(false)
  if (typeof window.initAlicom4 === 'function') return Promise.resolve(true)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<boolean>((resolve) => {
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      if (!ok) sdkPromise = null
      resolve(ok)
    }
    const timer = window.setTimeout(() => done(false), LOAD_TIMEOUT_MS)
    const s = document.createElement('script')
    s.src = SDK_SRC
    s.async = true
    s.charset = 'utf-8'
    s.onload = () => {
      window.clearTimeout(timer)
      done(typeof window.initAlicom4 === 'function')
    }
    s.onerror = () => {
      window.clearTimeout(timer)
      done(false)
    }
    document.head.appendChild(s)
  })
  return sdkPromise
}

export interface AlicaptchaSession {
  /** 调起验证弹窗。 */
  show: () => void
  /** 完成后重置为未验证态（token 一次性，提交失败重试前调用）。 */
  reset: () => void
  destroy: () => void
}

export interface AlicaptchaSessionHooks {
  /** 验证成功：拿到四元组 JSON 字符串（直接作为 captcha_verify_param 提交）。 */
  onVerified: (param: string) => void
  /** SDK 不可用（加载/初始化失败）：调用方应隐藏验证条并按未启用处理。 */
  onUnavailable: () => void
  /** 用户验证失败（可重试，弹窗自带重试交互），可选。 */
  onFail?: () => void
}

/**
 * 建立一次图形认证会话（product=bind 手动调起挑战）。语言跟随控制台当前语种。
 * 返回 null 表示不可用（未启用 / 非 alicaptcha / SDK 不可用），调用方按未启用降级。
 */
export async function createAlicaptchaSession(
  lang: 'zh' | 'en',
  hooks: AlicaptchaSessionHooks
): Promise<AlicaptchaSession | null> {
  const cfg = await fetchCaptchaConfig()
  if (!cfg?.enabled || cfg.provider !== 'alicaptcha' || !cfg.app_id) return null
  const ok = await loadSdk()
  const init = window.initAlicom4
  if (!ok || typeof init !== 'function') return null

  return new Promise<AlicaptchaSession | null>((resolve) => {
    let settled = false
    // 初始化卡死（资源被墙等）也要给调用方一个可降级的结果
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true
        resolve(null)
      }
    }, LOAD_TIMEOUT_MS)
    try {
      // product 必须保持 bind：本 SDK（GeeTest 4.0 技术栈）里 bind = 不自动渲染任何 UI、
      // 完全由代码 showCaptcha() 手动调起，正是本文件的命令式用法所需。
      // ⚠️ 别改成 popup —— popup 要 SDK 自己渲染触发按钮，改了 showCaptcha() 弹不出弹窗
      //（2026-08-17 实测踩过：验证条点了没反应）。
      init({ captchaId: cfg.app_id!, product: 'bind', language: lang === 'zh' ? 'zho' : 'eng' }, (captchaObj) => {
        captchaObj.onSuccess(() => {
          const v = captchaObj.getValidate()
          if (v?.lot_number) hooks.onVerified(JSON.stringify(v))
        })
        captchaObj.onError(() => hooks.onUnavailable())
        captchaObj.onFail?.(() => hooks.onFail?.())
        if (!settled) {
          settled = true
          window.clearTimeout(timer)
          resolve({
            show: () => captchaObj.showCaptcha(),
            reset: () => captchaObj.reset(),
            destroy: () => captchaObj.destroy?.(),
          })
        }
      })
    } catch {
      // init 同步抛错 → 回调从未执行，无实例可销毁
      window.clearTimeout(timer)
      if (!settled) {
        settled = true
        resolve(null)
      }
    }
  })
}

/**
 * 一次性弹窗流（无可见验证条的场景：注册/发码/手机号登录复用）。
 * resolve(四元组 JSON) = 验证通过；resolve(null) = 不可用/降级 → 照常提交。
 * 用户主动关闭弹窗不 resolve null——由 RENDER 超时兜底，避免误放行真人拒答场景
 * 之外把表单挂死。
 */
export function getAlicaptchaParamOnce(lang: 'zh' | 'en', timeoutMs = 60000): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: string | null, session?: AlicaptchaSession | null) => {
      if (done) return
      done = true
      session?.destroy()
      resolve(v)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    void createAlicaptchaSession(lang, {
      onVerified: (param) => {
        window.clearTimeout(timer)
        finish(param)
      },
      onUnavailable: () => {
        window.clearTimeout(timer)
        finish(null)
      },
    }).then((session) => {
      if (!session) {
        window.clearTimeout(timer)
        finish(null)
        return
      }
      if (done) {
        session.destroy()
        return
      }
      session.show()
    })
  })
}
