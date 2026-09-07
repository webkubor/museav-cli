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
  rankBarWidth,
  specialtyBarDomain,
  specialtyRows,
  toPrototypeModel,
  toSummaryCards,
  unitPriceDetail,
} from './discovery-data'
import type { PrototypeModel } from './discovery-data'
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
    // 文案照原型：「输出 TPS 最高」。此前实现写成「输出速度最快」，这条断言把它固化了
    expect(text).toContain('输出 TPS 最高')
    expect(text).not.toContain('API 价格最低')
    expect(image).toContain('API 价格最低')
    expect(image).not.toContain('输出 TPS 最高')
  })

  it('总览卡文案按 type 分歧，不共用一个常量', () => {
    const first = (type: Parameters<typeof toSummaryCards>[1]) => toSummaryCards(undefined, type)[0].label
    // STT 的主指标是 AA-WER，越低越好 —— 说成「最高」就是把指标方向讲反了
    expect(first('STT')).toBe('识别错误率最低')
    expect(first('TTS')).toBe('语音质量最高')
    expect(first('TEXT_TO_IMAGE')).toBe('Elo 评分最高')
    expect(first('AGENT')).toBe('综合评分最高')
    // 开源卡在媒体类是「开源模型 Elo 最高」，语言类是「开源模型评分最高」
    const imageLabels = toSummaryCards(undefined, 'TEXT_TO_IMAGE').map((c) => c.label)
    expect(imageLabels).toContain('开源模型 Elo 最高')
  })

  it('性价比与价格的单位带计价载体，不统一成 USD', () => {
    // 单位只在拿到 highlight 数据时才填（无数据整卡是「—」），所以要造带值的 overview
    const withValue = (type: Parameters<typeof toSummaryCards>[1]) => ({
      snapshot_date: '2026-09-02',
      type,
      highlights: {
        highest_score: { value: 1, model: { model_name: 'A', creator_name: 'X' } },
        highest_open_source_score: { value: 1, model: { model_name: 'A', creator_name: 'X' } },
        highest_value: { value: 1, model: { model_name: 'A', creator_name: 'X' } },
        lowest_price: { value: 1, model: { model_name: 'A', creator_name: 'X' } },
        highest_output_tps: { value: 1, model: { model_name: 'A', creator_name: 'X' } },
        highest_usage: { value: 1, model: { model_name: 'A', creator_name: 'X' } },
      },
    } as unknown as DiscoveryOverview)
    const unitOf = (type: Parameters<typeof toSummaryCards>[1], label: string) =>
      toSummaryCards(withValue(type), type).find((c) => c.label === label)?.unit
    // 抹成 Elo / USD 会让图像与视频的性价比看起来同口径
    expect(unitOf('TEXT_TO_IMAGE', '性价比最高')).toBe('Elo / ($/1K 张)')
    expect(unitOf('TEXT_TO_VIDEO', '性价比最高')).toBe('Elo / ($/min)')
    expect(unitOf('STT', '识别错误率最低')).toBe('% AA-WER')
  })
})

describe('Top 5 进度条宽度', () => {
  const make = (name: string, score: number | null): PrototypeModel =>
    toPrototypeModel(card({ model_name: name, primary_score: score }), 'TEXT_CHAT')

  it('与柱图同一把尺：带地板的 min-max，不是 value/max，更不是名次', () => {
    const models = [make('A', 100), make('B', 50), make('C', 25)]
    // 归一化后 1 / 0.333 / 0，再落到 [BAR_FLOOR, 1] = [0.28, 1]
    expect(rankBarWidth(models[0], models)).toBe(100)
    expect(rankBarWidth(models[1], models)).toBe(52)
    // 最短的一条保留地板长度，不缩成看不见的一个点
    expect(rankBarWidth(models[2], models)).toBe(28)
  })

  it('窄值域也能拉开 —— 这正是换掉 value/max 的原因', () => {
    // Agent Top 5 的真实分值。按 value/max 算是 100% / 97.6% / 95.8%，条长只差几个像素，
    // 而同一批数据在下面的柱图里落差清晰——同一页两套算法给出两种结论（2026-09-03）。
    const models = [make('A', 61.3), make('B', 59.8), make('C', 58.7)]
    const widths = models.map((m) => rankBarWidth(m, models))
    expect(widths[0]).toBe(100)
    expect(widths[2]).toBe(28)
    // 首尾拉开到 72 个百分点，肉眼能分辨
    expect(widths[0] - widths[2]).toBe(72)
  })

  it('全部同分时不画条 —— 没有差距就不显示差距（STT 那一堆 0 的情形）', () => {
    const models = [make('A', 0), make('B', 0), make('C', 0)]
    expect(models.every((m) => rankBarWidth(m, models, true) === 0)).toBe(true)
  })

  it('越低越好的指标，值越小条越长', () => {
    const models = [make('A', 2), make('B', 4), make('C', 8)]
    expect(rankBarWidth(models[0], models, true)).toBe(100)
    expect(rankBarWidth(models[1], models, true)).toBe(76)
    expect(rankBarWidth(models[2], models, true)).toBe(28)
  })

  it('无分值的模型不画条', () => {
    const models = [make('A', 100), make('B', null)]
    expect(rankBarWidth(models[1], models)).toBe(0)
  })
})

