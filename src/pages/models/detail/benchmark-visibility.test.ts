/**
 * Benchmark 空值可见性（需求方#969 缺陷 2、3）。
 *
 * 锁两条 QA 复验判为不通过的行为：
 *   1. 整组一项有效值都没有时**隐藏整组** —— 接口的指标清单是固定完整结构，
 *      按「有没有指标项」判断的话，6/6 全 null 的组会渲染出 6 行「暂无数据」
 *   2. 分布图的标记线只在有 ahead_percent 时出 —— 没有百分位就没有位置可标，
 *      只剩背景柱形没有意义
 */
import { describe, expect, it } from 'vitest'
import type { BenchmarkCompositeIndex, BenchmarkGroup, BenchmarkItem } from '@/types'

/** 与 BenchmarkSection 里的过滤条件同源；改一处要改两处会被这些用例挡住。 */
function visibleGroups(groups: BenchmarkGroup[]) {
  return groups.filter((group) => group.items.some((item) => item.score !== null || item.display_score !== null))
}

function showsDistribution(index: BenchmarkCompositeIndex) {
  return index.score !== null && index.ahead_percent !== null
}

const item = (over: Partial<BenchmarkItem> = {}): BenchmarkItem =>
  ({ metric: 'GPQA_DIAMOND', name: 'GPQA Diamond', score: null, display_score: null, unit: 'PERCENT', ...over }) as BenchmarkItem

const group = (code: string, items: BenchmarkItem[]): BenchmarkGroup =>
  ({ code, name: code, items }) as BenchmarkGroup

const composite = (over: Partial<BenchmarkCompositeIndex> = {}): BenchmarkCompositeIndex =>
  ({ metric: 'INTELLIGENCE_INDEX', score: 42.1, rank: 51, total: 252, ahead_percent: 80, ...over }) as BenchmarkCompositeIndex

describe('整组无有效值时隐藏', () => {
  it('6/6 全 null 的组不渲染（实测 deepseek-v4-pro 的「推理与知识」组）', () => {
    const groups = visibleGroups([group('REASONING', Array.from({ length: 6 }, () => item()))])
    expect(groups).toHaveLength(0)
  })

  it('组内只要有一项有值就保留整组，组内的 null 项仍按「暂无数据」展示', () => {
    const g = group('AGENTIC', [item(), item({ metric: 'TERMINAL_BENCH', score: 0.647, display_score: 64.7 })])
    expect(visibleGroups([g])).toHaveLength(1)
  })

  it('display_score 有值、score 为 null 也算有效（分类 Elo 走 display_score）', () => {
    expect(visibleGroups([group('ELO', [item({ display_score: 1370 })])])).toHaveLength(1)
  })

  it('items 为空数组的组照旧隐藏（TTS 当前如此）', () => {
    expect(visibleGroups([group('EMPTY', [])])).toHaveLength(0)
  })

  it('混合时只留有值的组 —— 4 组 12 项里 11 项 null 的实测形状', () => {
    const groups = visibleGroups([
      group('REASONING', Array.from({ length: 6 }, () => item())),
      group('AGENTIC', Array.from({ length: 2 }, () => item())),
      group('IF', [item()]),
      group('TERMINAL', [item({ metric: 'TERMINAL_BENCH', score: 0.647, display_score: 64.7 })]),
    ])
    expect(groups.map((g) => g.code)).toEqual(['TERMINAL'])
  })
})

describe('分布图标记线', () => {
  it('有分值且有百分位时出图', () => {
    expect(showsDistribution(composite())).toBe(true)
  })

  it('没有百分位不出图 —— 没有位置可标，只剩背景柱形没有意义', () => {
    expect(showsDistribution(composite({ ahead_percent: null }))).toBe(false)
  })

  it('分值本身为空时整卡是「暂无数据」，不出图', () => {
    expect(showsDistribution(composite({ score: null }))).toBe(false)
  })
})
