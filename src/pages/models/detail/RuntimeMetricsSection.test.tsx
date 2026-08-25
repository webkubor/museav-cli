/**
 * 运行表现区块 §4.3 五种状态的渲染测试。
 *
 * 为什么用单测而不是浏览器验：loading / error / 全空 / 数据延迟这四种态在 mock
 * 数据下没有真实触发路径（接口都还没接），靠浏览器只能验到 ready 那一种。
 * 把状态当 props 传进来直接断言，是这四种态唯一能被真正覆盖的方式。
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RuntimeMetricsSection } from './RuntimeMetricsSection'
import { MOCK_METRICS, type RuntimeMetric, type RuntimeMetricsData } from './runtime-metrics-mock'

const emptyMetric = (key: string): RuntimeMetric => ({
  key,
  label: `指标${key}`,
  hint: '',
  unit: '',
  defaultRange: '1D',
  snapshots: {
    '1D': { current: 0, deltaPct: 0, series: [{ label: 'a', value: null }] },
    '1M': { current: 0, deltaPct: 0, series: [{ label: 'a', value: null }] },
  },
})

describe('RuntimeMetricsSection §4.3 五态', () => {
  it('① loading：显示骨架，不显示任何指标数值', () => {
    const data: RuntimeMetricsData = { status: 'loading', metrics: [] }
    const { container } = render(<RuntimeMetricsSection data={data} />)
    // 区块标题始终在（不阻塞详情其他区块的阅读）
    expect(screen.getByText('平台运行表现')).toBeInTheDocument()
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('使用量')).not.toBeInTheDocument()
  })

  it('② 单指标无数据：保留那张卡 + 提示，不显示伪造的 0', () => {
    const data: RuntimeMetricsData = {
      status: 'ready',
      metrics: [emptyMetric('a'), MOCK_METRICS[0]],
    }
    render(<RuntimeMetricsSection data={data} />)
    // 空的那张卡还在，且写明原因
    expect(screen.getByText('指标a')).toBeInTheDocument()
    expect(screen.getByText('暂无足够平台数据')).toBeInTheDocument()
    // 有数据的那张正常渲染
    expect(screen.getByText('使用量')).toBeInTheDocument()
  })

  it('③ 全部指标无数据：区块级空态，不渲染四个空卡', () => {
    const data: RuntimeMetricsData = {
      status: 'ready',
      metrics: [emptyMetric('a'), emptyMetric('b')],
    }
    render(<RuntimeMetricsSection data={data} />)
    expect(screen.getByText('该模型暂无平台运行数据')).toBeInTheDocument()
    // 单卡提示不该出现 —— 那是 ② 的表现，两者不能同时
    expect(screen.queryByText('暂无足够平台数据')).not.toBeInTheDocument()
    expect(screen.queryByText('指标a')).not.toBeInTheDocument()
  })

  it('④ 数据延迟：标 warning 且保留最后有效数据', () => {
    const data: RuntimeMetricsData = {
      status: 'ready',
      metrics: MOCK_METRICS,
      isStale: true,
      updatedAtText: '2026-08-25 10:28:00',
    }
    render(<RuntimeMetricsSection data={data} />)
    expect(screen.getByText(/数据更新延迟/)).toBeInTheDocument()
    expect(screen.getByText(/2026-08-25 10:28:00/)).toBeInTheDocument()
    // 关键：数据没被清空
    expect(screen.getByText('使用量')).toBeInTheDocument()
  })

  it('④ 不延迟时不出现该提示', () => {
    render(
      <RuntimeMetricsSection
        data={{ status: 'ready', metrics: MOCK_METRICS, isStale: false }}
      />,
    )
    expect(screen.queryByText(/数据更新延迟/)).not.toBeInTheDocument()
  })

  it('⑤ error：区块级错误态 + 重试按钮', () => {
    let retried = 0
    render(
      <RuntimeMetricsSection
        data={{ status: 'error', metrics: [] }}
        onRetry={() => { retried += 1 }}
      />,
    )
    expect(screen.getByText('运行表现数据加载失败')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: '重试' })
    btn.click()
    expect(retried).toBe(1)
  })

  it('⑤ 未给 onRetry 时不渲染重试按钮（避免点了没反应）', () => {
    render(<RuntimeMetricsSection data={{ status: 'error', metrics: [] }} />)
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it('ready：四张卡都在，每张卡一个独立的周期切换控件', () => {
    const { container } = render(<RuntimeMetricsSection />)
    for (const label of ['使用量', '调用成功率', '响应耗时', '处理速度']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    /**
     * 断言 tablist 而不是 radiogroup：现状的 SegmentedToggle 用
     * role="tablist" + role="tab" + aria-selected 实现。
     *
     * ⚠️ 已知语义局限（不在本次修）：「时间范围」严格说不是标签页，用 radio
     * 语义更准；但 §6 明确允许「或已有 SegmentedToggle」，而手搓一个同类控件
     * 违反「禁止手搓已有组件」。要改得改 SegmentedToggle 本身，那会影响总览/
     * 用量等所有在用页面，属独立改动。
     */
    expect(container.querySelectorAll('[role="tablist"]').length).toBe(4)
    // 每个 tablist 两个档（1D / 1M），共 8 个 tab
    expect(container.querySelectorAll('[role="tab"]').length).toBe(8)
  })
})
