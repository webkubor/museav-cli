/**
 * 运行表现 §4.3 五种状态的判据测试，外加 §7 定稿口径的回归锁。
 *
 * 口径这几条尤其值得锁：它们是从原型代码逐条核出来的结论，
 * 后续有人「顺手」把 1W 加回来、或把 usage 也设成允许缺失，
 * 光看 UI 是察觉不到的。
 */
import { describe, it, expect } from 'vitest'
import {
  MOCK_METRICS,
  MOCK_RUNTIME_METRICS,
  RANGE_OPTIONS,
  STALE_THRESHOLD_MS,
  areAllMetricsEmpty,
  computeStale,
  isMetricEmpty,
  type RuntimeMetric,
} from './runtime-metrics-mock'

describe('§7 定稿口径回归锁', () => {
  it('周期档只有 1D / 1M，没有 1W', () => {
    expect(RANGE_OPTIONS.map((r) => r.value)).toEqual(['1D', '1M'])
    for (const metric of MOCK_METRICS) {
      expect(Object.keys(metric.snapshots).sort()).toEqual(['1D', '1M'])
    }
  })

  it('默认档：usage=1M，其余=1D', () => {
    const byKey = Object.fromEntries(MOCK_METRICS.map((m) => [m.key, m.defaultRange]))
    expect(byKey).toEqual({ usage: '1M', success: '1D', latency: '1D', throughput: '1D' })
  })

  it('usage 不产生缺失点，其余三个产生（对应原型 allowMissing = key !== "usage"）', () => {
    for (const metric of MOCK_METRICS) {
      const hasNull = Object.values(metric.snapshots).some((s) =>
        s.series.some((p) => p.value === null),
      )
      if (metric.key === 'usage') expect(hasNull, 'usage 不该有缺失点').toBe(false)
      else expect(hasNull, `${metric.key} 应有缺失点用于验证断线`).toBe(true)
    }
  })

  it('缺失点是 null 而不是 0 —— 0 会在图上画出虚假断崖', () => {
    for (const metric of MOCK_METRICS) {
      for (const snapshot of Object.values(metric.snapshots)) {
        // 序列里不应出现恰好为 0 的值（mock 基数都远大于 0，出现 0 就说明缺失被写成了 0）
        expect(snapshot.series.some((p) => p.value === 0)).toBe(false)
      }
    }
  })

  it('耗时类标了 lowerIsBetter，否则趋势方向会解读反', () => {
    const latency = MOCK_METRICS.find((m) => m.key === 'latency')
    expect(latency?.lowerIsBetter).toBe(true)
    expect(MOCK_METRICS.find((m) => m.key === 'usage')?.lowerIsBetter).toBeFalsy()
  })
})

describe('§4.3 状态判据', () => {
  const emptyMetric: RuntimeMetric = {
    key: 'x',
    label: 'x',
    hint: '',
    unit: '',
    defaultRange: '1D',
    snapshots: {
      '1D': { current: 0, deltaPct: 0, series: [{ label: 'a', value: null }] },
      '1M': { current: 0, deltaPct: 0, series: [{ label: 'a', value: null }] },
    },
  }

  it('② 单指标全 null → isMetricEmpty 为真', () => {
    expect(isMetricEmpty(emptyMetric)).toBe(true)
  })

  it('② 有任一有效值就不算空（保留卡片而不是整块空态）', () => {
    expect(MOCK_METRICS.every((m) => isMetricEmpty(m) === false)).toBe(true)
  })

  it('③ 全部指标空 / 数组为空 → 区块级空态', () => {
    expect(areAllMetricsEmpty([emptyMetric])).toBe(true)
    expect(areAllMetricsEmpty([])).toBe(true)
    expect(areAllMetricsEmpty(MOCK_METRICS)).toBe(false)
  })

  it('④ 新鲜度阈值 15 分钟，且边界内不误报', () => {
    expect(STALE_THRESHOLD_MS).toBe(15 * 60 * 1000)
    const now = 1_700_000_000_000
    const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString()
    expect(computeStale(iso(14 * 60_000), now)).toBe(false)
    expect(computeStale(iso(16 * 60_000), now)).toBe(true)
  })

  it('mock 默认是 ready 且不触发延迟提示', () => {
    expect(MOCK_RUNTIME_METRICS.status).toBe('ready')
    expect(MOCK_RUNTIME_METRICS.isStale).toBe(false)
  })
})