describe('专项榜柱图', () => {
  const make = (name: string, score: number | null): PrototypeModel =>
    toPrototypeModel(card({ model_name: name, primary_score: score }), 'TEXT_CHAT')

  it('柱高用 min-max 归一化，窄值域也能拉开', () => {
    // 真实数据：61.3 / 59.8 / 57.1，按 value/max 算是 100%/97.6%/93.1%，肉眼等高。
    // 归一化后最高的占满、最低的留 28% 底线、中间的落在两者之间。
    const rows = specialtyRows('综合评分', [make('A', 61.3), make('B', 59.8), make('C', 57.1)])
    const [lower, upper] = specialtyBarDomain(rows.map((row) => row.numeric))
    const height = (value: number) => (value - lower) / (upper - lower)
    expect(height(rows[0].numeric)).toBeCloseTo(1)
    expect(height(rows[2].numeric)).toBeCloseTo(0.28)
    expect(height(rows[1].numeric)).toBeGreaterThan(0.5)
    expect(height(rows[1].numeric)).toBeLessThan(0.8)
  })

  it('全部同值时给满格，不出现除零', () => {
    const rows = specialtyRows('综合评分', [make('A', 50), make('B', 50)])
    const [lower, upper] = specialtyBarDomain(rows.map((row) => row.numeric))
    expect(lower).toBe(0)
    expect(upper).toBe(50)
  })

  it('没有任何数据时给一个安全值域，不返回 NaN/Infinity', () => {
    expect(specialtyBarDomain([])).toEqual([0, 1])
  })

  it('柱内标签保留货币符号与单位', () => {
    const rows = specialtyRows('单次任务成本', [
      toPrototypeModel(card({ model_name: 'A', cost_value: 0.0656 }), 'TEXT_CHAT'),
    ])
    expect(rows[0].value).toBe('$0.0656/次')
    // 原型柱标签实测是 `$0.05` / `245 tok/s`。此前只取数字，理由是「单位写在副标题里」——
    // 但「近 7 日热度」这类卡的副标题根本没有量纲，柱上就只剩读不出单位的裸数字
    expect(rows[0].short).toBe('$0.0656/次')
  })

  it('紧凑数量后缀保留（50K 不能被切成 50）', () => {
    const rows = specialtyRows('近 7 日热度', [
      toPrototypeModel(card({ model_name: 'A', usage_value: 50_000 }), 'TEXT_CHAT'),
    ])
    expect(rows[0].short).toBe('50K')
  })
})

describe('单价构成明细', () => {
  const unit = 'USD_PER_1M_TOKENS'

  it('四档齐全时逐行列出，按输入/输出/缓存命中/缓存写入的顺序', () => {
    expect(unitPriceDetail({ unit, input_tokens: 10, output_tokens: 50, cache_hit_tokens: 0.25, cache_write_tokens: 12.5 }))
      .toBe('输入 $10/M tokens\n输出 $50/M tokens\n缓存命中 $0.25/M tokens\n缓存写入 $12.5/M tokens')
  })

  it('缺项直接不列，不补 0 —— 实测 TEXT_CHAT 前 100 名有 49 个缺 cache_write_tokens', () => {
    const detail = unitPriceDetail({ unit, input_tokens: 3, output_tokens: 15, cache_hit_tokens: 0.3, cache_write_tokens: null })
    expect(detail).toBe('输入 $3/M tokens\n输出 $15/M tokens\n缓存命中 $0.3/M tokens')
    expect(detail).not.toContain('缓存写入')
    expect(detail).not.toContain('$0/M')
  })

  it('价格真的是 0 时照常列出（0 是价格，不是缺失）', () => {
    expect(unitPriceDetail({ unit, input_tokens: 0, output_tokens: 0 })).toBe('输入 $0/M tokens\n输出 $0/M tokens')
  })

  it('整块缺失或四档全空时返回 undefined，调用方据此不挂 tooltip', () => {
    expect(unitPriceDetail(null)).toBeUndefined()
    expect(unitPriceDetail(undefined)).toBeUndefined()
    expect(unitPriceDetail({ unit })).toBeUndefined()
  })

  it('未知计价单位原样展示，不猜换算', () => {
    expect(unitPriceDetail({ unit: 'USD_PER_TASK', input_tokens: 2 })).toBe('输入 $2 USD_PER_TASK')
  })

  it('rankings 的 unit_prices 能经 toPrototypeModel 带到页面模型上', () => {
    const model = toPrototypeModel(
      card({ unit_prices: { unit, input_tokens: 10, output_tokens: 50 } }),
      'TEXT_CHAT',
    )
    expect(unitPriceDetail(model.unitPrices)).toBe('输入 $10/M tokens\n输出 $50/M tokens')
  })

  it('媒体类型不下发该字段时页面模型上是 null', () => {
    expect(toPrototypeModel(card({}), 'TEXT_TO_IMAGE').unitPrices).toBeNull()
  })
})

describe('成本为 null 不能渲染成 0（需求方#969 缺陷 1）', () => {
  it('cost_value=null → price 是「—」、raw.price 是 null', () => {
    const m = toPrototypeModel(card({ cost_value: null }), 'AGENT')
    expect(m.price).toBe(EMPTY)
    expect(m.raw.price).toBeNull()
  })

  it('cost_value=0 是真免费，与「没数据」必须区分', () => {
    const m = toPrototypeModel(card({ cost_value: 0 }), 'AGENT')
    expect(m.price).toBe('免费')
    expect(m.raw.price).toBe(0)
  })

  it('有值时 raw.price 保留原始数值，不是展示串', () => {
    const m = toPrototypeModel(card({ cost_value: 6.1169 }), 'AGENT')
    expect(m.raw.price).toBe(6.1169)
    expect(m.price).toBe('$6.1169/次')
  })
})
