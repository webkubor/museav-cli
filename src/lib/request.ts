import ky from 'ky'
import type { ApiError, ApiResponse, QueryParams } from '@/types'
import { injectHeaders } from '@/lib/request-headers'
import { getMarket } from '@/lib/market'
import { useLangStore } from '@/store/use-brand-store'

const API_V1_PREFIX = 'api/v1'
const DEV_TOOLS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_TOOLS === 'true'

function normalizeApiHost(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function apiBaseUrl() {
  // dev/test 工具条开启时从 store 读运行时 market，支持切换 API 域名
  const market = DEV_TOOLS_ENABLED ? useLangStore.getState().market : getMarket()
  const marketDomain =
    market === 'domestic'
      ? import.meta.env.VITE_DOMESTIC_API_DOMAIN
      : import.meta.env.VITE_GLOBAL_API_DOMAIN

  return normalizeApiHost(marketDomain) ?? normalizeApiHost(import.meta.env.VITE_API_URL) ?? ''
}

function apiUrl(path: string) {
  return `${apiBaseUrl()}/${API_V1_PREFIX}/${path.replace(/^\/+/, '')}`
}

function apiPrefixUrl() {
  const base = apiBaseUrl()
  return base ? `${base}/${API_V1_PREFIX}` : `/${API_V1_PREFIX}`
}

function normalizePath(path: string) {
  return path.replace(/^\/+/, '')
}

// ─── 模块标签映射（URL 路径 → 中文模块名） ──────────────────────────────────
const MODULE_LABEL_MAP: Array<[RegExp, string]> = [
  // Auth
  [/\/auth\/session/,              '会话检查'],
  [/\/auth\/login/,                '登录'],
  [/\/auth\/register/,             '注册'],
  [/\/auth\/logout/,               '登出'],
  [/\/auth\/email-code/,           '邮箱验证码'],
  [/\/auth\/email\/check/,         '邮箱预检'],
  [/\/auth\/password/,             '密码重置'],
  [/\/auth\/oauth/,                'OAuth 授权'],
  [/\/auth\/device/,               '设备码授权'],
  // Account
  [/\/account\/avatar/,            '账号头像'],
  [/\/account\/password/,          '修改密码'],
  [/\/account\/preferences/,       '偏好设置'],
  [/\/account\/connect/,           '第三方绑定'],
  [/\/account\/delete-request/,    '注销账号'],
  [/\/account\/profile/,           '账号信息'],
  [/\/account\/active-tenant/,     '切换组织'],
  // Tenant 成员
  [/\/tenants\/[^/]+\/members\/[^/]+/, '组织成员详情'],
  [/\/tenants\/[^/]+\/members/,    '组织成员'],
  [/\/tenants\/[^/]+\/invite-link/,'组织邀请链接'],
  // Tenant 财务
  [/\/tenants\/[^/]+\/balance/,    '账户余额'],
  [/\/tenants\/[^/]+\/recharges/,  '充值订单'],
  [/\/tenants\/[^/]+\/promo-codes/,'促销码兑换'],
  [/\/tenants\/[^/]+\/billing\/transactions/, '账单流水'],
  [/\/tenants\/[^/]+\/overview\/billing/, 'Dashboard 看板'],
  [/\/tenants\/[^/]+\/logo/,       '组织头像'],
  [/\/tenants\//,                  '组织'],
  // Workspace
  [/\/workspaces\/[^/]+\/api-keys\/[^/]+/, 'API Key 详情'],
  [/\/workspaces\/[^/]+\/api-keys/,'API Keys'],
  [/\/workspaces\/[^/]+\/members\/[^/]+/, '工作区成员详情'],
  [/\/workspaces\/[^/]+\/members/, '工作区成员'],
  [/\/workspaces\/[^/]+\/invite-link/, '工作区邀请链接'],
  [/\/workspaces\/[^/]+\/invitations/, '工作区邀请'],
  [/\/workspaces\/[^/]+\/guardrails/, '安全护栏列表'],
  [/\/workspaces\/[^/]+\/observability\/broadcast-dead-letters/, '死信队列'],
  [/\/workspaces\/[^/]+\/observability\/broadcast-destinations/, '推送目标'],
  [/\/workspaces\/[^/]+\/observability\/platforms/, '可观测平台'],
  [/\/workspaces\/[^/]+\/observability/, '可观测性'],
  [/\/workspaces\//,               '工作区'],
  // Guardrail
  [/\/guardrails\/[^/]+\/budget-policies/, '预算策略'],
  [/\/guardrails\/[^/]+\/assignments/, '护栏分配'],
  [/\/guardrails\//,               '安全护栏'],
  // Logs
  [/\/model-logs\/[^/]+\/payload/, '日志 Payload'],
  [/\/model-logs\/histogram/,      '用量直方图'],
  [/\/model-logs\/stats/,          '调用统计'],
  [/\/model-logs\//,               '调用日志'],
  // Usage
  [/\/usage\/summary/,             '用量总览'],
  [/\/usage\/series/,              '用量趋势'],
  // Catalog
  [/\/catalog\/models\/[^/]+\/providers/, '模型服务商'],
  [/\/catalog\/models\//,          '模型详情'],
  [/\/catalog\/models/,            '模型目录'],
  [/\/catalog\/providers/,         '服务商列表'],
  [/\/catalog\/model-tags/,        '模型标签'],
  [/\/catalog\/pricing/,           '定价方案'],
  // Agent / CS
  [/\/agent\/chat/,                '客服 AI 聊天'],
  [/\/agent\/conversations\/[^/]+\/stop/, '停止对话'],
  [/\/agent\/conversations\//,     '对话记录'],
  // Invitations
  [/\/invitations\/[^/]+\/accept/, '接受邀请'],
  [/\/invitations\//,              '邀请'],
  // Platform / Misc
  [/\/platform-config/,            '平台配置'],
  [/\/organizations/,              '创建组织'],
  [/\/docs\//,                     '文档'],
]

function getModuleLabel(path: string): string {
  for (const [pattern, label] of MODULE_LABEL_MAP) {
    if (pattern.test(path)) return label
  }
  return ''
}

type ApiLogEntry = {
  method: string
  path: string
  url: string
  ok: boolean
  duration_ms: number
  code?: number
  status?: number
  request_id?: string
  error?: string
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function durationMs(startedAt: number) {
  return Math.max(0, Math.round(nowMs() - startedAt))
}

function devLogApiCall(entry: ApiLogEntry) {
  if (!import.meta.env.DEV || typeof navigator === 'undefined') return

  const payload = JSON.stringify({ kind: 'api', ...entry })
  const blob = new Blob([payload], { type: 'application/json' })
  if (navigator.sendBeacon?.('/dev/log', blob)) return

  fetch('/dev/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch(() => {})
}

function searchParams(params?: QueryParams) {
  if (!params) return undefined
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)])
  )
}

export class ModelGoApiError extends Error {
  code: number
  requestId?: string
  data?: ApiError['data']
  path?: string

  constructor(error: ApiError) {
    super(error.msg)
    this.name = 'ModelGoApiError'
    this.code = error.code
    this.requestId = error.request_id
    this.data = error.data
  }
}

async function refreshCsrf() {
  try {
    await ky.get(apiPrefixUrl() + '/auth/session', { credentials: 'include' })
  } catch {
    // 即使失败也不阻塞重放
  }
}

const client = ky.create({
  timeout: 30000,
  retry: { limit: 2, methods: ['get'] },
  credentials: 'include',
  hooks: {
    beforeRequest: [
      ({ request }) => injectHeaders(request),
      ({ request }) => {
        if (!import.meta.env.DEV) return
        const url = new URL(request.url)
        const moduleLabel = getModuleLabel(url.pathname)
        const headers: Record<string, string> = {}
        request.headers.forEach((v, k) => { headers[k] = v })
        console.groupCollapsed(
          `%c ${request.method} %c ${moduleLabel ? `[${moduleLabel}]` : ''} %c${url.pathname}${url.search}`,
          'background:#7c6af7;color:#fff;font-weight:bold;border-radius:3px;padding:1px 4px',
          'color:#f97316;font-weight:700',
          'color:#94a3b8'
        )
        console.log('URL    ', request.url)
        console.log('Headers', headers)
        console.groupEnd()
      },
    ],
    afterResponse: [
      async function handleBusinessError({ request, response }) {
        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) return

        try {
          const body: { code?: number; msg?: string; data?: unknown; request_id?: string } =
            await response.clone().json()

          if (body.code === 40101 && typeof window !== 'undefined') {
            if (request.url.includes('/auth/session')) return
            window.location.href = '/login'
            return
          }

          // 40302 intentionally not handled here — request.body is a consumed
          // ReadableStream at this point, so retrying with it sends an empty body.
          // requestWithJsonBody and upload handle CSRF retry correctly via their
          // send() closures (which capture the original JSON/FormData).
        } catch {
          // JSON 解析失败，放行原始响应
        }
      },
    ],
  },
})

async function unwrap<T>(response: Promise<ApiResponse<T>>): Promise<T> {
  const envelope = await response
  if (envelope.code !== 0) {
    throw new ModelGoApiError({
      code: envelope.code,
      msg: envelope.msg,
      request_id: envelope.request_id,
      data:
        envelope.data && typeof envelope.data === 'object'
          ? (envelope.data as ApiError['data'])
          : null,
    })
  }
  return envelope.data
}

export async function get<T>(path: string, params?: QueryParams): Promise<T> {
  const normalizedPath = normalizePath(path)
  const url = apiUrl(normalizedPath)
  const startedAt = nowMs()
  try {
    const result = await unwrap(
      client.get(url, { searchParams: searchParams(params) }).json<ApiResponse<T>>()
    )
    const ms = durationMs(startedAt)
    devLogApiCall({ method: 'GET', path: normalizedPath, url, ok: true, duration_ms: ms, code: 0 })
    if (import.meta.env.DEV) {
      const label = getModuleLabel(normalizedPath)
      console.log(
        `%c ✓ GET %c ${label ? `[${label}]` : ''} %c${normalizedPath} %c${ms}ms`,
        'color:#22c55e;font-weight:bold',
        'color:#f97316;font-weight:700',
        'color:#94a3b8',
        'color:#cbd5e1'
      )
    }
    return result
  } catch (error) {
    if (error instanceof ModelGoApiError) error.path = normalizedPath
    devLogApiError('GET', normalizedPath, url, startedAt, error)
    throw error
  }
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return requestWithJsonBody('POST', path, (url) =>
    client.post(url, { json: body }).json<ApiResponse<T>>()
  )
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  return requestWithJsonBody('PATCH', path, (url) =>
    client.patch(url, { json: body }).json<ApiResponse<T>>()
  )
}

export async function put<T>(path: string, body: unknown): Promise<T> {
  return requestWithJsonBody('PUT', path, (url) =>
    client.put(url, { json: body }).json<ApiResponse<T>>()
  )
}

export async function del<T>(path: string, body?: unknown): Promise<T> {
  return requestWithJsonBody('DELETE', path, (url) =>
    client.delete(url, body !== undefined ? { json: body } : undefined).json<ApiResponse<T>>()
  )
}

/**
 * multipart/form-data 上传。
 * afterResponse 通用重放对 FormData 失效（body stream 已消费），
 * 持有 formData 引用，遇到 40302 自行刷新 CSRF 后重试。
 */
export async function upload<T>(
  method: 'post' | 'put',
  path: string,
  formData: FormData
): Promise<T> {
  const normalizedPath = normalizePath(path)
  const url = apiUrl(normalizedPath)
  const startedAt = nowMs()
  const send = () => unwrap(client[method](url, { body: formData }).json<ApiResponse<T>>())
  try {
    const result = await send()
    devLogApiCall({
      method: method.toUpperCase(),
      path: normalizedPath,
      url,
      ok: true,
      duration_ms: durationMs(startedAt),
      code: 0,
    })
    return result
  } catch (error) {
    if (error instanceof ModelGoApiError && error.code === 40302) {
      await refreshCsrf()
      return send()
    }
    if (error instanceof ModelGoApiError) error.path = normalizedPath
    devLogApiError(method.toUpperCase(), normalizedPath, url, startedAt, error)
    throw error
  }
}

async function requestWithJsonBody<T>(
  method: string,
  path: string,
  send: (url: string) => Promise<ApiResponse<T>>
) {
  const normalizedPath = normalizePath(path)
  const url = apiUrl(normalizedPath)
  const startedAt = nowMs()
  try {
    const result = await unwrap(send(url))
    const ms = durationMs(startedAt)
    devLogApiCall({ method, path: normalizedPath, url, ok: true, duration_ms: ms, code: 0 })
    if (import.meta.env.DEV) {
      const label = getModuleLabel(normalizedPath)
      console.log(
        `%c ✓ ${method} %c ${label ? `[${label}]` : ''} %c${normalizedPath} %c${ms}ms`,
        'color:#22c55e;font-weight:bold',
        'color:#f97316;font-weight:700',
        'color:#94a3b8',
        'color:#cbd5e1'
      )
    }
    return result
  } catch (error) {
    if (error instanceof ModelGoApiError && error.code === 40302) {
      await refreshCsrf()
      return unwrap(send(url))
    }
    if (error instanceof ModelGoApiError) error.path = normalizedPath
    devLogApiError(method, normalizedPath, url, startedAt, error)
    throw error
  }
}

function devLogApiError(
  method: string,
  path: string,
  url: string,
  startedAt: number,
  error: unknown
) {
  const ms = durationMs(startedAt)
  const entry: ApiLogEntry = { method, path, url, ok: false, duration_ms: ms }

  if (error instanceof ModelGoApiError) {
    entry.code = error.code
    entry.request_id = error.requestId
    entry.error = error.message
  } else if (error instanceof Error) {
    entry.status = getHttpStatus(error)
    entry.error = error.message
  } else {
    entry.error = String(error)
  }

  devLogApiCall(entry)

  if (import.meta.env.DEV) {
    const label = getModuleLabel(path)
    const detail = entry.code ? `code:${entry.code}` : entry.status ? `http:${entry.status}` : ''
    console.warn(
      `%c ✗ ${method} %c ${label ? `[${label}]` : ''} %c${path} %c${detail} ${ms}ms`,
      'color:#ef4444;font-weight:bold',
      'color:#f97316;font-weight:700',
      'color:#94a3b8',
      'color:#ef4444'
    )
  }
}

function getHttpStatus(error: Error) {
  const maybeHttpError = error as Error & { response?: { status?: number } }
  return maybeHttpError.response?.status
}

export default client
