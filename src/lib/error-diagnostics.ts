/**
 * 服务端错误诊断信息。
 *
 * 线上 5xx 不再弹诊断弹窗给用户看——request_id / trace_id 这些排查用标识改成
 * 静默走埋点 SDK 上报，用户侧完全无感知，排障还是能从上报事件里拿到同一份信息。
 *
 * 来源：src/lib/request.ts 抛出的 ModelGoApiError 与 ky HTTPError。
 */
import { ModelGoApiError, isServerErrorCode } from '@/lib/request'
import { useAuthStore } from '@/store/auth'
import { trackEvent } from '@/lib/track'

export interface ServerErrorDiagnostics {
  requestId?: string
  traceId?: string
  /** 后端业务码（5xxxx） */
  code?: number
  /** HTTP 传输层状态码（500~599） */
  status?: number
  /** 出错接口路径 */
  path?: string
  /** 出错时所在页面 */
  page?: string
  /** 当前租户 ID（tenant_id） */
  tenantId?: string
  /** 前端版本（package.json version） */
  version: string
  /** 构建标识（git hash），用于精确定位线上部署版本 */
  build?: string
  /** 本地时间，YYYY-MM-DD HH:mm:ss */
  time: string
}

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown'
}

function buildHash(): string | undefined {
  return typeof __BUILD_COMMIT__ === 'string' && __BUILD_COMMIT__ ? __BUILD_COMMIT__ : undefined
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function nowText(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function currentPage(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return `${window.location.pathname}${window.location.search}`
}

/**
 * 从完整 URL 抽出接口路径（如 /api/v1/account/avatar）。
 * 网关级 5xx（503 等）走不到后端信封、无 request_id，但 Response.url 一定有——
 * 用它兜底出「接口路径」，否则上报事件里连出错的是哪个接口都看不到。
 */
function pathFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url, window.location.origin).pathname
  } catch {
    return url
  }
}

function envBase(): Pick<ServerErrorDiagnostics, 'page' | 'tenantId' | 'version' | 'build' | 'time'> {
  return {
    page: currentPage(),
    tenantId: useAuthStore.getState().activeTenantId ?? undefined,
    version: appVersion(),
    build: buildHash(),
    time: nowText(),
  }
}

/**
 * 仅「服务端级错误」（5xxxx 业务码 / HTTP 5xx）返回诊断信息；
 * 普通业务错误（如校验失败、未授权）返回 null —— 那类错误文案本身可读，无需诊断包。
 */
export function getServerErrorDiagnostics(error: unknown): ServerErrorDiagnostics | null {
  if (error instanceof ModelGoApiError) {
    if (!isServerErrorCode(error.code)) return null
    return {
      requestId: error.requestId,
      traceId: error.traceId,
      code: error.code,
      path: error.path,
      ...envBase(),
    }
  }

  if (error instanceof Error) {
    const resp = (error as Error & { response?: Response }).response
    const status = resp?.status
    if (typeof status === 'number' && status >= 500 && status < 600) {
      return {
        status,
        requestId: resp?.headers?.get('x-request-id') ?? undefined,
        traceId: resp?.headers?.get('x-trace-id') ?? resp?.headers?.get('traceparent') ?? undefined,
        path: pathFromUrl(resp?.url),
        ...envBase(),
      }
    }
  }

  return null
}

/** 诊断信息里的标量字段投给埋点 SDK（data 只接受 string/number/boolean，undefined 字段整个丢掉） */
function diagnosticsToTrackData(d: ServerErrorDiagnostics): Record<string, string | number | boolean> {
  const data: Record<string, string | number | boolean> = {
    version: d.version,
    time: d.time,
  }
  if (d.requestId) data.request_id = d.requestId
  if (d.traceId) data.trace_id = d.traceId
  if (typeof d.code === 'number') data.code = d.code
  if (typeof d.status === 'number') data.status = d.status
  if (d.path) data.path = d.path
  if (d.page) data.page = d.page
  if (d.tenantId) data.tenant_id = d.tenantId
  if (d.build) data.build = d.build
  return data
}

/**
 * 全局上报：任何服务端级错误（5xxxx 业务码 / HTTP 5xx）静默上报埋点，用户侧无感知。
 * 由 request.ts 的拦截器统一调用，使诊断不依赖各处 onError 是否调用 requestError。
 * 非服务端错误返回 null → 不上报。
 */
export function reportServerError(error: unknown): void {
  const diagnostics = getServerErrorDiagnostics(error)
  if (!diagnostics) return
  trackEvent('server_error:5xx', diagnosticsToTrackData(diagnostics), {
    result: 'fail',
    error_code: String(diagnostics.code ?? diagnostics.status ?? ''),
  })
}

/**
 * 直接从 HTTP 响应上报：网关级 HTTP 5xx（可能不是 JSON 信封，无法走 ModelGoApiError 路径）。
 * 由 request.ts 的 afterResponse 拦截器统一调用。非 5xx 直接忽略。
 */
export function reportHttpServerError(response: Response): void {
  if (response.status < 500 || response.status >= 600) return
  const diagnostics: ServerErrorDiagnostics = {
    status: response.status,
    requestId: response.headers.get('x-request-id') ?? undefined,
    traceId: response.headers.get('x-trace-id') ?? response.headers.get('traceparent') ?? undefined,
    path: pathFromUrl(response.url),
    ...envBase(),
  }
  trackEvent('server_error:5xx', diagnosticsToTrackData(diagnostics), {
    result: 'fail',
    error_code: String(response.status),
  })
}
