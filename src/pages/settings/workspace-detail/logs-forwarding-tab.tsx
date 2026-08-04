import { useQuery } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { getLoggingConfig } from '@/services/observability'
import { ObservabilityContent } from '@/pages/observability'

// 日志与转发（PRD：可观测性并入空间详情，复用可观测性页的采集/转发能力，按当前空间 workspaceId 参数化）
export function LogsForwardingTab({ workspaceId }: { workspaceId: string }) {
  const { hasPermission } = usePermissions()
  const canEditLogging = hasPermission(PERMS.OBSERVABILITY_LOGGING_EDIT)
  const canManageForward = hasPermission(PERMS.OBSERVABILITY_FORWARD_MANAGE)

  const loggingQuery = useQuery({
    queryKey: ['observability', 'logging', workspaceId],
    queryFn: () => getLoggingConfig(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  if (loggingQuery.isLoading) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-6 max-w-3xl space-y-4 animate-pulse">
        <div className="h-5 bg-mg-fill-0 rounded-sm w-1/3" />
        <div className="h-4 bg-mg-fill-0 rounded-sm w-full" />
        <div className="h-4 bg-mg-fill-0 rounded-sm w-2/3" />
      </div>
    )
  }
  if (!loggingQuery.data) return null

  return (
    <ObservabilityContent
      workspaceId={workspaceId}
      config={loggingQuery.data}
      canEditLogging={canEditLogging}
      canManageForward={canManageForward}
      embedded
    />
  )
}
