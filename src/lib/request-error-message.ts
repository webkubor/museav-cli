/**
 * 请求错误展示文案：把技术错误归一成可给用户看的提示。
 * 路由：全站请求错误 toast / 表单错误提示
 * API 来源：src/lib/request.ts 抛出的 ModelGoApiError 与 ky 网络错误
 */
import { ModelGoApiError, SERVER_ERROR_MESSAGE, isServerErrorCode } from '@/lib/request'

/** 功能未就绪/接口未注册（业务码 40401 或 HTTP 404）的统一文案——不留死按钮，明确告知服务不可用 */
export const SERVICE_UNAVAILABLE_MESSAGE = '服务暂不可用，请稍后再试'

/** 是否为「资源/路由不存在」类错误：业务码 40401 或 HTTP 404 */
export function isNotFoundError(error: unknown) {
  if (error instanceof ModelGoApiError) return error.code === 40401
  const status = (error as Error & { response?: { status?: number } })?.response?.status
  return status === 404
}

export function isApiErrorCode(error: unknown, code: number) {
  return error instanceof ModelGoApiError && error.code === code
}

/** 埋点 error_code 顶层字段取值：业务码用字符串化的 error.code，非 API 错误归一为 unknown */
export function errorCodeOf(error: unknown): string {
  return error instanceof ModelGoApiError ? String(error.code) : 'unknown'
}

export function getRequestErrorMessage(error: unknown, fallback = '请求失败，请稍后重试') {
  if (error instanceof ModelGoApiError) {
    if (isServerErrorCode(error.code)) return SERVER_ERROR_MESSAGE
    // 40401 = 资源/路由不存在（含后端功能未就绪）：裸文案「resource not found」不可读，归一为「服务暂不可用」
    if (error.code === 40401) return SERVICE_UNAVAILABLE_MESSAGE
    // 参数校验失败等：后端在 data.field_errors 给了字段级具体原因，优先展示，
    // 别让「参数校验失败」这种笼统 msg 盖住真正的原因（如「Key 护栏必须绑定至少一个对象」）。
    const fieldErrors = (error.data as { field_errors?: { field?: string; message?: string }[] } | null | undefined)?.field_errors
    if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
      const detail = fieldErrors.map((f) => f?.message).filter((m): m is string => !!m).join('；')
      if (detail) return import.meta.env.DEV && error.path ? `[${error.path}] ${detail}` : detail
    }
    const msg = error.message || fallback
    if (import.meta.env.DEV && error.path) {
      return `[${error.path}] ${msg}`
    }
    return msg
  }

  if (error instanceof Error) {
    if (isHttpServerError(error)) return SERVER_ERROR_MESSAGE
    if (isHttpNotFound(error)) return SERVICE_UNAVAILABLE_MESSAGE
    if (error.name === 'TimeoutError') return '请求超时，请检查网络后重试'
    if (isNetworkError(error)) return '网络连接异常，请检查网络后重试'
  }

  return fallback
}

function isNetworkError(error: Error) {
  return (
    error.name === 'TypeError' ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('NetworkError')
  )
}

function isHttpServerError(error: Error) {
  const maybeHttpError = error as Error & { response?: { status?: number } }
  const status = maybeHttpError.response?.status
  return typeof status === 'number' && status >= 500 && status < 600
}

function isHttpNotFound(error: Error) {
  const maybeHttpError = error as Error & { response?: { status?: number } }
  return maybeHttpError.response?.status === 404
}
