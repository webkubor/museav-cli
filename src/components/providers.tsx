import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ModelGoApiError } from '@/lib/request'
import { appToast } from '@/lib/app-toast'

// 这些错误码已在请求层专项处理，不再弹全局 toast
const SILENT_CODES = new Set([
  40101, // 未登录 → 已重定向 /login
  40302, // CSRF → 已自动刷新重试
])

function handleGlobalError(error: unknown, query?: { meta?: Record<string, unknown> }) {
  // 该 query 自行在 UI 内承接错误态（如内联错误块 + 重试），不弹全局 toast
  if (query?.meta?.silentError) return
  if (error instanceof ModelGoApiError) {
    if (SILENT_CODES.has(error.code)) return
    // 40301 无权限：若该 query 的页面已渲染专门的 403 兼容态（meta.forbiddenHandled），
    // 就不再弹全局 toast，避免「整页 403 + 角标 toast」双重信号。
    // 未标记的 query 仍保留兜底 toast，避免无声空白页。
    if (error.code === 40301 && query?.meta?.forbiddenHandled) return
    appToast.requestError(error)
    return
  }
  appToast.error('请求失败，请稍后重试')
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => handleGlobalError(error, query),
        }),
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation: Mutation<unknown, unknown, unknown, unknown>) => {
            // 有自己 onError 的 mutation 自行处理，避免重复 toast
            if (mutation.options.onError) return
            handleGlobalError(error)
          },
        }),
        defaultOptions: {
          // staleTime: 同 key 60s 内不重复请求；retry: 503 等失败只重试 1 次
          // refetchOnWindowFocus: 关闭切回标签页的整页重刷（最大的冗余请求源）
          queries: { staleTime: 60 * 1000, retry: 1, refetchOnWindowFocus: false },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
