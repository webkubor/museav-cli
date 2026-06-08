/**
 * 控制台仪表盘主页面 (Dashboard)
 * 职责：作为控制台主界面，集中展示核心 KPI 指标看板、常用快捷入口、榜单与运营背景图
 * 路由：/ (Dashboard 主页)
 * API：本身无直接接口调用，通过引入各个高内聚子组件拼装完整面板
 */

import { KpiSection } from '@/features/dashboard/components/KpiSection'
import { WelcomeBanner } from '@/features/dashboard/components/WelcomeBanner'
import { QuickAccessSection } from '@/features/dashboard/components/QuickAccessSection'
import { DashboardRankingsSection } from '@/features/dashboard/components/DashboardRankingsSection'
import { UsageChartSection } from '@/features/dashboard/components/UsageChartSection'
import { HistogramChartSection } from '@/features/dashboard/components/HistogramChartSection'
import { RecentActivitySection } from '@/features/dashboard/components/RecentActivitySection'

/**
 * 仪表盘控制台主页面组件
 * 采用极雅多层级响应式结构，平铺展示核心开发总览
 */
export default function DashboardPage() {

  return (
    <div style={{ paddingBottom: '40px' }} className="animate-in fade-in duration-300">
      {/* 0. 欢迎 Banner + Hero Visual */}
      <WelcomeBanner />

      {/* 1. 核心 KPI 统计（余额那一行） */}
      <KpiSection />

      {/* 2. 快捷功能入口 — 提前曝光，引导新用户找到关键操作 */}
      <div className="mb-8">
        <QuickAccessSection />
      </div>

      {/* 3. 用量趋势与请求分布并排（近 5 天） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch">
        <UsageChartSection />
        <HistogramChartSection />
      </div>

      {/* 4. 热门模型排行榜 + 最近调用日志 并排 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch">
        <DashboardRankingsSection compact />
        <RecentActivitySection />
      </div>
    </div>
  )
}
