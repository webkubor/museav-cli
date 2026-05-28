/**
 * 控制台仪表盘主页面 (Dashboard)
 * 职责：作为控制台主界面，集中展示欢迎横幅与 CLI onboarding、核心 KPI 指标看板及常用快捷开发向导
 * 路由：/ (Dashboard 主页)
 * API：本身无直接接口调用，通过引入各个高内聚子组件（WelcomeBanner, KpiSection, GuideSection）拼装完整面板
 */

import { WelcomeBanner } from '@/features/dashboard/components/WelcomeBanner'
import { KpiSection } from '@/features/dashboard/components/KpiSection'
import { GuideSection } from '@/features/dashboard/components/GuideSection'

/**
 * 仪表盘控制台主页面组件
 * 采用极雅多层级响应式结构，平铺展示核心开发总览
 */
export default function DashboardPage() {
  return (
    <div>
      {/* 极雅晶莹欢迎横幅 (整合打招呼、工作区身份及 CLI Onboarding) */}
      <WelcomeBanner />

      {/* 核心 KPI 统计数据看板网格 */}
      <KpiSection />

      {/* 常用向导平铺 Grid 网格 */}
      <GuideSection />
    </div>
  )
}
