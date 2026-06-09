/**
 * 控制台仪表盘主页面 (Dashboard)
 * 职责：作为控制台主界面，集中展示核心 KPI 指标看板、常用快捷入口、榜单与运营背景图
 * 路由：/ (Dashboard 主页)
 * API：本身无直接接口调用，通过引入各个高内聚子组件拼装完整面板
 */

import { KpiSection } from '@/features/dashboard/components/KpiSection'
import { DashboardTopPanel } from '@/features/dashboard/components/DashboardTopPanel'
import { UsageChartSection } from '@/features/dashboard/components/UsageChartSection'
import { HistogramChartSection } from '@/features/dashboard/components/HistogramChartSection'
import { UsageRankingsSection } from '@/features/dashboard/components/UsageRankingsSection'

/**
 * 仪表盘控制台主页面组件
 * 采用极雅多层级响应式结构，平铺展示核心开发总览
 */
export default function DashboardPage() {

  return (
    <div style={{ paddingBottom: '40px' }} className="animate-in fade-in duration-300">
      {/* 0. 问候、状态提醒、一键配置与快捷操作 */}
      <DashboardTopPanel />

      {/* 1. 核心 KPI 统计 */}
      <KpiSection />

      {/* 2. 用量趋势与请求分布并排（近 5 天） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch">
        <UsageChartSection />
        <HistogramChartSection />
      </div>

      {/* 3. 模型消费排行 + API Key 消费排行 并排 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch">
        <UsageRankingsSection type="models" />
        <UsageRankingsSection type="api-keys" />
      </div>
    </div>
  )
}
