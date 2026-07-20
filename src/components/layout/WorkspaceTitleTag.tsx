/**
 * 页面标题旁的「当前工作空间」Tag（需求方#125）。
 * 复用 WorkspaceSwitcher 的缓存 queryKey，不发额外请求；查不到名称时兜底「默认工作空间」。
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth'
import { listWorkspaces } from '@/services/workspaces'
import type { WorkspaceItem } from '@/types'
import { Badge } from '@/components/ui/Badge'

export function WorkspaceTitleTag({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((state) => state.activeTenantId)
  const { data: workspaces = [] } = useQuery<WorkspaceItem[]>({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((res) => res.items || []),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })
  const name =
    workspaces.find((w) => w.workspace_id === workspaceId)?.name ?? t('header.defaultWorkspace')

  return (
    <Badge variant="brand" size="sm" className="align-middle translate-y-[-2px]">
      {name}
    </Badge>
  )
}
