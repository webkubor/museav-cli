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
  detailTarget,
  integratedSiteOf,
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
  defaultScatterSelection,
  specialtyMetricFor,
  filterVendors,
} from './discovery-data'
import type { PrototypeModel } from './discovery-data'
import type { DiscoveryOverview, DiscoveryRankingItem } from '@/types'

/**
 * data 层现在接收 t（文案随语言变，见 discovery-data.ts 的 TFn 注释）。
 * 测试要断言的是取数与格式化逻辑，不是翻译本身，所以直接喂真实的 zh 文案表。
 */
import zhDiscovery from '@/locales/zh/modelsDiscovery.json'
const t = (key: string, options?: Record<string, unknown>) => {
  const raw = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], { modelsDiscovery: zhDiscovery.modelsDiscovery })
  if (typeof raw !== 'string') return key
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ''))
}


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
    is_integrated: true,
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
    expect(formatPrice(t, null, 'TEXT_CHAT')).toBe(EMPTY)
    expect(formatScore({ primary_score: null, primary_metric: 'ELO' })).toBe(EMPTY)
  })

  it('缺速度的模型不会被写成 0 tok/s', () => {
    const model = toPrototypeModel(t, card({ output_tps: null }), 'TEXT_CHAT')
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
  it('id 与接入态解耦：有 modelgo_id 就带上，接入态另看 is_integrated', () => {
    expect(toPrototypeModel(t, card(), 'TEXT_CHAT').id).toBe('glm-5-2')
    // 境外厂商但我们上架了：照样给 id（原先按国别判会误判成不可跳）
    expect(toPrototypeModel(t, card({ integration_status: 'MODELGO_AI' }), 'TEXT_CHAT').id).toBe('glm-5-2')
    expect(toPrototypeModel(t, card({ integration_status: 'MODELGO_AI' }), 'TEXT_CHAT').supported).toBe(true)
    // 未接入也给 id —— 详情页该能点开；接入态照旧为 false，两件事分开
    // （owner 2026-09-08：「点击看到的应该是模型详情的页面」）
    const notIntegrated = toPrototypeModel(t, card({ is_integrated: false }), 'TEXT_CHAT')
    expect(notIntegrated.id).toBe('glm-5-2')
    expect(notIntegrated.supported).toBe(false)
  })

  it('modelgo_id 为空时不给 id，避免点出 404', () => {
    expect(toPrototypeModel(t, card({ modelgo_id: null }), 'TEXT_CHAT').id).toBeUndefined()
  })

  it('语言类型的 performance 是输出 TPS', () => {
    expect(toPrototypeModel(t, card(), 'TEXT_CHAT').performance).toBe('55 tok/s')
  })

  it('媒体类型没有速度指标，performance 承载 API 价格（PRD 73cbb28）', () => {
    const model = toPrototypeModel(t, card({ primary_metric: 'ELO', primary_score: 1370, cost_value: 2.25 }), 'TEXT_TO_IMAGE')
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

    const cards = toSummaryCards(t, overview, 'TEXT_TO_IMAGE')
    expect(cards).toHaveLength(5)
    // 卡位保留但标记成空态；**不再拿 '—' 去填模型名和数值**——灰圆点加两条短横
    // 看着像没加载完的骨架屏，渲染侧要据此走「暂无数据」分支。
    expect(cards.every((c) => c.empty)).toBe(true)
    expect(cards.every((c) => c.model === '' && c.value === '')).toBe(true)
    expect(cards.map((c) => c.label)).toContain('性价比最高')
  })

  it('卡片数量与顺序按业务类型固定，不随数据有无变化', () => {
    expect(toSummaryCards(t, undefined, 'TEXT_CHAT')).toHaveLength(5)
    expect(toSummaryCards(t, undefined, 'TTS')).toHaveLength(4)
    // STT 不计算性价比（产品口径），少一张卡
    expect(toSummaryCards(t, undefined, 'STT')).toHaveLength(3)
    expect(toSummaryCards(t, undefined, 'STT').map((c) => c.label)).not.toContain('性价比最高')
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
    expect(toSummaryCards(t, overview, 'AGENT')[0].provider).toBe('Anthropic')
  })

  it('语言类展示速度卡，媒体类换成价格卡', () => {
    const text = toSummaryCards(t, undefined, 'TEXT_CHAT').map((c) => c.label)
    const image = toSummaryCards(t, undefined, 'TEXT_TO_IMAGE').map((c) => c.label)
    // 文案照原型：「输出 TPS 最高」。此前实现写成「输出速度最快」，这条断言把它固化了
    expect(text).toContain('输出 TPS 最高')
    expect(text).not.toContain('API 价格最低')
    expect(image).toContain('API 价格最低')
    expect(image).not.toContain('输出 TPS 最高')
  })

  it('总览卡文案按 type 分歧，不共用一个常量', () => {
    const first = (type: Parameters<typeof toSummaryCards>[2]) => toSummaryCards(t, undefined, type)[0].label
    // STT 的主指标是 AA-WER，越低越好 —— 说成「最高」就是把指标方向讲反了
    expect(first('STT')).toBe('识别错误率最低')
    expect(first('TTS')).toBe('语音质量最高')
    expect(first('TEXT_TO_IMAGE')).toBe('Elo 评分最高')
    expect(first('AGENT')).toBe('综合评分最高')
    // 开源卡在媒体类是「开源模型 Elo 最高」，语言类是「开源模型评分最高」
    const imageLabels = toSummaryCards(t, undefined, 'TEXT_TO_IMAGE').map((c) => c.label)
    expect(imageLabels).toContain('开源模型 Elo 最高')
  })

  it('性价比与价格的单位带计价载体，不统一成 USD', () => {
    // 单位只在拿到 highlight 数据时才填（无数据整卡是「—」），所以要造带值的 overview
    const withValue = (type: Parameters<typeof toSummaryCards>[2]) => ({
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
    const unitOf = (type: Parameters<typeof toSummaryCards>[2], label: string) =>
      toSummaryCards(t, withValue(type), type).find((c) => c.label === label)?.unit
    // 抹成 Elo / USD 会让图像与视频的性价比看起来同口径
    expect(unitOf('TEXT_TO_IMAGE', '性价比最高')).toBe('Elo / ($/1K 张)')
    expect(unitOf('TEXT_TO_VIDEO', '性价比最高')).toBe('Elo / ($/min)')
    expect(unitOf('STT', '识别错误率最低')).toBe('% AA-WER')
  })
})

describe('Top 5 进度条宽度', () => {
  const make = (name: string, score: number | null): PrototypeModel =>
    toPrototypeModel(t, card({ model_name: name, primary_score: score }), 'TEXT_CHAT')

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
    toPrototypeModel(t, card({ model_name: name, primary_score: score }), 'TEXT_CHAT')

  it('柱高用 min-max 归一化，窄值域也能拉开', () => {
    // 真实数据：61.3 / 59.8 / 57.1，按 value/max 算是 100%/97.6%/93.1%，肉眼等高。
    // 归一化后最高的占满、最低的留 28% 底线、中间的落在两者之间。
    const rows = specialtyRows('score', [make('A', 61.3), make('B', 59.8), make('C', 57.1)])
    const [lower, upper] = specialtyBarDomain(rows.map((row) => row.numeric))
    const height = (value: number) => (value - lower) / (upper - lower)
    expect(height(rows[0].numeric)).toBeCloseTo(1)
    expect(height(rows[2].numeric)).toBeCloseTo(0.28)
    expect(height(rows[1].numeric)).toBeGreaterThan(0.5)
    expect(height(rows[1].numeric)).toBeLessThan(0.8)
  })

  it('全部同值时给满格，不出现除零', () => {
    const rows = specialtyRows('score', [make('A', 50), make('B', 50)])
    const [lower, upper] = specialtyBarDomain(rows.map((row) => row.numeric))
    expect(lower).toBe(0)
    expect(upper).toBe(50)
  })

  it('没有任何数据时给一个安全值域，不返回 NaN/Infinity', () => {
    expect(specialtyBarDomain([])).toEqual([0, 1])
  })

  it('柱内标签保留货币符号与单位', () => {
    const rows = specialtyRows('price', [
      toPrototypeModel(t, card({ model_name: 'A', cost_value: 0.0656 }), 'TEXT_CHAT'),
    ])
    expect(rows[0].value).toBe('$0.0656/次')
    // 原型柱标签实测是 `$0.05` / `245 tok/s`。此前只取数字，理由是「单位写在副标题里」——
    // 但「近 7 日热度」这类卡的副标题根本没有量纲，柱上就只剩读不出单位的裸数字
    expect(rows[0].short).toBe('$0.0656/次')
  })

  it('紧凑数量后缀保留（50K 不能被切成 50）', () => {
    const rows = specialtyRows('usage', [
      toPrototypeModel(t, card({ model_name: 'A', usage_value: 50_000 }), 'TEXT_CHAT'),
    ])
    expect(rows[0].short).toBe('50K')
  })
})

describe('计费单价（不是成本构成拆解）', () => {
  const unit = 'USD_PER_1M_TOKENS'

  it('四档齐全时逐行列出，按输入/输出/缓存命中/缓存写入的顺序', () => {
    expect(unitPriceDetail(t, { unit, input_tokens: 10, output_tokens: 50, cache_hit_tokens: 0.25, cache_write_tokens: 12.5 }))
      .toBe('输入 $10/M tokens\n输出 $50/M tokens\n缓存命中 $0.25/M tokens\n缓存写入 $12.5/M tokens')
  })

  it('缺项直接不列，不补 0 —— 实测 TEXT_CHAT 前 100 名有 49 个缺 cache_write_tokens', () => {
    const detail = unitPriceDetail(t, { unit, input_tokens: 3, output_tokens: 15, cache_hit_tokens: 0.3, cache_write_tokens: null })
    expect(detail).toBe('输入 $3/M tokens\n输出 $15/M tokens\n缓存命中 $0.3/M tokens')
    expect(detail).not.toContain('缓存写入')
    expect(detail).not.toContain('$0/M')
  })

  it('价格真的是 0 时照常列出（0 是价格，不是缺失）', () => {
    expect(unitPriceDetail(t, { unit, input_tokens: 0, output_tokens: 0 })).toBe('输入 $0/M tokens\n输出 $0/M tokens')
  })

  it('整块缺失或四档全空时返回 undefined，调用方据此不挂 tooltip', () => {
    expect(unitPriceDetail(t, null)).toBeUndefined()
    expect(unitPriceDetail(t, undefined)).toBeUndefined()
    expect(unitPriceDetail(t, { unit })).toBeUndefined()
  })

  it('未知计价单位原样展示，不猜换算', () => {
    expect(unitPriceDetail(t, { unit: 'USD_PER_TASK', input_tokens: 2 })).toBe('输入 $2 USD_PER_TASK')
  })

  it('rankings 的 unit_prices 能经 toPrototypeModel 带到页面模型上', () => {
    const model = toPrototypeModel(t, 
      card({ unit_prices: { unit, input_tokens: 10, output_tokens: 50 } }),
      'TEXT_CHAT',
    )
    expect(unitPriceDetail(t, model.unitPrices)).toBe('输入 $10/M tokens\n输出 $50/M tokens')
  })

  it('媒体类型不下发该字段时页面模型上是 null', () => {
    expect(toPrototypeModel(t, card({}), 'TEXT_TO_IMAGE').unitPrices).toBeNull()
  })
})

describe('接入态只认 is_integrated', () => {
  it('is_integrated=true → supported，无论接在哪个站', () => {
    expect(toPrototypeModel(t, card({ is_integrated: true, integration_status: 'MODELGO_AI' }), 'TEXT_CHAT').supported).toBe(true)
    expect(toPrototypeModel(t, card({ is_integrated: true, integration_status: 'MODELGO' }), 'TEXT_CHAT').supported).toBe(true)
  })

  it('is_integrated=false → 不 supported，即使 integration_status 是 MODELGO（国产）', () => {
    // 这正是 qa#718 的病根：拿国别当接入态，把 161 个从未上架的国产模型标成已接入
    const model = toPrototypeModel(t, card({ is_integrated: false, integration_status: 'MODELGO' }), 'TEXT_CHAT')
    expect(model.supported).toBe(false)
    expect(model.integrationStatus).toBe('MODELGO')
  })

  it('字段缺失（后端旧版本）按未接入处理，不猜', () => {
    const item = { ...card(), is_integrated: undefined as unknown as boolean }
    expect(toPrototypeModel(t, item, 'TEXT_CHAT').supported).toBe(false)
  })

  it('国别原样带到页面模型上，供「ModelGo.ai 已接入」分支判断', () => {
    expect(toPrototypeModel(t, card({ integration_status: 'MODELGO_AI' }), 'TEXT_CHAT').integrationStatus).toBe('MODELGO_AI')
  })

  it('未接入的模型照样带 id —— 点击要能进详情页，不是静默点不动', () => {
    const m = toPrototypeModel(t, card({ is_integrated: false, modelgo_id: 'glm-5-2' }), 'TEXT_CHAT')
    expect(m.id).toBe('glm-5-2')
    expect(m.supported).toBe(false)
  })

  it('modelgo_id 真的为空时才没有 id —— 由点击处给提示，不静默', () => {
    expect(toPrototypeModel(t, card({ is_integrated: false, modelgo_id: null }), 'TEXT_CHAT').id).toBeUndefined()
  })
})

describe('成本为 null 不能渲染成 0（需求方#969 缺陷 1）', () => {
  it('cost_value=null → price 是「—」、raw.price 是 null', () => {
    const m = toPrototypeModel(t, card({ cost_value: null }), 'AGENT')
    expect(m.price).toBe(EMPTY)
    expect(m.raw.price).toBeNull()
  })

  it('cost_value=0 是真免费，与「没数据」必须区分', () => {
    const m = toPrototypeModel(t, card({ cost_value: 0 }), 'AGENT')
    expect(m.price).toBe('免费')
    expect(m.raw.price).toBe(0)
  })

  it('有值时 raw.price 保留原始数值，不是展示串', () => {
    const m = toPrototypeModel(t, card({ cost_value: 6.1169 }), 'AGENT')
    expect(m.raw.price).toBe(6.1169)
    expect(m.price).toBe('$6.1169/次')
  })
})

// 专项榜改成服务端排序后，kind → metric 的映射是唯一的接缝：映错就整张榜取错指标，
// 而页面上照样画得出柱子（数值来自另一个字段），肉眼很难发现。
describe('specialtyMetricFor', () => {
  it('语言类的价格榜按次计费，媒体类按量计费', () => {
    expect(specialtyMetricFor('price', 'TEXT_CHAT')).toBe('COST_PER_TASK')
    expect(specialtyMetricFor('price', 'AGENT')).toBe('COST_PER_TASK')
    expect(specialtyMetricFor('price', 'CODE_GENERATION')).toBe('COST_PER_TASK')
    expect(specialtyMetricFor('price', 'TEXT_TO_IMAGE')).toBe('API_PRICE')
    expect(specialtyMetricFor('price', 'TTS')).toBe('API_PRICE')
  })

  it('质量榜取该类型的主指标 —— STT 是越低越好的 AA_WER，方向归服务端', () => {
    expect(specialtyMetricFor('score', 'TEXT_CHAT')).toBe('INTELLIGENCE_INDEX')
    expect(specialtyMetricFor('score', 'AGENT')).toBe('AGENTIC_INDEX')
    expect(specialtyMetricFor('score', 'CODE_GENERATION')).toBe('CODING_INDEX')
    expect(specialtyMetricFor('score', 'TEXT_TO_IMAGE')).toBe('ELO')
    expect(specialtyMetricFor('score', 'TTS')).toBe('VOICE_ELO')
    expect(specialtyMetricFor('score', 'STT')).toBe('AA_WER')
  })

  it('用量、TPS、时延各对应自己的 metric', () => {
    expect(specialtyMetricFor('usage', 'TEXT_CHAT')).toBe('USAGE')
    expect(specialtyMetricFor('usage', 'STT')).toBe('USAGE')
    expect(specialtyMetricFor('tps', 'TEXT_CHAT')).toBe('OUTPUT_TPS')
    expect(specialtyMetricFor('latency', 'TEXT_CHAT')).toBe('END_TO_END_LATENCY')
  })

  it('该类型没有这张榜就返回 undefined —— 调用方据此不发请求', () => {
    // STT 的可排序指标只有 AA_WER / API_PRICE / USAGE，没有性价比与 TPS
    expect(specialtyMetricFor('value', 'STT')).toBeUndefined()
    expect(specialtyMetricFor('tps', 'STT')).toBeUndefined()
    expect(specialtyMetricFor('tps', 'TEXT_TO_IMAGE')).toBeUndefined()
    expect(specialtyMetricFor('latency', 'TTS')).toBeUndefined()
  })
})

describe('detailTarget（查看详情落点，integrated_site 三态，qa#727 / prd#1016）', () => {
  it('MODELGO（国内站接入）→ 站内详情', () => {
    expect(detailTarget({ id: 'kimi-k2.6', site: 'MODELGO' })).toBe('inside')
  })
  // prd#1016：原来 MODELGO_AI 也判 inside，可本站 catalog 里根本没有它，
  // 于是落到 no-id 弹「该模型尚未接入 ModelGo」—— 与行上「ModelGo.ai 已接入」
  // 的徽标自相矛盾，用户两句话都看见、还是进不去。
  it('MODELGO_AI（国外站接入）+ 有国际站 id → 新开页跳国际站', () => {
    expect(detailTarget({ id: '', site: 'MODELGO_AI', globalId: 'gpt-6-astra' })).toBe('global')
    // 站内 id 存在也一样走外站：它在本站 catalog 里查不到详情（qa#718）
    expect(detailTarget({ id: 'gpt-6-astra', site: 'MODELGO_AI', globalId: 'gpt-6-astra' })).toBe('global')
  })
  it('已接入但拿不到对应 id → no-id（提示，不静默）', () => {
    expect(detailTarget({ id: '', site: 'MODELGO' })).toBe('no-id')
    expect(detailTarget({ site: 'MODELGO_AI' })).toBe('no-id')
    expect(detailTarget({ site: 'MODELGO_AI', globalId: '' })).toBe('no-id')
  })
  it('NOT_INTEGRATED → disabled，即使境外厂商（qa#727：87 条不再按国别猜成已接入）', () => {
    expect(detailTarget({ id: 'gpt-5.4', site: 'NOT_INTEGRATED' })).toBe('disabled')
    expect(detailTarget({ id: '', site: 'NOT_INTEGRATED' })).toBe('disabled')
  })
})

describe('integratedSiteOf（三态判据，接口字段优先）', () => {
  it('接口下发 integrated_site 时一律以它为准', () => {
    expect(integratedSiteOf({ integratedSite: 'NOT_INTEGRATED', supported: true, domestic: false })).toBe('NOT_INTEGRATED')
    expect(integratedSiteOf({ integratedSite: 'MODELGO_AI', supported: true, domestic: true })).toBe('MODELGO_AI')
  })
  it('字段缺失时按后端同一条规则本地推导：未接入一律 NOT_INTEGRATED', () => {
    expect(integratedSiteOf({ supported: false, domestic: false })).toBe('NOT_INTEGRATED')
    expect(integratedSiteOf({ supported: true, domestic: true })).toBe('MODELGO')
    expect(integratedSiteOf({ integratedSite: null, supported: true, domestic: false })).toBe('MODELGO_AI')
  })
})

describe('散点图默认选中 = 专项榜四卡并集（qa#723）', () => {
  const cards = [
    [{ model: 'A' }, { model: 'B' }],
    [{ model: 'B' }, { model: 'C' }],
    [{ model: 'D' }],
  ]

  it('取各卡行的并集并去重', () => {
    expect(defaultScatterSelection(cards, ['A', 'B', 'C', 'D', 'E'])).toEqual(['A', 'B', 'C', 'D'])
  })

  it('rankings 与 model-options 名字对不上的直接跳过，不做模糊匹配', () => {
    // 实测差异：「DeepSeek V4 Pro (...)」vs「DeepSeek V4 Pro 0813 (...)」
    expect(defaultScatterSelection([[{ model: 'DeepSeek V4 Pro 0813' }, { model: 'A' }]], ['DeepSeek V4 Pro', 'A'])).toEqual(['A'])
  })

  it('并集为空（数据没到/全匹配不上）回退全选，不让散点图空白', () => {
    expect(defaultScatterSelection([], ['A', 'B'])).toEqual(['A', 'B'])
    expect(defaultScatterSelection([[{ model: 'X' }]], ['A', 'B'])).toEqual(['A', 'B'])
  })
})

describe('两条数据线的详情落点字段必须一致（prd#1066，同形状第三次）', () => {
  // 模型发现页有两条各自构造 model 对象的数据线：
  //   · rankings  → toPrototypeModel（列表 / Top5）
  //   · model-options → ModelDiscoveryPagePrototype 里的 chartCandidates（散点图）
  // 两边都自己挑字段，少挑一个就少一种行为，而且**不报错**：
  //   #1013 列表展示未接入 → #1016 点 gpt-6 astra 报错 → #1066 散点图点实心点进不去。
  // 三次都是同一个根因，前两次只修了当时那个入口。
  //
  // detailTarget 需要三样：id、site、globalId。少任何一样，MODELGO_AI 的模型
  // 都会落到 no-id 弹「尚未接入 ModelGo」，而徽标却按 integrated_site 显示成已接入。
  const DETAIL_FIELDS = ['id', 'integratedSite', 'globalModelId'] as const

  it('toPrototypeModel（rankings 线）产出全部落点字段', () => {
    const m = toPrototypeModel(
      (k: string) => k,
      {
        ...card({ is_integrated: true }),
        integrated_site: 'MODELGO_AI',
        market_model_ids: { global: 'claude-fable-5' },
      } as never,
      'TEXT_CHAT',
    )
    for (const f of DETAIL_FIELDS) {
      expect(f in m, `rankings 线缺字段 ${f} —— detailTarget 会算错落点`).toBe(true)
    }
    expect(m.globalModelId).toBe('claude-fable-5')
  })

  it('globalModelId 的口径：market_model_ids.global 优先，回落 source_slug', () => {
    const withBoth = toPrototypeModel((k: string) => k, {
      ...card({ is_integrated: true }),
      market_model_ids: { global: 'from-market-ids' },
      source_slug: 'from-slug',
    } as never, 'TEXT_CHAT')
    expect(withBoth.globalModelId).toBe('from-market-ids')

    const slugOnly = toPrototypeModel((k: string) => k, {
      ...card({ is_integrated: true }),
      market_model_ids: null,
      source_slug: 'from-slug',
    } as never, 'TEXT_CHAT')
    expect(slugOnly.globalModelId).toBe('from-slug')
  })

  it('MODELGO_AI + 有 globalId → global；缺 globalId 就退化成 no-id（#1066 的现象）', () => {
    // 这一对断言说明「为什么少一个字段就出 bug」：同样是国外站已接入的模型，
    // 带 globalId 能跳过去，不带就弹「尚未接入」——而徽标两种情况都显示已接入。
    expect(detailTarget({ id: 'x', site: 'MODELGO_AI', globalId: 'claude-fable-5' })).toBe('global')
    expect(detailTarget({ id: 'x', site: 'MODELGO_AI' })).toBe('no-id')
  })
})

describe('filterVendors（厂商筛选搜索，prd#1068）', () => {
  // 取真实厂商名：测试环境 model-options 实测 42 个，中英混排
  const VENDORS = ['Alibaba', 'Anthropic', 'DeepSeek', 'Google', 'Meta', 'MiniMax', 'OpenAI', 'Z AI', '智谱', '百川智能']

  it('空关键词返回全部 —— 退格清空必须立刻回到完整列表', () => {
    expect(filterVendors(VENDORS, '')).toEqual(VENDORS)
    expect(filterVendors(VENDORS, '   ')).toEqual(VENDORS)
  })

  it('大小写不敏感 —— 用户不会记得厂商名的大小写', () => {
    expect(filterVendors(VENDORS, 'alib')).toEqual(['Alibaba'])
    expect(filterVendors(VENDORS, 'ALIB')).toEqual(['Alibaba'])
    expect(filterVendors(VENDORS, 'openai')).toEqual(['OpenAI'])
  })

  it('带空格的厂商名能搜到（Z AI 这类）', () => {
    expect(filterVendors(VENDORS, 'z ai')).toEqual(['Z AI'])
    expect(filterVendors(VENDORS, 'Z AI')).toEqual(['Z AI'])
  })

  it('中文厂商名能搜到 —— 42 个里有中文名，漏了等于这几家搜不出来', () => {
    expect(filterVendors(VENDORS, '智谱')).toEqual(['智谱'])
    expect(filterVendors(VENDORS, '智能')).toEqual(['百川智能'])
  })

  it('两端空格被 trim —— 从别处复制厂商名常带空格', () => {
    expect(filterVendors(VENDORS, '  meta  ')).toEqual(['Meta'])
  })

  it('子串匹配，不只是前缀', () => {
    expect(filterVendors(VENDORS, 'seek')).toEqual(['DeepSeek'])
  })

  it('无匹配返回空数组（UI 据此显示「没有匹配的厂商」）', () => {
    expect(filterVendors(VENDORS, 'zzz-not-exist')).toEqual([])
  })

  it('返回新数组而非原引用 —— providers 是上游 memo 的结果，调用方若改返回值会污染它', () => {
    const src = [...VENDORS]
    // 空关键词是唯一会「原样返回」的分支，必须拷贝。
    // 只断言 src 没被改是不够的：直接 return vendors 时 src 同样没变，测不出来
    //（2026-09-18 变异测试发现的漏洞）。
    const out = filterVendors(src, '')
    expect(out).toEqual(src)
    expect(out).not.toBe(src)
    // 改返回值不应影响源数组
    out.push('注入的厂商')
    expect(src).toEqual(VENDORS)
  })
})
