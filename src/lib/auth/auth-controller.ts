/**
 * 非 React 的中央会话过期策略入口。
 * 所有需要处理 40101（session expired）的代码统一调用此处，
 * 禁止各处内联 toast + clearAuth，也禁止使用 window.location.href 硬跳转：
 * 硬刷新会重置 SessionLoader 的 isFetchingSession/isLoading，
 * 与 /login 守卫形成 /login ↔ /dashboard 全页无限刷新（历史事故）。
 * 只清内存鉴权态，重定向由 ProtectedRoute 响应式完成。
 */
import { toast } from '@/lib/toast'
import i18n from '@/i18n'
import { useAuthStore } from '@/store/auth'

export function handleSessionExpired(): void {
  toast.warning(i18n.t('common.sessionExpired'))
  useAuthStore.getState().clearAuth()
}
