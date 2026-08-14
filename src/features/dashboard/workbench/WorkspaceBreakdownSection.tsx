import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LuLayers, LuArrowUpRight } from 'react-icons/lu'
import { getUsageSummary } from '@/services/usage'
import { listWorkspaces } from '@/services/workspaces'
import { useAuthStore } from '@/store/auth'
import { useTrackContext } from '@/hooks/use-track-context'
import { trackEvent } from '@/lib/track'
import { Card } from '@/components/ui/Card'
import { Money } from '@/components/ui/Money'
import { abbreviateNumber, rangeForGranularity, type Granularity, type WorkbenchView } from './shared'

/**
 * 模块 6：工作空间明细。getUsageSummary(group_by:'workspace') 取 groups。
 * 说明：groups 只含 label/spend/requests/tokens，后端未返回工作空间描述，
 * 次级行用「请求 · Tokens」代替描述展示。
 */
export function WorkspaceBreakdownSection({ granularity, accountId, view = 'enterprise' }: { granularity: Granularity; accountId?: string; view?: WorkbenchView }) {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const navigate = useNavigate()
  const trackCtx = useTrackContext()
  const isMine = view === 'mine'

  const handleViewMore = () => {
    trackEvent('overview_breakdown_more_click', trackCtx, { view_mode: view })
    trackEvent('destination_page_view', { ...trackCtx, destination: '/usage' }, { source: 'workspace_breakdown' })
    // 明细按工作空间分组，跳转带上下文：view + granularity（趋势 groupBy 已按需求方#66 移除）
    navigate(`/usage?view=${view}&granularity=${granularity}`)
  }

  const range = useMemo(() => rangeForGranularity(granularity), [granularity])

  const { data, isLoading } = useQuery({
    queryKey: ['workbench', 'summary', 'workspace', activeTenantId, granularity, accountId],
    queryFn: () => getUsageSummary({ from: range.from, to: range.to, group_by: 'workspace', account_id: accountId }),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  // 后端 group_by=workspace 的分组 label/key 都是 workspace_id，这里用工作空间列表把 id 映射成名称
  // （复用 DashboardLayout 的同 queryKey 共享缓存）。
  const { data: workspaceItems = [] } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })
  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const w of workspaceItems) m.set(w.workspace_id, w.name)
    return m
  }, [workspaceItems])

  const groups = (data?.groups ?? []).slice(0, 6)

  return (
    <Card className="p-6 flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-base/10 text-brand-base">
            <LuLayers size={18} />
          </span>
          <div>
            <h3 className="font-bold text-base text-mg-text-1 m-0">{t(isMine ? 'dashboard.workbench.workspaces.titleMine' : 'dashboard.workbench.workspaces.title')}</h3>
            {/* PRD 副标题结构「聚合口径 · 周期」，周期随粒度切换（今日/本月） */}
            <p className="text-xs text-mg-text-3 mt-0.5 m-0">{`${t(isMine ? 'dashboard.workbench.workspaces.subtitleMine' : 'dashboard.workbench.workspaces.subtitle')} · ${t(`dashboard.workbench.periodLabel.${granularity}`)}`}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleViewMore}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-base hover:text-brand-deep cursor-pointer"
        >
          {t('dashboard.workbench.workspaces.viewMore')}
          <LuArrowUpRight size={13} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse bg-mg-fill-2 rounded-sm h-12 w-full" />
          ))}
        </div>
      ) : groups.length > 0 ? (
        <div className="flex flex-col divide-y divide-mg-border">
          {groups.map((g) => (
            <div key={g.key} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-mg-text-1">{nameById.get(g.key) || g.label || g.key}</div>
                {/* 缩写数字悬浮显精确值（原生 title，不引入 Tooltip） */}
                <div
                  className="mt-0.5 text-xs text-mg-text-3 font-mono cursor-help"
                  title={`${g.requests.toLocaleString()} · ${g.tokens.toLocaleString()} tokens`}
                >
                  {`${abbreviateNumber(g.requests)} · ${abbreviateNumber(g.tokens)} tokens`}
                </div>
              </div>
              <Money amount={g.spend?.amount} currency={g.spend?.currency} size="md" tone="brand" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <LuLayers size={22} className="mb-2 text-mg-text-3" />
          <p className="text-xs text-mg-text-3 font-medium">{t('dashboard.workbench.workspaces.empty')}</p>
        </div>
      )}
    </Card>
  )
}
