/**
 * 控制台仪表盘主页面 (Dashboard)
 * 职责：作为控制台主界面，集中展示欢迎横幅与 CLI onboarding、核心 KPI 指标看板及常用快捷开发向导
 * 路由：/ (Dashboard 主页)
 * API：本身无直接接口调用，通过引入各个高内聚子组件（WelcomeBanner, KpiSection, GuideSection）拼装完整面板
 */

import { useTranslation } from 'react-i18next'
import { WelcomeBanner } from '@/features/dashboard/components/WelcomeBanner'
import { KpiSection } from '@/features/dashboard/components/KpiSection'
import { GuideSection } from '@/features/dashboard/components/GuideSection'
import { QuickAccessSection } from '@/features/dashboard/components/QuickAccessSection'
import { TerminalSection } from '@/features/dashboard/components/TerminalSection'
import { UsageChartSection } from '@/features/dashboard/components/UsageChartSection'
import { HistogramChartSection } from '@/features/dashboard/components/HistogramChartSection'
import { RecentActivitySection } from '@/features/dashboard/components/RecentActivitySection'

/**
 * 仪表盘控制台主页面组件
 * 采用极雅多层级响应式结构，平铺展示核心开发总览
 */
export default function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div style={{ paddingBottom: '40px' }} className="animate-in fade-in duration-300">
      {/* 1. 核心 KPI 统计（余额那一行） */}
      <KpiSection />

      {/* 2. 第一屏焦点：用量趋势与请求分布并排（近 5 天） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch">
        <UsageChartSection />
        <HistogramChartSection />
      </div>

      {/* 3. 调用日志与接入示例并排 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-start">
        <div className="lg:col-span-2">
          <RecentActivitySection />
        </div>
        <div className="flex flex-col h-full">
          <h3 className="text-mg-text-0 text-[15px] font-bold tracking-tight mb-3.5 flex items-center gap-1.5 uppercase select-none">
            {t('dashboard.section.integration')}
          </h3>
          <TerminalSection />
        </div>
      </div>

      {/* 4. 快捷功能入口 */}
      <div className="mb-8">
        <QuickAccessSection />
      </div>

      {/* 5. 环境卡片（下移到此） */}
      <div className="mb-8">
        <WelcomeBanner />
      </div>

      {/* 6. 进阶向导 */}
      <div>
        <h3 className="text-mg-text-0 text-[15px] font-bold tracking-tight mb-3.5 flex items-center gap-1.5 uppercase select-none">
          {t('dashboard.section.guide')}
        </h3>
        <GuideSection />
      </div>
    </div>
  )
}
