/**
 * 模型发现（公开页 /models/discovery）—— 薄壳，UI 全部来自 PRD 原型。
 *
 * ⚠️ 本页是「1:1 复刻原型」的**显式例外**，与 CLAUDE.md「布局/排版对标现状、
 * 原型只给功能交互」相反 —— 需求方明确要求 UI 与交互 1:1。不要拿本页当先例
 * 去改其他页面。
 *
 * 实现方式：把原型 `modelgo_prd/src/ModelDiscoveryPage.tsx` 整文件移植成
 * ModelDiscoveryPagePrototype.tsx（1396 行，含它自己的 mock 数据与全部子组件），
 * 样式整段搬为 discovery.css。本文件只负责把原型的两个回调接到控制台能力上：
 *
 *   onOpenModel(modelId)  → 进 /models/:id，带 source=discovery + 筛选 + 滚动位置
 *   onViewAllModels()     → 回 /models
 *
 * 为什么不逐个组件重写：原型的散点图是自绘的（--point-left/--point-bottom 定位
 * + 图例 + 网格线 + 点标签 tooltip）、专项排行是垂直柱状图带成本五项拆解、榜单
 * 有厂商多选 popover 与支撑指标列。逐个照抄一定走形，整文件移植才是真 1:1。
 *
 * 代价（明确记下来）：
 * - 原型自带 mock 数据，接真实接口时要在原型文件内替换数据源（§8 第 6 步）
 * - 原型的 URL 状态是组件内 useState，不进 query。控制台侧的 URL 契约（§4.1）
 *   本轮**未接**——要接得改原型文件的状态来源，属下一步
 */
import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { trackEvent, trackPageView } from '@/lib/track'
import ModelDiscoveryPagePrototype from './ModelDiscoveryPagePrototype'
import { modelDetailPath } from '../model-detail-path'
import './discovery.css'

export default function ModelDiscoveryPage() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    trackPageView('models_discovery')
    trackEvent('marketplace_discovery_view', { source: 'catalog_header' })
  }, [])

  return (
    <ModelDiscoveryPagePrototype
      onOpenModel={(modelId) => {
        // 带来源与滚动位置，详情页返回时恢复现场（§2.2）
        navigate(modelDetailPath({ model_id: modelId }), {
          state: {
            source: 'discovery',
            fromDiscoverySearch: location.search,
            fromDiscoveryScrollY: window.scrollY,
          },
        })
      }}
      onViewAllModels={() => {
        trackEvent('marketplace_discovery_exit_clicked', { target: 'catalog_header' })
        // 不用浏览器 back()：用户可能从外链直达，back() 会把人送出站（§2.2）
        navigate('/models')
      }}
    />
  )
}
