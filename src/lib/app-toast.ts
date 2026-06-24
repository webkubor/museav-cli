import { toast } from '@/lib/toast'
import { ModelGoApiError } from '@/lib/request'
import { getRequestErrorMessage } from '@/lib/request-error-message'
import { getServerErrorDiagnostics } from '@/lib/error-diagnostics'
import { useServerErrorStore } from '@/store/use-server-error-store'

export const appToast = {
  success(message: string, description?: string) {
    return toast.success(message, description)
  },

  error(message: string, description?: string) {
    return toast.error(message, description)
  },

  warning(message: string, description?: string) {
    return toast.warning(message, description)
  },

  info(message: string, description?: string) {
    return toast.info(message, description)
  },

  requestError(error: unknown, fallback?: string) {
    // 服务端级错误（5xx）：弹诊断弹窗，露出 request_id / trace_id / 版本供报障定位。
    const diagnostics = getServerErrorDiagnostics(error)
    if (diagnostics) {
      useServerErrorStore.getState().show(diagnostics)
      return
    }

    // 普通业务错误：文案本身可读，保留 request_id 便于追踪。
    const message = getRequestErrorMessage(error, fallback)
    const requestId = error instanceof ModelGoApiError ? error.requestId : undefined
    return toast.error(message, requestId ? `请求 ID：${requestId}` : undefined)
  },
}
