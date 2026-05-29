/**
 * 控制台仪表盘主页面 (Dashboard)
 * 职责：作为控制台主界面，集中展示欢迎横幅与 CLI onboarding、核心 KPI 指标看板及常用快捷开发向导
 * 路由：/ (Dashboard 主页)
 * API：本身无直接接口调用，通过引入各个高内聚子组件（WelcomeBanner, KpiSection, GuideSection）拼装完整面板
 */

import { WelcomeBanner } from '@/features/dashboard/components/WelcomeBanner'
import { KpiSection } from '@/features/dashboard/components/KpiSection'
import { GuideSection } from '@/features/dashboard/components/GuideSection'
import { QuickAccessSection } from '@/features/dashboard/components/QuickAccessSection'
import { TerminalSection } from '@/features/dashboard/components/TerminalSection'
import { UsageChartSection } from '@/features/dashboard/components/UsageChartSection'
import { RecentActivitySection } from '@/features/dashboard/components/RecentActivitySection'

/**
 * 仪表盘控制台主页面组件
 * 采用极雅多层级响应式结构，平铺展示核心开发总览
 */
export default function DashboardPage() {
  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* 1. 欢迎横幅 */}
      <WelcomeBanner />

      {/* 2. 核心 KPI 统计 */}
      <KpiSection />

      {/* 3. 用量趋势图表 (新增) */}
      <div style={{ marginBottom: '36px' }}>
        <UsageChartSection />
      </div>

      {/* 4. 快捷功能入口 */}
      <QuickAccessSection />

      {/* 5. 调用日志与接入示例混合布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-9">
        <div className="lg:col-span-2">
          <RecentActivitySection />
        </div>
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ marginBottom: '16px', fontWeight: 700, fontSize: '16px', color: 'var(--semi-color-text-0)', margin: 0 }}>接入示例</h3>
              <TerminalSection />
            </div>
          </div>
        </div>
      </div>

      {/* 6. 进阶向导 */}
      <div>
        <h3 style={{ marginBottom: '16px', fontWeight: 700, fontSize: '16px', color: 'var(--semi-color-text-0)', margin: 0 }}>进阶向导</h3>
        <GuideSection />
      </div>
    </div>
  )
}
