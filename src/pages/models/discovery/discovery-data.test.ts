/**
 * 发现页数据转换契约。
 *
 * 锁三件在联调里真实踩到的事：
 * 1. 九个 modality|task 组合都能映射到业务类型 —— 漏一个该 tab 就整页没数据
 * 2. 接口的 null 一律转成「—」，不能补 0（补 0 会让缺数据的模型在榜单里排到末尾，
 *    看着像"最差"而不是"没数据"）
 * 3. highlight 为 null 时保留卡位 —— 接口文档要求，媒体类型的速度卡恒为 null
 */
import { describe, expect, it } from 'vitest'
import {
  EMPTY,
  MODALITY_TASK_TO_TYPE,
  compactAmount,
  discoveryTypeFor,
  formatPrice,
  formatScore,
  isLanguageType,
  toPrototypeModel,
  toSummaryCards,
} from './discovery-data'
import type { DiscoveryOverview, DiscoveryRankingItem } from '@/types'

const ALL_TASKS: Array<[string, string]> = [
  ['agent', 'Agent'],
  ['text', '文本对话'],
  ['text', '代码生成'],
  ['image', '文生图'],
  ['image', '图片编辑'],
  ['video', '文生视频'],
  ['video', '图生视频'],
  ['audio', '语音合成（TTS）'],
  ['audio', '语音识别（STT）'],
]

function card(over: Partial<DiscoveryRankingItem> = {}): DiscoveryRankingItem {
  return {
    rank: 1,
    value: 63.1,
    source_model_id: 'sid',
    modelgo_id: 'glm-5-2',
    model_name: 'GLM-5.2 (max)',
    creator_name: 'Z.ai',
    integration_status: 'MODELGO',
    is_open_source: true,
    release_date: '2026-07-16',
    primary_metric: 'INTELLIGENCE_INDEX',
    primary_score: 52.6,
    cost_value: 0.4445,
    value_score: 27.0,
    output_tps: 55.38,
    end_to_end_latency_ms: 51940,
    usage_value: 2_403_806,
    usage_unit: 'TOKENS',
    ...over,
  }
}

describe('业务类型映射', () => {
  it('九个 modality|task 组合全部有对应类型', () => {
    expect(Object.keys(MODALITY_TASK_TO_TYPE)).toHaveLength(9)
    for (const [modality, task] of ALL_TASKS) {
      expect(discoveryTypeFor(modality as never, task)).toBeTruthy()
    }
  })

  it('映射到九种互不相同的业务类型', () => {
    expect(new Set(Object.values(MODALITY_TASK_TO_TYPE)).size).toBe(9)
  })

  it('语言三类与媒体六类分得开', () => {
    expect(isLanguageType('TEXT_CHAT')).toBe(true)
    expect(isLanguageType('CODE_GENERATION')).toBe(true)
    expect(isLanguageType('AGENT')).toBe(true)
    expect(isLanguageType('TTS')).toBe(false)
    expect(isLanguageType('TEXT_TO_IMAGE')).toBe(false)
  })
})

describe('空值一律转「—」，不补 0', () => {
  it('数值字段为 null 时给「—」', () => {
    expect(compactAmount(null)).toBe(EMPTY)
    expect(formatPrice(null, 'TEXT_CHAT')).toBe(EMPTY)
    expect(formatScore({ primary_score: null, primary_metric: 'ELO' })).toBe(EMPTY)
  })

  it('缺速度的模型不会被写成 0 tok/s', () => {
    const model = toPrototypeModel(card({ output_tps: null }), 'TEXT_CHAT')
    expect(model.performance).toBe(EMPTY)
    expect(model.performance).not.toContain('0')
  })

  it('用量为 0 是真实的 0，不是缺数据', () => {
    expect(compactAmount(0)).toBe('0')
  })
})

