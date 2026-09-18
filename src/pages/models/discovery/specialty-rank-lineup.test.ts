/**
 * Agent / 文本的专项榜「是哪四张」（prd46#1064）。
 *
 * 线上曾长期是 性价比领先 / 输出 TPS / 首 Token 时延领先 / 近 7 日热度，与 PRD 原型
 * 改版后的 综合评分 / 单次任务成本 / 输出 TPS / 近 7 日热度 对不上；四张卡都画得出
 * 柱子，肉眼只看得出"有四张榜"，看不出口径错了——所以口径必须由测试钉住。
 *
 * 断言读源码而非渲染：`textBenchmarkRankings` 是组件内的局部常量，渲染测要先把
 * recharts 的 ResponsiveContainer 尺寸 mock 掉，反而把真正要钉的东西 mock 没了
 * （同 specialty-bar-label.test.ts 的取舍）。
 */
import { describe, expect, it } from 'vitest'
import src from './ModelDiscoveryPagePrototype.tsx?raw'
import { specialtyMetricFor } from './discovery-data'
import type { SpecialtyKind } from './discovery-config'
import type { DiscoveryType } from '@/types'

const block = src.slice(
  src.indexOf('const textBenchmarkRankings = ['),
  src.indexOf('const audioBenchmarkRankings'),
)
const kinds = [...block.matchAll(/kind:\s*"(\w+)" as SpecialtyKind/g)].map((match) => match[1])
const titleKeys = [...block.matchAll(/title:\s*t\("([\w.]+)"\)/g)].map((match) => match[1])

const EXPECTED_KINDS: SpecialtyKind[] = ['score', 'price', 'tps', 'usage']
/** 语言三类共用这四张榜（AGENT 的主指标是 AGENTIC_INDEX，其余同构）。 */
const LANGUAGE_TYPES: DiscoveryType[] = ['AGENT', 'TEXT_CHAT', 'CODE_GENERATION']

describe('Agent / 文本专项榜四卡口径（prd46#1064）', () => {
  it('恰好四张，顺序是 综合评分 / 单次任务成本 / 输出 TPS / 近 7 日热度', () => {
    expect(kinds).toEqual(EXPECTED_KINDS)
    expect(titleKeys).toEqual([
      'modelsDiscovery.metric.overallScore',
      'modelsDiscovery.metric.costPerTask',
      'modelsDiscovery.metric.outputTps',
      'modelsDiscovery.metric.popularity7d',
    ])
  })

  it('旧口径的两张榜不许回来：性价比领先(value) 与 首 Token 时延领先(latency)', () => {
    expect(kinds).not.toContain('value')
    expect(kinds).not.toContain('latency')
    expect(titleKeys).not.toContain('modelsDiscovery.metric.valueLeader')
    expect(titleKeys).not.toContain('modelsDiscovery.metric.ttftLeader')
  })

  it('四张榜在语言三类上都取得到指标 —— 取不到会整张榜空白', () => {
    for (const type of LANGUAGE_TYPES) {
      for (const kind of EXPECTED_KINDS) {
        expect(specialtyMetricFor(kind, type), `${type}/${kind}`).toBeDefined()
      }
    }
    // 别的业务类型可用指标本来就不同，不受这条口径约束（STT 连性价比都没有）
    expect(specialtyMetricFor('tps', 'STT')).toBeUndefined()
  })
})
