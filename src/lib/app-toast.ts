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
    return toast.error(
      getRequestErrorMessage(error, fallback),
      error instanceof ModelGoApiError && error.requestId
        ? `Request ID: ${error.requestId}`
        : undefined
    )
  },
}