describe('质量分按指标口径格式化', () => {
  it('指数保留 1 位小数', () => {
    expect(formatScore({ primary_score: 52.6, primary_metric: 'INTELLIGENCE_INDEX' })).toBe('52.6')
  })

  it('Elo 取整', () => {
    expect(formatScore({ primary_score: 1370, primary_metric: 'ELO' })).toBe('1370')
  })

  it('STT 的 WER 带百分号', () => {
    expect(formatScore({ primary_score: 5.6, primary_metric: 'AA_WER' })).toBe('5.6%')
  })
})

describe('模型卡转换', () => {
  it('MODELGO 已接入才给 id（能跳详情）', () => {
    expect(toPrototypeModel(card(), 'TEXT_CHAT').id).toBe('glm-5-2')
    expect(toPrototypeModel(card({ integration_status: 'MODELGO_AI' }), 'TEXT_CHAT').id).toBeUndefined()
    expect(toPrototypeModel(card({ integration_status: 'MODELGO_AI' }), 'TEXT_CHAT').supported).toBe(false)
  })

  it('modelgo_id 为空时不给 id，避免点出 404', () => {
    expect(toPrototypeModel(card({ modelgo_id: null }), 'TEXT_CHAT').id).toBeUndefined()
  })

  it('语言类型的 performance 是输出 TPS', () => {
    expect(toPrototypeModel(card(), 'TEXT_CHAT').performance).toBe('55 tok/s')
  })

  it('媒体类型没有速度指标，performance 承载 API 价格（PRD 73cbb28）', () => {
    const model = toPrototypeModel(card({ primary_metric: 'ELO', primary_score: 1370, cost_value: 2.25 }), 'TEXT_TO_IMAGE')
    expect(model.performance).toBe('$2.25/1K 张')
    expect(model.performance).toBe(model.price)
  })
})

describe('总览卡', () => {
  it('highlight 为 null 时保留卡位、展示空态', () => {
    const overview = {
      snapshot_date: '2026-09-02',
      type: 'TEXT_TO_IMAGE',
      highlights: {
        highest_score: null,
        highest_open_source_score: null,
        highest_value: null,
        lowest_price: null,
        highest_output_tps: null,
        highest_usage: null,
      },
    } as unknown as DiscoveryOverview

    const cards = toSummaryCards(overview, 'TEXT_TO_IMAGE')
    expect(cards).toHaveLength(5)
    expect(cards.every((c) => c.value === EMPTY)).toBe(true)
  })

  it('卡片数量与顺序按业务类型固定，不随数据有无变化', () => {
    expect(toSummaryCards(undefined, 'TEXT_CHAT')).toHaveLength(5)
    expect(toSummaryCards(undefined, 'TTS')).toHaveLength(4)
    // STT 不计算性价比（产品口径），少一张卡
    expect(toSummaryCards(undefined, 'STT')).toHaveLength(3)
    expect(toSummaryCards(undefined, 'STT').map((c) => c.label)).not.toContain('性价比最高')
  })

  it('厂商取 highlight 自带的 creator_name，不从本地列表反查', () => {
    const overview = {
      snapshot_date: '2026-09-02',
      type: 'AGENT',
      highlights: {
        highest_score: {
          metric: 'AGENTIC_INDEX',
          value: 61.3,
          model: { model_name: 'Claude Fable 5.1', creator_name: 'Anthropic' },
        },
      },
    } as unknown as DiscoveryOverview
    expect(toSummaryCards(overview, 'AGENT')[0].provider).toBe('Anthropic')
  })

  it('语言类展示速度卡，媒体类换成价格卡', () => {
    const text = toSummaryCards(undefined, 'TEXT_CHAT').map((c) => c.label)
    const image = toSummaryCards(undefined, 'TEXT_TO_IMAGE').map((c) => c.label)
    expect(text).toContain('输出速度最快')
    expect(text).not.toContain('API 价格最低')
    expect(image).toContain('API 价格最低')
    expect(image).not.toContain('输出速度最快')
  })
})
