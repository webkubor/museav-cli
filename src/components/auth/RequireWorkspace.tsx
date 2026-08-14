/**
 * 工作区路由守卫：校验 URL 里的 :workspaceId 确实属于当前租户。
 *
 * 为什么需要：`/workspace/:workspaceId/*` 下的三个页面（api-keys / guardrails /
 * observability）各自拿 URL 上的 id 直接打接口。id 失效时（收藏的旧链接、空间已删除、
 * 切组织后打开上一个组织的书签、手改 URL），每个页面各自失败，用户看到的是两条红色
 * 「服务暂不可用 / 请求失败」加一片空白，没有任何下一步（qa#594）。
 *
 * 无参入口 `/api-keys` 的中转页（pages/api-keys/redirect.tsx）本来就有完整兜底，
 * 缺的只是直达真实路由这一层，所以补在路由层，一处覆盖三个页面。
 *
 * 判定口径：
 *   - 列表未就绪 → 加载态，不抢渲染子页（与 RequirePermission / RequireEnterpriseTenant
 *     的 fail-closed 口径一致，避免子页先打一枪失败的接口）
 *   - 列表拉取失败 → 放行子页。网络抖动不能把一个正常空间判成「不存在」，
 *     那样比现状更糟；此时退回原有表现（子页自己报错）
 *   - 列表就绪且 id 不在其中 → 「空间不存在」态 + 去空间管理的出口
 */
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { LuFolderX } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { listWorkspaces } from '@/services/workspaces'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

export function RequireWorkspace({ children }: { children: ReactNode }) {
  // 命名空间固定 common：本守卫挂在路由 element 上、在 LocaleNamespaces 之外，
  // 页面级命名空间（workspaces 等）此时还没加载，用它们的 key 会渲染成裸 key
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  // 与侧栏空间切换器 / 空间管理页同一个 queryKey：命中缓存，不额外多打一次接口
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status" aria-label={t('common.loading')}>
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-mg-border border-t-brand-base" />
      </div>
    )
  }

  // 拉取失败时不做判定（见文件头「判定口径」）
  const known = !isError && Array.isArray(data)
  if (known && workspaceId && !data.some((w) => w.workspace_id === workspaceId)) {
    return (
      <EmptyState
        icon={<LuFolderX />}
        title={t('common.workspaceGuard.title')}
        description={t('common.workspaceGuard.desc')}
        action={
          <Button variant="brand" onClick={() => navigate('/workspaces')}>
            {t('common.workspaceGuard.action')}
          </Button>
        }
      />
    )
  }

  return <>{children}</>
}
