import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth'
import { SegmentedToggle } from './SegmentedToggle'
import type { Granularity, WorkbenchView } from './shared'

/** 模块 1：问候区 + 视图/粒度切换（PRD 原型 overview-greeting：仅这两组控件，无筛选，需求方#64） */
export function GreetingHeader({
  view,
  onViewChange,
  showViewToggle,
  granularity,
  onGranularityChange,
}: {
  view: WorkbenchView
  onViewChange: (v: WorkbenchView) => void
  showViewToggle: boolean
  granularity: Granularity
  onGranularityChange: (g: Granularity) => void
}) {
  const { t } = useTranslation()
  const account = useAuthStore((s) => s.account)

  const greetingKey = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'dashboardTop.greeting.morning'
    if (hour < 18) return 'dashboardTop.greeting.afternoon'
    return 'dashboardTop.greeting.evening'
  }, [])

  const displayName = account?.display_name || account?.email || t('dashboardTop.greeting.defaultName')

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-mg-text-1 m-0">
          <span>{t(greetingKey, { name: displayName })}</span>
          <span role="img" aria-label="waving hand">👋</span>
        </h1>
        <p className="text-sm text-mg-text-3 mt-1 m-0">
          {t(view === 'enterprise' ? 'dashboardTop.greeting.descEnterprise' : 'dashboardTop.greeting.descMine')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showViewToggle && (
          <SegmentedToggle<WorkbenchView>
            ariaLabel={t('dashboard.workbench.view.enterprise')}
            value={view}
            onChange={onViewChange}
            options={[
              { value: 'enterprise', label: t('dashboard.workbench.view.enterprise') },
              { value: 'mine', label: t('dashboard.workbench.view.mine') },
            ]}
          />
        )}
        <SegmentedToggle<Granularity>
          ariaLabel={t('dashboard.workbench.granularity.day')}
          value={granularity}
          onChange={onGranularityChange}
          options={[
            { value: 'day', label: t('dashboard.workbench.granularity.day') },
            { value: 'month', label: t('dashboard.workbench.granularity.month') },
          ]}
        />
      </div>
    </div>
  )
}
