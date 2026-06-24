import { toast } from '@/lib/toast'
import { ModelGoApiError } from '@/lib/request'
import { getRequestErrorMessage } from '@/lib/request-error-message'
import {
  formatDiagnosticLine,
  formatDiagnosticsForCopy,
  getServerErrorDiagnostics,
} from '@/lib/error-diagnostics'

async function copyToClipboard(text: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    toast.success('错误信息已复制')
  } catch {
    toast.error('复制失败，请手动选择文本')
  }
}

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
    const message = getRequestErrorMessage(error, fallback)
    const diagnostics = getServerErrorDiagnostics(error)

    // 服务端级错误（5xx）：文案兜底，但挂上可复制的诊断信息供报障定位。
    if (diagnostics) {
      return toast.error(message, formatDiagnosticLine(diagnostics), {
        dedupKey: diagnostics.requestId ? `srv-error:${diagnostics.requestId}` : undefined,
        action: {
          label: '复制详情',
          onClick: () => {
            void copyToClipboard(formatDiagnosticsForCopy(diagnostics))
          },
        },
      })
    }

    // 普通业务错误：文案本身可读，保留 request_id 便于追踪。
    const requestId = error instanceof ModelGoApiError ? error.requestId : undefined
    return toast.error(message, requestId ? `请求 ID：${requestId}` : undefined)
  },
}
