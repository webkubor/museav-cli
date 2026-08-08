import { toast } from '@/lib/toast'
import { ModelGoApiError } from '@/lib/request'
import { getRequestErrorMessage } from '@/lib/request-error-message'

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
    // 服务端级错误（5xx）：不再弹诊断弹窗——request.ts 的拦截器已经把 request_id/trace_id
    // 等排查信息静默上报到埋点（见 error-diagnostics.ts），这里只给用户看
    // getRequestErrorMessage 已经处理好的友好文案（5xx → 统一的「服务暂时异常」）。
    // 普通业务错误：只给用户看 data.field_errors 里的具体失败信息。
    // 请求 ID 是排查用技术信息，不面向终端用户——仅 DEV 附上便于本地定位。
    const message = getRequestErrorMessage(error, fallback)
    const requestId = error instanceof ModelGoApiError ? error.requestId : undefined
    return toast.error(message, import.meta.env.DEV && requestId ? `请求 ID：${requestId}` : undefined)
  },
}
