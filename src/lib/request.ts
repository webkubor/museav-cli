import ky, { type ResponsePromise } from 'ky'
import i18n from 'i18next'
import type { ApiError, ApiResponse, QueryParams } from '@/types'
import { injectHeaders } from '@/lib/request-headers'
import { useLangStore } from '@/store/use-brand-store'
import { handleSessionExpired } from '@/lib/auth/auth-controller'
import { encryptRequest, decryptResponse } from '@/lib/crypto/secure-transport'
import { reportServerError, reportHttpServerError } from '@/lib/error-diagnostics'

const API_V1_PREFIX = 'api/v1'

// #267 注册登录密码不能传明文: these password-bearing endpoints send an encrypted
// RSA+AES envelope instead of a plaintext JSON body, and receive an encrypted
// {iv,data} response. Normalized (no leading slash) to match normalizePath.
const SECURE_PATHS = new Set(['auth/login', 'auth/register', 'auth/password/reset'])
export const SERVER_ERROR_MESSAGE_KEY = 'common.errors.server'

export function getServerErrorMessage() {
  return i18n.t(SERVER_ERROR_MESSAGE_KEY, { ns: 'common' })
}

export const SERVER_ERROR_MESSAGE = getServerErrorMessage()

function normalizeApiHost(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function apiBaseUrl() {
  // API 域名走 platform-config 驱动的 store（市场真源）。store 初值=域名探测(bootstrap 兜底,
  // 化解 platform-config 自身请求的鸡生蛋)，配置到达后覆盖——test 单域名可切两端验收（#466）。
  const market = useLangStore.getState().market
  const marketDomain =
    market === 'china'
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

function diagnosticApiPath(method: string, path: string) {
  return `${method.toUpperCase()} /${API_V1_PREFIX}/${normalizePath(path)}`
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
  trace_id?: string
  error?: string
  page_path?: string
  request?: unknown
  response?: unknown
}

// ^key$：api-key reveal 响应的 { key: "mgk_..." } 明文字段（#298），不得进 dev 日志。
const SENSITIVE_KEY_RE = /authorization|cookie|csrf|token|secret|password|api[_-]?key|access[_-]?key|^key$/i

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function durationMs(startedAt: number) {
  return Math.max(0, Math.round(nowMs() - startedAt))
}

function currentPagePath() {
  if (typeof window === 'undefined') return undefined
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function redactDevValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MaxDepth]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > 1000 ? `${value.slice(0, 1000)}...[truncated ${value.length - 1000} chars]` : value
  }
  if (typeof value !== 'object') return value
  if (value instanceof FormData) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, item]) => [
        key,
        item instanceof File ? `[File name=${item.name} size=${item.size} type=${item.type || 'unknown'}]` : redactDevValue(item, depth + 1),
      ])
    )
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactDevValue(item, depth + 1))
  }

  const source = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(source).slice(0, 80).map(([key, item]) => [
      key,
      SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : redactDevValue(item, depth + 1),
    ])
  )
}

function devLogApiCall(entry: ApiLogEntry) {
  if (!import.meta.env.DEV || typeof navigator === 'undefined') return

  const payload = JSON.stringify({
    kind: 'api',
    ...entry,
    page_path: entry.page_path ?? currentPagePath(),
    request: redactDevValue(entry.request),
    response: redactDevValue(entry.response),
  })
  const blob = new Blob([payload], { type: 'application/json' })
  if (navigator.sendBeacon?.('/dev/log', blob)) return

  fetch('/dev/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch(() => {})
}

/**
 * 序列化查询参数。
 *
 * 数组值发成**重复参数**（`?a=1&a=2`）而不是逗号串 —— 后端用 gin 的
 * `c.QueryArray` 读取（如模型广场的 capability_tag），逗号串会被当成单个值。
 * 因此这里返回 URLSearchParams 而不是普通对象；对标量值两者生成的 query string
 * 完全一致，其余接口行为不变。空值过滤语义保持原样。
 */
function searchParams(params?: QueryParams) {
  if (!params) return undefined
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === '') continue
        usp.append(key, String(item))
      }
      continue
    }
    usp.append(key, String(value))
  }
  return usp
}

