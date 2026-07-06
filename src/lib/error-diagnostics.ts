/**
 * 服务端错误诊断信息。
 *
 * 线上 5xx 对用户隐藏原始报错（panic 堆栈等），但 request_id / trace_id 是我们
 * 排查问题的唯一抓手。这里把可定位标识 + 前端版本归集成一份「可复制」的信息块，
 * 用户报障时一键复制给客服即可精准定位。
 *
 * 来源：src/lib/request.ts 抛出的 ModelGoApiError 与 ky HTTPError。
 */
import { ModelGoApiError, isServerErrorCode } from '@/lib/request'
import { useAuthStore } from '@/store/auth'
import { useServerErrorStore } from '@/store/use-server-error-store'

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
 * 用它兜底出「接口路径」，否则弹窗里连出错的是哪个接口都看不到。
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

/**
 * 全局上报：任何服务端级错误（5xxxx 业务码 / HTTP 5xx）自动弹出诊断弹窗。
 * 由 request.ts 的拦截器统一调用，使诊断不依赖各处 onError 是否调用 requestError。
 * 非服务端错误返回 null → 不弹窗。多次调用幂等（重复 show 同一份诊断无副作用）。
 */
export function reportServerError(error: unknown): void {
  const diagnostics = getServerErrorDiagnostics(error)
  if (diagnostics) useServerErrorStore.getState().show(diagnostics)
}

/**
 * 直接从 HTTP 响应上报：网关级 HTTP 5xx（可能不是 JSON 信封，无法走 ModelGoApiError 路径）。
 * 由 request.ts 的 afterResponse 拦截器统一调用。非 5xx 直接忽略。
 */
export function reportHttpServerError(response: Response): void {
  if (response.status < 500 || response.status >= 600) return
  useServerErrorStore.getState().show({
    status: response.status,
    requestId: response.headers.get('x-request-id') ?? undefined,
    traceId: response.headers.get('x-trace-id') ?? response.headers.get('traceparent') ?? undefined,
    path: pathFromUrl(response.url),
    ...envBase(),
  })
}

/** 复制到剪贴板的完整信息块。 */
export function formatDiagnosticsForCopy(d: ServerErrorDiagnostics): string {
  return [
    'ModelGo 控制台错误信息',
    d.requestId && `请求 ID：${d.requestId}`,
    d.traceId && `Trace ID：${d.traceId}`,
    typeof d.code === 'number' && `错误码：${d.code}`,
    typeof d.status === 'number' && `HTTP 状态：${d.status}`,
    d.path && `接口：${d.path}`,
    d.page && `页面：${d.page}`,
    d.tenantId && `租户 ID：${d.tenantId}`,
    `版本：v${d.version}${d.build ? ` (${d.build})` : ''}`,
    `时间：${d.time}`,
  ]
    .filter(Boolean)
    .join('\n')
}
