import ky, { type ResponsePromise } from 'ky'
import i18n from 'i18next'
import type { ApiError, ApiResponse, CursorPage, QueryParams } from '@/types'
import { injectHeaders } from '@/lib/request-headers'
import { useLangStore } from '@/store/use-brand-store'
import { handleSessionExpired } from '@/lib/auth/auth-controller'
import { setCsrfToken } from '@/lib/auth/csrf-token'
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

function apiUrl(path: string, prefix: string = API_V1_PREFIX) {
  return `${apiBaseUrl()}/${prefix}/${path.replace(/^\/+/, '')}`
}

/**
 * Absolute URL for a /api/v1 endpoint. Exposed for streaming callers: ky's
 * response handling buffers the whole body, so an SSE consumer must fetch the
 * stream itself (see services/support.ts askSupportStream).
 */
export function apiV1Url(path: string): string {
  return apiUrl(normalizePath(path))
}

function apiPrefixUrl() {
  const base = apiBaseUrl()
  return base ? `${base}/${API_V1_PREFIX}` : `/${API_V1_PREFIX}`
}

function normalizePath(path: string) {
  return path.replace(/^\/+/, '')
}

function diagnosticApiPath(method: string, path: string, prefix: string = API_V1_PREFIX) {
  return `${method.toUpperCase()} /${prefix}/${normalizePath(path)}`
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
export const SENSITIVE_KEY_RE = /authorization|cookie|csrf|token|secret|password|api[_-]?key|access[_-]?key|^key$|^totp$|captcha[_-]?verify[_-]?param/i

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
        (SENSITIVE_KEY_RE.test(key) || key === 'code') ? '[REDACTED]' : item instanceof File ? `[File name=${item.name} size=${item.size} type=${item.type || 'unknown'}]` : redactDevValue(item, depth + 1),
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
      (SENSITIVE_KEY_RE.test(key) || (key === 'code' && typeof item === 'string')) ? '[REDACTED]' : redactDevValue(item, depth + 1),
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

/**
 * Re-issue the CSRF token from GET /auth/session. Exported for the SSE path
 * (services/support.ts), which cannot use the ky client and must retry 40302
 * itself. See the #676 note below.
 */
export async function refreshCsrf() {
  try {
    const resp = await ky.get(apiPrefixUrl() + '/auth/session', { credentials: 'include' })
    // 必须接住响应体里的 csrf_token（需求方#676）：光重拉不取值，重放发的还是同一个
    // 被影子 cookie 遮蔽的旧值，只会再吃一个 40302。
    // 刻意不落 store —— 这里是裸调用、没带 workspace_id，落进去会把权限面换成
    // 默认空间的（需求方#255 那个坑）。只取 token。
    const envelope = await resp.json<ApiResponse<{ csrf_token?: string }>>()
    setCsrfToken(envelope?.data?.csrf_token)
  } catch {
    // 即使失败也不阻塞重放
  }
}

let sessionValidityCheck: Promise<boolean> | null = null

/**
 * A feature endpoint can also return 40101 for its own authorization/validation
 * failure. Only clear the app-wide auth state when the shared session endpoint
 * independently confirms that the user's session has expired.
 */
export function isSharedSessionExpired(): Promise<boolean> {
  if (!sessionValidityCheck) {
    sessionValidityCheck = ky
      .get(apiPrefixUrl() + '/auth/session', { credentials: 'include', timeout: 5000, retry: 0 })
      .json<ApiResponse<unknown>>()
      .then((body) => body.code === 40101)
      .catch(() => false)
      .finally(() => {
        sessionValidityCheck = null
      })
  }
  return sessionValidityCheck
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
            // The shared session endpoint reports the initial unauthenticated
            // state itself, so it must not recursively trigger this check.
            if (request.url.includes('/auth/session')) return
            if (window.location.pathname === '/login') return
            // A feature-level 40101 must stay local. Confirm the shared session
            // before clearing auth, so a support-service validation failure
            // cannot send the whole console back to login.
            if (await isSharedSessionExpired()) handleSessionExpired()
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
      // observer（模型发现六接口）的错误信封用 `message`，web-api 用 `msg`。
      // 少了这个兜底，observer 的 4001/4040 会弹出空白提示。
      msg: envelope.msg ?? (envelope as { message?: string }).message ?? '',
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

/**
 * 游标分页 GET —— 分页接口的唯一出口。
 *
 * 后端对分页响应有三种形态：正常的 `{items, page_size, has_more, next_cursor}`、
 * 空列表时的 `items: null`、以及个别接口直接回裸数组。形态差异**只在这里抹平一次**，
 * 页面拿到的 `items` 恒为数组，因此调用方不需要（也不应该）再各自兜底。
 *
 * 反面教训 shared/modelgo_prd#635：形态判断散在每个消费点（`?.items.find(...)` /
 * `pageItems(...)`），补一处漏一处——修完同步日志详情浮层，同页异步任务浮层照样崩。
 */
export async function getPage<P extends CursorPage<unknown>>(path: string, params?: QueryParams): Promise<P> {
  return normalizePage<P>(await get<P | P['items']>(path, params))
}

/** getPage 的归一逻辑，独立导出以便单测锁住契约（见 request-page.test.ts）。 */
export function normalizePage<P extends CursorPage<unknown>>(raw: P | P['items'] | null | undefined): P {
  if (Array.isArray(raw)) {
    return { items: raw, page_size: raw.length, has_more: false, next_cursor: null } as P
  }
  // 保留响应上的额外字段（如 members 接口的 pending_invitations），只归一分页四件套
  return {
    ...raw,
    items: Array.isArray(raw?.items) ? raw.items : [],
    page_size: raw?.page_size ?? 0,
    has_more: raw?.has_more ?? false,
    next_cursor: raw?.next_cursor ?? null,
  } as P
}

export async function get<T>(
  path: string,
  params?: QueryParams,
  options?: { prefix?: string },
): Promise<T> {
  const prefix = options?.prefix ?? API_V1_PREFIX
  const normalizedPath = normalizePath(path)
  const url = apiUrl(normalizedPath, prefix)
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
    if (error instanceof ModelGoApiError) error.path = diagnosticApiPath('GET', normalizedPath, prefix)
    devLogApiError('GET', normalizedPath, url, startedAt, error, params)
    throw error
  }
}

export async function post<T>(
  path: string,
  body: unknown,
  opts?: { timeout?: number | false }
): Promise<T> {
  if (SECURE_PATHS.has(normalizePath(path))) {
    return postSecure<T>(path, body)
  }
  return requestWithJsonBody('POST', path, body, (url) =>
    // timeout 只在显式传入时才覆盖——不传就不带这个 key，保留 client 默认 30s，
    // 避免 { timeout: undefined } 被 ky 当成"显式设置"把默认值顶掉。
    client.post(url, { json: body, ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}) })
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
