import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { metricsRangeForGranularity, rangeForGranularity, timeRangeForGranularity } from './shared'
import { USAGE_TIME_RANGE_PRESETS } from '@/pages/usage/usage-utils'

/**
 * 深链参数契约（qa#617）。
 *
 * 病根不是「映射写错了」，而是**根本没有映射**：总览「查看更多」原先带
 * `granularity=day|month`，而 /usage 只读 `time_range`，那个参数一路没人消费、
 * 也不会报错，于是「总览切今日 → 落地页回落本月、Top3 与落地排行对不上」
 * 这种不一致能长期躺着（周期为「本月」时恰好一致，只测本月会漏）。
 *
 * 所以这里锁两件事：映射值本身，以及**产出必须落在 /usage 认得的值域里**。
 * 后者是防复发的关键 —— 只要哪天有人改了任一侧的取值，这个断言就会红。
 * 仅在测试层 import pages/usage，运行时不让 features 依赖 pages。
 */
describe('timeRangeForGranularity — 总览 → /usage 深链的时间口径', () => {
  it('day → today（总览切「今日」，落地页也必须是今日）', () => {
    expect(timeRangeForGranularity('day')).toBe('today')
  })

  it('month → thisMonth', () => {
    expect(timeRangeForGranularity('month')).toBe('thisMonth')
  })

  it('产出值必须是 /usage 的合法 time_range 预设（跨页面契约，防单侧改动）', () => {
    for (const g of ['day', 'month'] as const) {
      expect(USAGE_TIME_RANGE_PRESETS).toContain(timeRangeForGranularity(g))
    }
  })
})

// 指标卡窗口必须与卡片 hint 的「今日/本月」逐字对齐；趋势图窗口（30 天/12 个月）
// 是另一回事——两者混用正是总览卡片不随按天/按月正确切换的根因。
describe('metricsRangeForGranularity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 14, 15, 30, 0)) // 本地时间 2026-08-14 15:30
  })
  afterEach(() => vi.useRealTimers())

  it('day = 今天 00:00（本地）→ 现在', () => {
    const { from, to } = metricsRangeForGranularity('day')
    expect(new Date(from).getTime()).toBe(new Date(2026, 7, 14, 0, 0, 0, 0).getTime())
    expect(new Date(to).getTime()).toBe(Date.now())
  })

  it('month = 当月 1 日 00:00（本地）→ 现在', () => {
    const { from, to } = metricsRangeForGranularity('month')
    expect(new Date(from).getTime()).toBe(new Date(2026, 7, 1, 0, 0, 0, 0).getTime())
    expect(new Date(to).getTime()).toBe(Date.now())
  })

  it('与趋势图窗口不同：卡片是当前周期累计，不是 30 天/12 个月序列窗口', () => {
    expect(new Date(metricsRangeForGranularity('day').from).getTime()).toBeGreaterThan(
      new Date(rangeForGranularity('day').from).getTime(),
    )
    expect(new Date(metricsRangeForGranularity('month').from).getTime()).toBeGreaterThan(
      new Date(rangeForGranularity('month').from).getTime(),
    )
  })
})
