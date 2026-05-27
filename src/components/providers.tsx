import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ModelGoApiError } from '@/lib/request'
import { appToast } from '@/lib/app-toast'

// 这些错误码已在请求层专项处理，不再弹全局 toast
const SILENT_CODES = new Set([
  40101, // 未登录 → 已重定向 /login
  40302, // CSRF → 已自动刷新重试
])

function handleGlobalError(error: unknown) {
  if (error instanceof ModelGoApiError) {
    if (SILENT_CODES.has(error.code)) return
    appToast.requestError(error)
    return
  }
  if (import.meta.env.DEV) {
    const line = error instanceof Error ? error.message : String(error)
    fetch('/dev/log', { method: 'POST', body: `[global] ${line}` }).catch(() => {})
  }
  appToast.error('请求失败，请稍后重试')
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: handleGlobalError,
        }),
        mutationCache: new MutationCache({
          onError: handleGlobalError,
        }),
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1 },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
