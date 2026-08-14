import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { metricsRangeForGranularity, rangeForGranularity } from './shared'

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
