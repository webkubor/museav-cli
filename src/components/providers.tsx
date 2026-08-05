import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Mutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ModelGoApiError } from '@/lib/request'
import { appToast } from '@/lib/app-toast'
import { handleSessionExpired } from '@/lib/auth/auth-controller'
import { useAuthStore } from '@/store/auth'
import i18n from '@/i18n'

// 这些错误码已在请求层专项处理，不再弹全局 toast
const SILENT_CODES = new Set([
  40101, // 未登录 → 已重定向 /login
  40302, // CSRF → 已自动刷新重试
])

/**
 * 是否为「空租户头触发的 tenant_id 校验失败」——即请求发出时无活跃租户。
 * 后端对租户级接口先校验 X-Tenant-Id（早于认证），空头返 40001 + field_errors。
 * 场景：另一浏览器标签登出会清掉共享的 localStorage.activeTenantId，本标签刷新后
 * store 从空 localStorage 初始化（activeTenantId 为空），残留的租户级请求即触发此错误（需求方#229）。
 */
function isEmptyTenantValidationError(error: ModelGoApiError): boolean {
  if (error.code !== 40001) return false
  const fieldErrors = (error.data as { field_errors?: { field?: string; code?: string }[] } | null | undefined)?.field_errors
  return Array.isArray(fieldErrors) && fieldErrors.some((f) => f?.field === 'tenant_id' && f?.code === 'required')
}

function handleGlobalError(error: unknown, query?: { meta?: Record<string, unknown> }) {
  // 该 query 自行在 UI 内承接错误态（如内联错误块 + 重试），不弹全局 toast
  if (query?.meta?.silentError) return
  if (error instanceof ModelGoApiError) {
    if (SILENT_CODES.has(error.code)) return
    // 无活跃租户时的 tenant_id 校验失败 = 会话/租户态已失效（如另一标签登出）：
    // 不弹裸校验 toast，按会话过期统一处理（清鉴权态 → RequireAuth 跳登录）（需求方#229）。
    if (isEmptyTenantValidationError(error) && !useAuthStore.getState().activeTenantId) {
      handleSessionExpired()
      return
    }
    // 40301 无权限：若该 query 的页面已渲染专门的 403 兼容态（meta.forbiddenHandled），
    // 就不再弹全局 toast，避免「整页 403 + 角标 toast」双重信号。
    // 未标记的 query 仍保留兜底 toast，避免无声空白页。
    if (error.code === 40301 && query?.meta?.forbiddenHandled) return
    appToast.requestError(error)
    return
  }
  appToast.error(i18n.t('common.requestFailed'))
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
