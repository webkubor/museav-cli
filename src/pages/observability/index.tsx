/**
 * 可观测性独立页面入口
 * 路由：/observability
 * API：GET /workspaces/:id/observability/settings
 */
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui/PageHeader'
import { ForbiddenState } from '@/components/ui/ForbiddenState'
import { isApiErrorCode } from '@/lib/request-error-message'
import { PERMS } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { getLoggingConfig } from '@/services/observability'
import { useAuthStore } from '@/store/auth'
import { ObservabilityContent } from './ObservabilityContent'

export { ObservabilityContent } from './ObservabilityContent'

/** 可观测性独立页面入口。 */
export default function ObservabilityPage() {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId)
  const { hasPermission } = usePermissions()
  const canEditLogging = hasPermission(PERMS.OBSERVABILITY_LOGGING_EDIT)
  const canManageForward = hasPermission(PERMS.OBSERVABILITY_FORWARD_MANAGE)

  const loggingQuery = useQuery({
    queryKey: ['observability', 'logging', activeWorkspaceId],
    queryFn: () => getLoggingConfig(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false, // 40301/无权限不重试，直接走兼容态
    meta: { forbiddenHandled: true }, // 40301 由本页 ForbiddenState 承接，不弹全局 toast
  })

  // 接口正常但业务码 40301（无权限，典型是进了自己无权的工作空间可观测性页）→ 403 兼容态。
  if (isApiErrorCode(loggingQuery.error, 40301)) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('observability.title')} />
        <ForbiddenState resource={t('observability.title')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('observability.title')} />

      {loggingQuery.isLoading && (
        <div className="grid max-w-6xl grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="card-shadow-adaptive space-y-4 rounded-lg border border-mg-border bg-card-bg p-6 animate-pulse">
            <div className="h-5 w-1/3 rounded-sm bg-mg-fill-0" />
            <div className="h-4 w-full rounded-sm bg-mg-fill-0" />
            <div className="h-4 w-2/3 rounded-sm bg-mg-fill-0" />
          </div>
          <div className="card-shadow-adaptive space-y-4 rounded-lg border border-mg-border bg-card-bg p-6 animate-pulse">
            <div className="h-5 w-1/2 rounded-sm bg-mg-fill-0" />
            <div className="h-20 w-full rounded-sm bg-mg-fill-0" />
          </div>
        </div>
      )}

      {loggingQuery.data && activeWorkspaceId && (
        <ObservabilityContent
          key={activeWorkspaceId}
          workspaceId={activeWorkspaceId}
          config={loggingQuery.data}
          canEditLogging={canEditLogging}
          canManageForward={canManageForward}
        />
      )}
    </div>
  )
}
