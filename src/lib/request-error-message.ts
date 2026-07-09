/**
 * 请求错误展示文案：把技术错误归一成可给用户看的提示。
 * 路由：全站请求错误 toast / 表单错误提示
 * API 来源：src/lib/request.ts 抛出的 ModelGoApiError 与 ky 网络错误
 */
import { ModelGoApiError, SERVER_ERROR_MESSAGE, isServerErrorCode } from '@/lib/request'

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
    const msg = error.message || fallback
    if (import.meta.env.DEV && error.path) {
      return `[${error.path}] ${msg}`
    }
    return msg
  }

  if (error instanceof Error) {
    if (isHttpServerError(error)) return SERVER_ERROR_MESSAGE
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
