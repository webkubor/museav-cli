/**
 * 请求头注入清单
 *
 * 所有前端自动注入的 HTTP 头集中管理在此，request.ts 的 beforeRequest 钩子统一调用。
 * 新增 header 只需在这里加一行，不需要动 request.ts 的核心逻辑。
 */

import i18n from 'i18next'
import { storageKeys } from '@/lib/storage'
import { getDeviceId } from '@/lib/device-fingerprint'

// ─── 类型定义 ────────────────────────────

/**
 * Accept-Language 枚举（BCP 47 标签）
 *
 * 前端始终发送此枚举内的值，后端按此做内容本地化。
 *
 * | 值     | 含义     | 覆盖来源                        |
 * |--------|----------|---------------------------------|
 * | zh-CN  | 简体中文 | html[lang]=zh / zh-CN / zh-*    |
 * | en-US  | 英语     | html[lang]=en / en-* / 未知语言 |
 *
 * 后端约定：
 * - 读取请求头 `Accept-Language`，按此枚举选择响应语言
 * - 收到枚举外的值或缺失时降级到 `en-US`
 * - 响应头 `Content-Language` 回写实际使用的语言标签
 *
 * 扩展：新增语言时在 LOCALE_MAP 加一行，并在 i18n/index.ts 注册翻译资源。
 */
export type AcceptLanguageTag = 'zh-CN' | 'en-US'

/** 所有自动注入的请求头字段名 */
export type InjectedHeader =
  | 'X-Tenant-Id' // 当前活跃租户
  | 'X-CSRF-Token' // CSRF 防护（非 GET 请求）
  | 'traceparent' // W3C 分布式追踪（OpenTelemetry），格式：00-{traceId}-{spanId}-01
  | 'Accept-Language' // 客户端语言偏好，值见 AcceptLanguageTag
  | 'X-Origin' // 请求来源域名（modelgo.com / modelgo.ai）
  | 'X-App-Version' // 前端版本号（来自 package.json）
  | 'X-Device-Id' // 设备指纹（FingerprintJS visitorId）

/** 每个注入头的定义 */
interface HeaderDef {
  mutatingOnly?: boolean
  resolve: () => string | null
}

// ─── 来源函数 ────────────────────────────

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const encoded = `${encodeURIComponent(name)}=`
  const item = document.cookie.split('; ').find((e) => e.startsWith(encoded))
  return item ? decodeURIComponent(item.slice(encoded.length)) : null
}

function activeTenantId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(storageKeys.activeTenantId())
}

function resolveOrigin(): string | null {
  if (typeof window === 'undefined') return null
  return window.location.hostname || null
}

// 必须跟 i18n.language 保持同一个真源——它之前独立读 localStorage 兜底探测浏览器语言，
// 跟真正驱动界面显示的 getInitialLang()（market.ts）无浏览器语言兜底、优先市场/域名默认
// 的逻辑不是一回事：国内域名 + 英文浏览器 + 未存偏好时，页面按市场默认显示中文，这里却会
// 探测浏览器语言发出 en-US，导致「界面显示语言」跟「告诉后端的语言」不同步。i18n.language
// 就是界面渲染的直接依据，两者不可能再分叉。
function resolveLocale(): AcceptLanguageTag {
  if (typeof window === 'undefined') return 'en-US'
  return i18n.language?.toLowerCase().includes('zh') ? 'zh-CN' : 'en-US'
}

/**
 * 生成 W3C traceparent 值。
 * 格式：00-{traceId(32hex)}-{spanId(16hex)}-01
 */
function generateTraceParent(): string {
  const hex = () => {
    const arr = new Uint8Array(16)
    crypto.getRandomValues(arr)
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  const traceId = hex().slice(0, 32)
  const spanId = hex().slice(0, 16)
  return `00-${traceId}-${spanId}-01`
}

// ─── 注入表（新增 header 只改这里）────────

const headerDefs: Record<InjectedHeader, HeaderDef> = {
  'X-Tenant-Id': { resolve: activeTenantId },
  'X-CSRF-Token': { resolve: () => readCookie('modelgo_csrf'), mutatingOnly: true },
  traceparent: { resolve: generateTraceParent },
  'Accept-Language': { resolve: resolveLocale },
  'X-Origin': { resolve: resolveOrigin },
  'X-App-Version': { resolve: () => __APP_VERSION__ },
  'X-Device-Id': { resolve: getDeviceId },
}

// ─── 统一注入入口 ─────────────────────────

/** 将自动注入头应用到请求上。request.ts 的 beforeRequest 调用。 */
export function injectHeaders(request: Request): void {
  for (const [name, def] of Object.entries(headerDefs)) {
    if (def.mutatingOnly && ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) continue
    const value = def.resolve()
    if (value) request.headers.set(name, value)
  }
}
