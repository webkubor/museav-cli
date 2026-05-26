import ky from 'ky'
import type { ApiError, ApiResponse, QueryParams } from '@/types'
import { injectHeaders } from '@/lib/request-headers'
import { getMarket } from '@/lib/market'
import { isMswEnabled } from '@/lib/msw-runtime'
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
  if (isMswEnabled()) return ''

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
        const headers: Record<string, string> = {}
        request.headers.forEach((v, k) => {
          headers[k] = v
        })
        console.groupCollapsed(
          `%c${request.method}%c ${url.pathname}${url.search}`,
          'color:#7c6af7;font-weight:bold',
          'color:inherit'
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
  if (import.meta.env.DEV) {
    console.log('[API GET]', url, params ?? '')
  }
  try {
    const result = await unwrap(
      client.get(url, { searchParams: searchParams(params) }).json<ApiResponse<T>>()
    )
    devLogApiCall({
      method: 'GET',
      path: normalizedPath,
      url,
      ok: true,
      duration_ms: durationMs(startedAt),
      code: 0,
    })
    if (import.meta.env.DEV) {
      console.log('[API RES]', url, result)
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
    devLogApiCall({
      method,
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
  const entry: ApiLogEntry = {
    method,
    path,
    url,
    ok: false,
    duration_ms: durationMs(startedAt),
  }

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
}

function getHttpStatus(error: Error) {
  const maybeHttpError = error as Error & { response?: { status?: number } }
  return maybeHttpError.response?.status
}

export default client
