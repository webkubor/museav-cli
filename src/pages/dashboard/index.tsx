/**
 * 控制台工作台（总览页 / PRD 第一阶段）
 * 路由：/ (Dashboard 主页)
 * 组合模块：问候区 → 快速开始 → 核心指标 → 用量趋势 + 工作空间明细 → 排行 → 最近调用。
 * 视图/粒度状态在此持有并下发；视图默认按角色决定（Owner/Admin=企业视图，其余=我的视图）。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuTriangleAlert } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { useBalance } from '@/hooks/use-balance'
import { GreetingHeader } from '@/features/dashboard/workbench/GreetingHeader'
import { QuickStartSection } from '@/features/dashboard/workbench/QuickStartSection'
import { MetricsSection } from '@/features/dashboard/workbench/MetricsSection'
import { UsageTrendSection } from '@/features/dashboard/workbench/UsageTrendSection'
import { WorkspaceBreakdownSection } from '@/features/dashboard/workbench/WorkspaceBreakdownSection'
import { RankingsSection } from '@/features/dashboard/workbench/RankingsSection'
import { RecentCallsSection } from '@/features/dashboard/workbench/RecentCallsSection'
import type { Granularity, WorkbenchView } from '@/features/dashboard/workbench/shared'

export default function DashboardPage() {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { canManage, isEnterprise } = useTenantRole()
  const { data: balance } = useBalance(activeTenantId)

  const [granularity, setGranularity] = useState<Granularity>('day')
  // 视图默认：企业 Owner/Admin=企业视图，Member/个人租户=我的视图。用户手动切换后不再被角色覆盖。
  const [userView, setUserView] = useState<WorkbenchView | null>(null)
  const roleDefaultView: WorkbenchView = isEnterprise && canManage ? 'enterprise' : 'mine'
  const view = userView ?? roleDefaultView
  const showViewToggle = isEnterprise

  const isLowBalance = useMemo(() => {
    const avail = Number.parseFloat(balance?.available?.amount ?? '')
    const thr = Number.parseFloat(balance?.low_balance_threshold?.amount ?? '')
    return Number.isFinite(avail) && Number.isFinite(thr) && avail <= thr
  }, [balance])

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <GreetingHeader
        view={view}
        onViewChange={setUserView}
        showViewToggle={showViewToggle}
        granularity={granularity}
        onGranularityChange={setGranularity}
      />

      {isLowBalance && (
        <div className="flex items-center gap-2 rounded-lg border border-mg-warning/30 bg-mg-warning/10 px-4 py-3 text-sm text-mg-warning">
          <LuTriangleAlert size={16} className="shrink-0" />
          <span>{t('dashboard.workbench.empty.lowBalance')}</span>
        </div>
      )}

      <QuickStartSection />

      <MetricsSection view={view} granularity={granularity} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
        <UsageTrendSection granularity={granularity} />
        <WorkspaceBreakdownSection granularity={granularity} />
      </div>

      <RankingsSection view={view} granularity={granularity} />

      <RecentCallsSection />
    </div>
  )
}
