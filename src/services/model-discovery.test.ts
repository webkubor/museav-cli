/**
 * 模型发现服务（v1.0.6）
 * API：GET /api/v1/model-discovery/*
 *
 * 锁两件容易回归的事：
 * 1. 六个接口都走 web-api 的默认 api/v1 前缀，不带 observer 的 internal/v1 ——
 *    web-api 上没有 internal/v1 这条路由，带了会整页吃 40401（2026-09-03 test 环境实测）。
 * 2. type × metric 的合法组合与后端校验一致 —— 发出非法组合会被 4001 打回，
 *    尤其 STT 没有 VALUE_SCORE（产品口径，不是数据缺失）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/request')>()
  return { ...actual, get: vi.fn() }
})

import { get } from '@/lib/request'
import {
  getDiscoveryAnalysis,
  getDiscoveryOverview,
  getDiscoveryUsageTrends,
  getModelBenchmarks,
  listDiscoveryModelOptions,
  listDiscoveryRankings,
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

  it('六个接口一律走默认 api/v1 前缀，不带 internal/v1', async () => {
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
      expect(call[2]).toBeUndefined()
    }
  })

  it('Benchmark 用 modelgo_id 作路径参数并转义', async () => {
    await getModelBenchmarks('gpt image/2', { type: 'TEXT_TO_IMAGE' })
    expect(getMock).toHaveBeenCalledWith(
      'model-discovery/models/gpt%20image%2F2/benchmarks',
      { type: 'TEXT_TO_IMAGE' },
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
