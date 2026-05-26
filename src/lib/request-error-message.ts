import { ModelGoApiError } from '@/lib/request'

export function isApiErrorCode(error: unknown, code: number) {
  return error instanceof ModelGoApiError && error.code === code
}

export function getRequestErrorMessage(error: unknown, fallback = '请求失败，请稍后重试') {
  if (error instanceof ModelGoApiError) {
    const msg = error.message || fallback
    if (import.meta.env.DEV && error.path) {
      return `[${error.path}] ${msg}`
    }
    return msg
  }

  if (error instanceof Error) {
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
