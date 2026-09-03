/**
 * 模型发现服务（v1.0.6）
 * API：GET /internal/v1/model-discovery/*
 *
 * 锁两件容易回归的事：
 * 1. 六个接口都必须带 internal/v1 前缀 —— 漏了会打到 web-api 的 api/v1 上吃 40401，
 *    而且本地 vite proxy 也只代理 /internal/v1/model-discovery/ 这一段。
 * 2. type × metric 的合法组合与后端校验一致 —— 发出非法组合会被 4001 打回，
 *    尤其 STT 没有 VALUE_SCORE（产品口径，不是数据缺失）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/request')>()
  return { get: vi.fn(), INTERNAL_V1_PREFIX: actual.INTERNAL_V1_PREFIX }
})

import { get, INTERNAL_V1_PREFIX } from '@/lib/request'
import {
  getDiscoveryAnalysis,
  getDiscoveryOverview,
  getDiscoveryUsageTrends,
  getModelBenchmarks,
  listDiscoveryModelOptions,
  listDiscoveryRankings,
  toBenchmarkModelId,
} from '@/services/model-discovery'
import {
  DISCOVERY_METRICS_BY_TYPE,
  DISCOVERY_PRIMARY_METRIC,
  isMetricAllowed,
} from '@/constants/model-discovery'
import type { DiscoveryType } from '@/types'

const getMock = vi.mocked(get)

const ALL_TYPES: DiscoveryType[] = [
  'AGENT',
  'TEXT_CHAT',
  'CODE_GENERATION',
  'TEXT_TO_IMAGE',
  'IMAGE_EDITING',
  'TEXT_TO_VIDEO',
  'IMAGE_TO_VIDEO',
  'TTS',
  'STT',
]

describe('模型发现接口前缀', () => {
  beforeEach(() => {
    getMock.mockReset()
    getMock.mockResolvedValue({})
  })

  it('六个接口一律走 internal/v1，不走 api/v1', async () => {
    await getDiscoveryOverview({ type: 'TEXT_CHAT' })
    await listDiscoveryRankings({ type: 'TEXT_CHAT', metric: 'INTELLIGENCE_INDEX' })
    await listDiscoveryModelOptions({ type: 'TEXT_CHAT' })
    await getDiscoveryAnalysis({
      type: 'TEXT_CHAT',
      x_metric: 'COST_PER_TASK',
      y_metric: 'INTELLIGENCE_INDEX',
      source_model_ids: 'a,b',
    })
    await getDiscoveryUsageTrends({ type: 'TEXT_CHAT', source_model_ids: 'a,b' })
    await getModelBenchmarks('glm-5-2')

    expect(getMock).toHaveBeenCalledTimes(6)
    for (const call of getMock.mock.calls) {
      expect(call[0]).toMatch(/^model-discovery\//)
      expect(call[2]).toEqual({ prefix: INTERNAL_V1_PREFIX })
    }
    expect(INTERNAL_V1_PREFIX).toBe('internal/v1')
  })

  it('Benchmark 用 modelgo_id 作路径参数并转义', async () => {
    await getModelBenchmarks('gpt image/2', { type: 'TEXT_TO_IMAGE' })
    expect(getMock).toHaveBeenCalledWith(
      'model-discovery/models/gpt%20image%2F2/benchmarks',
      { type: 'TEXT_TO_IMAGE' },
      { prefix: INTERNAL_V1_PREFIX },
    )
  })
})

describe('type × metric 组合护栏', () => {
  it('每种类型的主指标都在自己的可用指标里', () => {
    for (const type of ALL_TYPES) {
      expect(DISCOVERY_METRICS_BY_TYPE[type]).toContain(DISCOVERY_PRIMARY_METRIC[type])
    }
  })

  it('STT 不提供性价比，其余八类都提供', () => {
    expect(isMetricAllowed('STT', 'VALUE_SCORE')).toBe(false)
    for (const type of ALL_TYPES.filter((t) => t !== 'STT')) {
      expect(isMetricAllowed(type, 'VALUE_SCORE')).toBe(true)
    }
  })

  it('媒体类型不提供速度与时延指标', () => {
    for (const type of ['TEXT_TO_IMAGE', 'IMAGE_EDITING', 'TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'TTS', 'STT'] as DiscoveryType[]) {
      expect(isMetricAllowed(type, 'OUTPUT_TPS')).toBe(false)
      expect(isMetricAllowed(type, 'END_TO_END_LATENCY')).toBe(false)
    }
  })

  it('语言三类共用同一套六指标', () => {
    const text = [...DISCOVERY_METRICS_BY_TYPE.TEXT_CHAT].sort()
    for (const type of ['AGENT', 'CODE_GENERATION'] as DiscoveryType[]) {
      const own = [...DISCOVERY_METRICS_BY_TYPE[type]].sort()
      expect(own.filter((m) => m.endsWith('_INDEX')).length).toBe(1)
      expect(own.filter((m) => !m.endsWith('_INDEX'))).toEqual(
        text.filter((m) => !m.endsWith('_INDEX')),
      )
    }
  })
})

describe('toBenchmarkModelId', () => {
  it('把 catalog 的点号 id 转成 observer 的连字符 id', () => {
    expect(toBenchmarkModelId('glm-5.2')).toBe('glm-5-2')
    expect(toBenchmarkModelId('kimi-k2.7-code')).toBe('kimi-k2-7-code')
    expect(toBenchmarkModelId('qwen3.7-max')).toBe('qwen3-7-max')
  })

  it('大写一律转小写（catalog MiniMax-M3 ↔ observer minimax-m3）', () => {
    expect(toBenchmarkModelId('MiniMax-M3')).toBe('minimax-m3')
  })

  it('本就规范的 id 原样返回', () => {
    expect(toBenchmarkModelId('deepseek-v4-pro')).toBe('deepseek-v4-pro')
  })
})
