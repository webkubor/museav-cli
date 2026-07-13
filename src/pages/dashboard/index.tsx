/**
 * 控制台工作台（总览页 / PRD 第一阶段）
 * 路由：/ (Dashboard 主页)
 * 组合模块：问候区 → 快速开始 → 核心指标 → 用量趋势 + 工作空间明细 → 排行 → 最近调用。
 * 视图/粒度状态在此持有并下发；视图默认按角色决定（Owner/Admin=企业视图，其余=我的视图）。
 */
import { useEffect, useState } from 'react'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { useTrackContext } from '@/hooks/use-track-context'
import { trackEvent, trackPageView } from '@/lib/track'
import { useAuthStore } from '@/store/auth'
import { GreetingHeader } from '@/features/dashboard/workbench/GreetingHeader'
import { QuickStartSection } from '@/features/dashboard/workbench/QuickStartSection'
import { MetricsSection } from '@/features/dashboard/workbench/MetricsSection'
import { UsageTrendSection } from '@/features/dashboard/workbench/UsageTrendSection'
import { WorkspaceBreakdownSection } from '@/features/dashboard/workbench/WorkspaceBreakdownSection'
import { RankingsSection } from '@/features/dashboard/workbench/RankingsSection'
import { RecentCallsSection } from '@/features/dashboard/workbench/RecentCallsSection'
import type { Granularity, WorkbenchView } from '@/features/dashboard/workbench/shared'
import { KEY_TYPE_ALL, apiKeyTypeParam, type ApiKeyTypeFilter } from '@/lib/api-key-type-filter'

export default function DashboardPage() {
  const { canManage, isEnterprise } = useTenantRole()

  // PRD §8.2：统计周期默认按月
  const [granularity, setGranularity] = useState<Granularity>('month')
  // 视图默认：企业 Owner/Admin=企业视图，Member/个人租户=我的视图。用户手动切换后不再被角色覆盖。
  const [userView, setUserView] = useState<WorkbenchView | null>(null)
  const roleDefaultView: WorkbenchView = isEnterprise && canManage ? 'enterprise' : 'mine'
  const view = userView ?? roleDefaultView
  // 仅企业 Owner/Admin 可切换视图；企业 Member 锁定我的视图、个人租户无切换（PRD §8.2/§9）
  const showViewToggle = isEnterprise && canManage
  // 我的视图：总览各用量区块按当前账号裁剪（后端 #328/#314 支持 account_id 透传）
  const currentAccountId = useAuthStore((s) => s.account?.account_id)
  const scopedAccountId = view === 'mine' ? currentAccountId || undefined : undefined
  // API Key 类型筛选（需求 #22）：仅企业拥有者/管理员可见，默认全部类型
  const [keyTypeFilter, setKeyTypeFilter] = useState<ApiKeyTypeFilter>(KEY_TYPE_ALL)
  const scopedKeyType = showViewToggle ? apiKeyTypeParam(keyTypeFilter) : undefined

  const trackCtx = useTrackContext()

  // 首屏曝光：只在挂载时触发一次，不随视图/周期切换重复上报
  useEffect(() => {
    trackPageView('dashboard', undefined, { view_mode: view })
    trackEvent('overview_view', trackCtx, { view_mode: view })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleViewChange = (v: WorkbenchView) => {
    trackEvent('overview_view_mode_change', { ...trackCtx, from_view_mode: view, to_view_mode: v }, { view_mode: v })
    setUserView(v)
  }

  const handleGranularityChange = (g: Granularity) => {
    trackEvent('overview_period_change', { ...trackCtx, from_period: granularity, to_period: g }, { view_mode: view })
    setGranularity(g)
  }

  const handleKeyTypeChange = (v: ApiKeyTypeFilter) => {
    trackEvent('overview_filter_change', { ...trackCtx, filter: 'api_key_type', value: v }, { view_mode: view })
    setKeyTypeFilter(v)
  }

  return (
    <div className="no-canvas-blur space-y-6 pb-10 animate-in fade-in duration-300">
      <GreetingHeader
        view={view}
        onViewChange={handleViewChange}
        showViewToggle={showViewToggle}
        granularity={granularity}
        onGranularityChange={handleGranularityChange}
        keyTypeFilter={keyTypeFilter}
        onKeyTypeChange={handleKeyTypeChange}
      />

      <QuickStartSection />

      <MetricsSection view={view} granularity={granularity} accountId={scopedAccountId} apiKeyType={scopedKeyType} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
        <UsageTrendSection granularity={granularity} accountId={scopedAccountId} apiKeyType={scopedKeyType} />
        <WorkspaceBreakdownSection granularity={granularity} accountId={scopedAccountId} view={view} apiKeyType={scopedKeyType} />
      </div>

      <RankingsSection view={view} granularity={granularity} accountId={scopedAccountId} apiKeyType={scopedKeyType} />

      <RecentCallsSection view={view} accountId={scopedAccountId} granularity={granularity} apiKeyType={scopedKeyType} />
    </div>
  )
}