export class ModelGoApiError extends Error {
  code: number
  rawMessage: string
  requestId?: string
  traceId?: string
  data?: ApiError['data']
  path?: string

  constructor(error: ApiError) {
    const rawMessage = error.msg
    super(isServerErrorCode(error.code) ? getServerErrorMessage() : rawMessage)
    this.name = 'ModelGoApiError'
    this.code = error.code
    this.rawMessage = rawMessage
    this.requestId = error.request_id
    this.traceId = error.trace_id
    this.data = error.data
  }
}

export function isServerErrorCode(code: number) {
  return code >= 50000 && code < 60000
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
    ],
    afterResponse: [
      async function handleBusinessError({ request, response }) {
        // 全局：HTTP 5xx（网关 503 等，可能非 JSON 信封）在拦截器统一弹服务端错误诊断，
        // 不依赖各处 onError 是否调用 requestError。非 5xx 内部忽略。
        reportHttpServerError(response)

        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.includes('application/json')) return

        try {
          const body: { code?: number; msg?: string; data?: unknown; request_id?: string } =
            await response.clone().json()

          if (body.code === 40101 && typeof window !== 'undefined') {
            // 未登录：清掉内存鉴权态，交给 ProtectedRoute 做 SPA 跳转。
            // 绝不能用 window.location.href（硬刷新会重置 SessionLoader 的
            // isFetchingSession 与 isLoading，配合 /login 守卫形成
            // /login <-> /dashboard 全页无限刷新）。
            if (request.url.includes('/auth/session')) return
            if (window.location.pathname === '/login') return
            // 会话过期不静默跳登录：先给用户明确提示，再清鉴权态触发 SPA 跳转。
            // toast 自带「相同内容 4s 去重」，多个并发请求同时 401 也只提示一次。
            handleSessionExpired()
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

function unwrapEnvelope<T>(envelope: ApiResponse<T>, fallbackTraceId?: string): T {
  if (envelope.code !== 0) {
    const error = new ModelGoApiError({
      code: envelope.code,
      msg: envelope.msg,
      request_id: envelope.request_id,
      // 信封暂无 trace_id 时用响应头 x-trace-id/traceparent 兜底，让诊断弹窗能显示 Trace ID；
      // 后端信封补上 trace_id 后此兜底自然让位（envelope.trace_id 优先）。
      trace_id: envelope.trace_id ?? fallbackTraceId,
      data:
        envelope.data && typeof envelope.data === 'object'
          ? (envelope.data as ApiError['data'])
          : null,
    })
    // 全局：5xxxx 业务码（HTTP 200 但服务端级错误）在此统一弹诊断，不依赖调用方 onError。
    reportServerError(error)
    throw error
  }
  return envelope.data
}

export async function get<T>(path: string, params?: QueryParams): Promise<T> {
  const normalizedPath = normalizePath(path)
  const url = apiUrl(normalizedPath)
  const startedAt = nowMs()
  try {
    const httpResp = await client.get(url, { searchParams: searchParams(params) })
    const traceId = httpResp.headers.get('x-request-id') ?? httpResp.headers.get('x-trace-id') ?? httpResp.headers.get('traceparent') ?? undefined
    const envelope = await httpResp.json<ApiResponse<T>>()
    const result = unwrapEnvelope(
      envelope,
      httpResp.headers.get('x-trace-id') ?? httpResp.headers.get('traceparent') ?? undefined,
    )
    const rawForLog: Record<string, unknown> = { code: 0, data: result }
    devLogApiCall({
      method: 'GET',
      path: normalizedPath,
      url,
      ok: true,
      duration_ms: durationMs(startedAt),
      code: 0,
      request_id: traceId ?? envelope.request_id,
      trace_id: envelope.trace_id,
      request: params,
      response: traceId ? { __trace_id: traceId, ...rawForLog } : rawForLog,
    })
    return result
  } catch (error) {
    if (error instanceof ModelGoApiError) error.path = diagnosticApiPath('GET', normalizedPath)
    devLogApiError('GET', normalizedPath, url, startedAt, error, params)
    throw error
  }
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  if (SECURE_PATHS.has(normalizePath(path))) {
    return postSecure<T>(path, body)
  }
  return requestWithJsonBody('POST', path, body, (url) =>
    client.post(url, { json: body })
  )
}

// cachedPublicKey holds the server RSA public key (PEM) fetched once from
// /auth/crypto/public-key and reused for the session.
let cachedPublicKey: string | null = null

async function loadPublicKey(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey
  const resp = await client
    .get(apiUrl('auth/crypto/public-key'))
    .json<ApiResponse<{ public_key: string; alg?: string }>>()
  if (resp.code !== 0 || !resp.data?.public_key) {
    throw new ModelGoApiError({
      code: resp.code ?? -1,
      msg: i18n.t('common.errors.publicKeyUnavailable', { ns: 'common' }),
      request_id: resp.request_id,
      trace_id: resp.trace_id,
      data: null,
    })
  }
  cachedPublicKey = resp.data.public_key
  return cachedPublicKey
}

// postSecure encrypts the request body into an RSA+AES envelope and decrypts the
// {iv,data} response under the same AES key. The plaintext body (it carries the
// password) is NEVER passed to the dev logger.
async function postSecure<T>(path: string, body: unknown): Promise<T> {
  const normalizedPath = normalizePath(path)
  const url = apiUrl(normalizedPath)
  const startedAt = nowMs()
  try {
    const publicKey = await loadPublicKey()
    const { envelope, aesKeyB64 } = encryptRequest(body, publicKey)
    const httpResp = await client.post(url, { json: envelope })
    const traceId =
      httpResp.headers.get('x-request-id') ??
      httpResp.headers.get('x-trace-id') ??
      httpResp.headers.get('traceparent') ??
      undefined
    const raw = await httpResp.json<Record<string, unknown>>()
    // Encrypted response is {iv,data}; a middleware-stage rejection is a plaintext
    // {code,msg} envelope — branch on iv/data presence, not status.
    const envelopeResp: ApiResponse<T> =
      typeof raw.iv === 'string' && typeof raw.data === 'string'
        ? decryptResponse<ApiResponse<T>>(raw.data as string, aesKeyB64, raw.iv as string)
        : (raw as unknown as ApiResponse<T>)
    const result = unwrapEnvelope(
      envelopeResp,
      httpResp.headers.get('x-trace-id') ?? httpResp.headers.get('traceparent') ?? undefined,
    )
    devLogApiCall({
      method: 'POST',
      path: normalizedPath,
      url,
      ok: true,
      duration_ms: durationMs(startedAt),
      code: 0,
      request_id: traceId ?? envelopeResp.request_id,
      trace_id: envelopeResp.trace_id,
      request: '[encrypted]',
      response: '[encrypted]',
    })
    return result
  } catch (error) {
    if (error instanceof ModelGoApiError) error.path = diagnosticApiPath('POST', normalizedPath)
    devLogApiError('POST', normalizedPath, url, startedAt, error, '[encrypted]')
    throw error
  }
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  return requestWithJsonBody('PATCH', path, body, (url) =>
    client.patch(url, { json: body })
  )
}

export async function put<T>(path: string, body: unknown): Promise<T> {
  return requestWithJsonBody('PUT', path, body, (url) =>
    client.put(url, { json: body })
  )
}

export async function del<T>(path: string, body?: unknown): Promise<T> {
  return requestWithJsonBody('DELETE', path, body, (url) =>
    client.delete(url, body !== undefined ? { json: body } : undefined)
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
  const sendRaw = () => client[method](url, { body: formData })
  try {
    const httpResp = await sendRaw()
    const traceId = httpResp.headers.get('x-request-id') ?? httpResp.headers.get('x-trace-id') ?? httpResp.headers.get('traceparent') ?? undefined
    const envelope = await httpResp.json<ApiResponse<T>>()
    const result = unwrapEnvelope(
      envelope,
      httpResp.headers.get('x-trace-id') ?? httpResp.headers.get('traceparent') ?? undefined,
    )
    const rawForLog: Record<string, unknown> = { code: 0, data: result }
    devLogApiCall({
      method: method.toUpperCase(),
      path: normalizedPath,
      url,
      ok: true,
      duration_ms: durationMs(startedAt),
      code: 0,
      request_id: traceId ?? envelope.request_id,
      trace_id: envelope.trace_id,
      request: formData,
      response: traceId ? { __trace_id: traceId, ...rawForLog } : rawForLog,
    })
    return result
  } catch (error) {
    if (error instanceof ModelGoApiError && error.code === 40302) {
      await refreshCsrf()
      return unwrapEnvelope(await (await sendRaw()).json<ApiResponse<T>>())
    }
    if (error instanceof ModelGoApiError) error.path = diagnosticApiPath(method.toUpperCase(), normalizedPath)
    devLogApiError(method.toUpperCase(), normalizedPath, url, startedAt, error, formData)
    throw error
  }
}

async function requestWithJsonBody<T>(
  method: string,
  path: string,
  body: unknown,
  send: (url: string) => ResponsePromise
) {
  const normalizedPath = normalizePath(path)
  const url = apiUrl(normalizedPath)
  const startedAt = nowMs()
  try {
    const httpResp = await send(url)
    const traceId = httpResp.headers.get('x-request-id') ?? httpResp.headers.get('x-trace-id') ?? httpResp.headers.get('traceparent') ?? undefined
    const envelope = await httpResp.json<ApiResponse<T>>()
    const result = unwrapEnvelope(
      envelope,
      httpResp.headers.get('x-trace-id') ?? httpResp.headers.get('traceparent') ?? undefined,
    )
    const rawForLog: Record<string, unknown> = { code: 0, data: result }
    devLogApiCall({
      method,
      path: normalizedPath,
      url,
      ok: true,
      duration_ms: durationMs(startedAt),
      code: 0,
      request_id: traceId ?? envelope.request_id,
      trace_id: envelope.trace_id,
      request: body,
      response: traceId ? { __trace_id: traceId, ...rawForLog } : rawForLog,
    })
    return result
  } catch (error) {
    if (error instanceof ModelGoApiError && error.code === 40302) {
      await refreshCsrf()
      return unwrapEnvelope(await (await send(url)).json<ApiResponse<T>>())
    }
    if (error instanceof ModelGoApiError) error.path = diagnosticApiPath(method, normalizedPath)
    devLogApiError(method, normalizedPath, url, startedAt, error, body)
    throw error
  }
}

function devLogApiError(method: string, path: string, url: string, startedAt: number, error: unknown, request?: unknown) {
  const ms = durationMs(startedAt)
  const entry: ApiLogEntry = { method, path, url, ok: false, duration_ms: ms, request }

  if (error instanceof ModelGoApiError) {
    entry.code = error.code
    entry.request_id = error.requestId
    entry.trace_id = error.traceId
    entry.error = error.rawMessage
    entry.response = { code: error.code, msg: error.rawMessage, data: error.data ?? null, request_id: error.requestId, trace_id: error.traceId }
  } else if (error instanceof Error) {
    entry.status = getHttpStatus(error)
    entry.error = error.message
    entry.response = { status: entry.status, msg: error.message }
  } else {
    entry.error = String(error)
    entry.response = { msg: String(error) }
  }

  devLogApiCall(entry)
}

function getHttpStatus(error: Error) {
  const maybeHttpError = error as Error & { response?: { status?: number } }
  return maybeHttpError.response?.status
}

export default client
