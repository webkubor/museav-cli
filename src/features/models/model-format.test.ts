/**
 * 计价单位后缀单测。
 * 锚点：shared/modelgo_prd#675 —— 图片生成类模型（pricing.mode=per_call）应显示「/张」
 * 而非回落「/M」；后端已改用 mode/per_call_price 表达每张计价，price_unit 字段已废弃为 null。
 *
 * shared/modelgo_prd#686：视频/矩阵价走 price_tiers，卡片最多展示 4 档。
 */

import { afterAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import {
  catalogCardReplacesGridWithTiers, priceTierLabel, priceTiersForCard, priceUnitSuffix, strikeOriginalPrice,
  pricingRuleGroups, hasPricingGradient, pricingRuleLabel, pricingRulePriceText, withPriceFrom,
  autoSummary, cardSummary, detailSummary, sortProtocols,
} from './model-format'

afterAll(async () => {
  await i18n.changeLanguage('zh')
})

describe('priceUnitSuffix — 计价单位后缀', () => {
  it('price_unit 缺省 → /M（对话模型每 1M token）', () => {
    expect(priceUnitSuffix(undefined)).toBe('/M')
    expect(priceUnitSuffix(undefined, 'token')).toBe('/M')
  })

  it('price_unit 枚举原样透传', () => {
    expect(priceUnitSuffix('张')).toBe('/张')
    expect(priceUnitSuffix('秒')).toBe('/秒')
  })

  it('mode=per_call（按张计价）→ 中文 /张', async () => {
    await i18n.changeLanguage('zh')
    expect(priceUnitSuffix(undefined, 'per_call')).toBe('/张')
  })

  it('mode=per_call（按张计价）→ 英文 /image', async () => {
    await i18n.changeLanguage('en')
    expect(priceUnitSuffix(undefined, 'per_call')).toBe('/image')
  })
})

describe('price_tiers — 视频/矩阵多档价', () => {
  const h3 = [
    { label: '768P', label_en: '768P', price: '0.50', unit: '秒', bucket: 'video_seconds' },
    { label: '2K', label_en: '2K', price: '0.80', unit: '秒', bucket: 'video_seconds' },
    { label: '图片输入', label_en: 'Image input', price: '0.20', unit: '张', bucket: 'image_input' },
  ]

  it('H3 三档原样返回', () => {
    expect(priceTiersForCard(h3)).toEqual(h3)
  })

  it('超过 4 档只留前 4（卡片空间）', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      label: `${i}`, label_en: `${i}`, price: `${i + 1}`, unit: '秒', bucket: 'video_seconds',
    }))
    expect(priceTiersForCard(six)).toHaveLength(4)
  })

  it('空/缺省 → 空数组', () => {
    expect(priceTiersForCard(undefined)).toEqual([])
    expect(priceTiersForCard([])).toEqual([])
  })

  it('中文用 label，英文优先 label_en', () => {
    expect(priceTierLabel(h3[2], true)).toBe('图片输入')
    expect(priceTierLabel(h3[2], false)).toBe('Image input')
  })
})

describe('catalogCardReplacesGridWithTiers — 纯媒体才用档位替换四格', () => {
  const h3 = [
    { label: '768P', label_en: '768P', price: '0.50', unit: '秒', bucket: 'video_seconds' },
  ]

  it('H3 文本输入/输出都是 0 → 卡片用档位替换四格', () => {
    expect(catalogCardReplacesGridWithTiers({ input_per_1m: '0', output_per_1m: '0' }, h3)).toBe(true)
  })

  it('混合模型（有文本 token 价 + 档位）→ 保留输入/输出四格', () => {
    expect(catalogCardReplacesGridWithTiers({ input_per_1m: '8', output_per_1m: '25' }, h3)).toBe(false)
  })

  it('只有输入价也算混合，不替换', () => {
    expect(catalogCardReplacesGridWithTiers({ input_per_1m: '8', output_per_1m: '0' }, h3)).toBe(false)
  })

  it('没有档位 → 不替换', () => {
    expect(catalogCardReplacesGridWithTiers({ input_per_1m: '0', output_per_1m: '0' }, [])).toBe(false)
  })
})

describe('strikeOriginalPrice — 划线原价的有效性守卫', () => {
  it('原价高于现价（原型 kimi-k2.6 口径）→ 划线', () => {
    expect(strikeOriginalPrice('5.6', '4.46')).toBe(5.6)
  })

  it('原价等于现价（线上 deepseek-v4-flash：3 / "3.0" 标限时95折）→ 不划线', () => {
    expect(strikeOriginalPrice('3.0', '3')).toBeNull()
  })

  it('原价为 0（线上 glm-5.1 / qwen3-max 等）→ 不划线，避免渲染出「划掉 ¥0」', () => {
    expect(strikeOriginalPrice('0', '6')).toBeNull()
  })

  it('原价缺省 / 非数值 → 不划线', () => {
    expect(strikeOriginalPrice(undefined, '6')).toBeNull()
    expect(strikeOriginalPrice('', '6')).toBeNull()
    expect(strikeOriginalPrice('abc', '6')).toBeNull()
  })

  it('限免（isFree）→ 现价即 0，正原价直接划线，不比大小', () => {
    expect(strikeOriginalPrice('3', '3', true)).toBe(3)
    expect(strikeOriginalPrice('0', '3', true)).toBeNull()
  })

  it('现价缺省 → 无从比较，不划线', () => {
    expect(strikeOriginalPrice('5', undefined)).toBeNull()
  })
})

/**
 * shared/modelgo_prd#800：上下文阶梯价 pricing_rules（与 price_tiers 媒体矩阵价是两套东西）。
 * 详情页按维度分组出「价格梯度」表，规格条/卡片一口价挂「起」。
 */
describe('pricing_rules — 上下文分档 / 峰时价（#800）', () => {
  const rules = [
    { dimension: 'peak_time', label: '09:00–12:00', start_time: '09:00', end_time: '12:00', timezone: 'Asia/Shanghai', mode: 'replace', input_per_1m: '6.72', output_per_1m: '26.88' },
    { dimension: 'context_length', label: '0–128K', label_en: '0–128K', min: 0, max: 128000, input_per_1m: '0.80', output_per_1m: '4.8' },
    { dimension: 'context_length', label: '256K以上', min: 256001, input_per_1m: '4', output_per_1m: '24' },
  ]

  it('按维度分组：context_length 在前、peak_time 在后，组内保持下发顺序', () => {
    const groups = pricingRuleGroups(rules)
    expect(groups.map((g) => g.dimension)).toEqual(['context_length', 'peak_time'])
    expect(groups[0].rules.map((r) => r.label)).toEqual(['0–128K', '256K以上'])
  })

  it('未知维度丢弃；全是未知维度 → 没有梯度', () => {
    const unknown = [{ dimension: 'image_spec', label: '1024×1024', input_per_1m: '1' }]
    expect(pricingRuleGroups(unknown)).toEqual([])
    expect(hasPricingGradient(unknown)).toBe(false)
    expect(hasPricingGradient(undefined)).toBe(false)
    expect(hasPricingGradient(rules)).toBe(true)
  })

  it('区间文案 label 优先，英文回落 label（256K以上 没配 label_en）', () => {
    expect(pricingRuleLabel(rules[1], true)).toBe('0–128K')
    expect(pricingRuleLabel(rules[2], false)).toBe('256K以上')
  })

  it('label 全缺才兜底拼：context 用 min/max，peak 用起止时间', () => {
    expect(pricingRuleLabel({ dimension: 'context_length', min: 128001, max: 256000 }, true)).toBe('128K–256K')
    expect(pricingRuleLabel({ dimension: 'context_length', min: 256001 }, true)).toBe('256K 以上')
    expect(pricingRuleLabel({ dimension: 'context_length', min: 256001 }, false)).toBe('256K+')
    expect(pricingRuleLabel({ dimension: 'peak_time', start_time: '09:00', end_time: '12:00' }, true)).toBe('09:00–12:00')
  })

  it('单元格价格与规格条同口径：符号 + 去尾零 + /unit（缺省 M）', () => {
    expect(pricingRulePriceText(rules[1], 'input', '¥')).toBe('¥0.8/M')
    expect(pricingRulePriceText(rules[0], 'output', '¥')).toBe('¥26.88/M')
    expect(pricingRulePriceText({ dimension: 'context_length', input_per_1m: '2', unit: 'M' }, 'output', '¥')).toBe('—')
  })

  it('mode=multiplier 无绝对价 → 展示 ×倍率', () => {
    expect(pricingRulePriceText({ dimension: 'peak_time', mode: 'multiplier', rate: '1.50' }, 'input', '¥')).toBe('×1.5')
  })

  it('「起」：中文缀在单位后、英文改 from 前缀；免费/未配价（unit 空）不挂', async () => {
    await i18n.changeLanguage('zh')
    expect(withPriceFrom({ value: '¥0.8', unit: '/M' }, true)).toEqual({ value: '¥0.8', unit: '/M 起' })
    expect(withPriceFrom({ value: '¥0.8', unit: '/M' }, false)).toEqual({ value: '¥0.8', unit: '/M' })
    expect(withPriceFrom({ value: '免费', unit: '' }, true)).toEqual({ value: '免费', unit: '' })
    await i18n.changeLanguage('en')
    expect(withPriceFrom({ value: '$ 0.8', unit: '/M' }, true)).toEqual({ value: 'from $ 0.8', unit: '/M' })
  })
})

/**
 * shared/modelgo_prd#820：广场卡片只读 tagline、不回落 description，而目录接口至今
 * 一个模型都没有 tagline（cn 生产 43/43 空、test 53 个全空），于是每张卡都渲染
 * autoSummary 的「详细简介待补充。」，点进详情又是真描述 —— 提单人看到的
 * 「广场与详情描述不一致」。这一组把两个位置的回落链钉住。
 */
describe('cardSummary / detailSummary — 简介回落链（prd#820）', () => {
  const base = { modalities: ['text'], context_length: 1_000_000 }

  it('卡片：tagline 缺失时回落 description，不再跳到「详细简介待补充。」', () => {
    const model = { ...base, description: 'DeepSeek V4 Flash 是面向低延迟与高吞吐场景的大语言模型。' }
    expect(cardSummary(model, 'DeepSeek', true)).toBe(model.description)
    expect(cardSummary(model, 'DeepSeek', true)).not.toContain('详细简介待补充')
  })

  it('卡片：tagline 有值时仍优先 tagline（PRD §9.1「卡片短描述」）', () => {
    const model = { ...base, tagline: '低延迟高吞吐', description: '很长的详情描述' }
    expect(cardSummary(model, 'DeepSeek', true)).toBe('低延迟高吞吐')
  })

  it('详情：description 优先，与卡片只差前两项顺序', () => {
    const model = { ...base, tagline: '低延迟高吞吐', description: '很长的详情描述' }
    expect(detailSummary(model, 'DeepSeek', true)).toBe('很长的详情描述')
    expect(cardSummary(model, 'DeepSeek', true)).not.toBe(detailSummary(model, 'DeepSeek', true))
  })

  it('两个字段都空 → 两处都落到同一句 autoSummary，卡片不再空一行', () => {
    const model = { ...base }
    const auto = autoSummary(model, 'DeepSeek', true)
    expect(cardSummary(model, 'DeepSeek', true)).toBe(auto)
    expect(detailSummary(model, 'DeepSeek', true)).toBe(auto)
    expect(auto).toContain('详细简介待补充')
  })

  it('纯空白的 tagline/description 当作没填（后端空值给空串，不是省略键）', () => {
    const model = { ...base, tagline: '   ', description: '\n ' }
    expect(cardSummary(model, 'DeepSeek', true)).toBe(autoSummary(model, 'DeepSeek', true))
    expect(detailSummary(model, 'DeepSeek', true)).toBe(autoSummary(model, 'DeepSeek', true))
  })

  it('线上真实形态：无 tagline + 有 description → 卡片与详情逐字相同（本单的验收点）', () => {
    const model = { ...base, description: 'DeepSeek V4 系列的效率型版本，响应更快。' }
    expect(cardSummary(model, 'DeepSeek', true)).toBe(detailSummary(model, 'DeepSeek', true))
  })
})

describe('sortProtocols — 协议展示统一顺序（QA：模型广场端点兼容顺序不一致）', () => {
  it('固定 openai → anthropic → other，不跟后端数组顺序走', () => {
    expect(sortProtocols(['other', 'anthropic', 'openai'])).toEqual(['openai', 'anthropic', 'other'])
    expect(sortProtocols(['anthropic', 'openai'])).toEqual(['openai', 'anthropic'])
  })

  it('native（api-code-samples 内部枚举）排在 anthropic 之后', () => {
    expect(sortProtocols(['native', 'openai', 'anthropic'])).toEqual(['openai', 'anthropic', 'native'])
  })

  it('未知值排最后且稳定；不修改入参数组', () => {
    const input = ['zzz', 'other', 'aaa']
    expect(sortProtocols(input)).toEqual(['other', 'zzz', 'aaa'])
    expect(input).toEqual(['zzz', 'other', 'aaa'])
  })

  it('空数组原样返回', () => {
    expect(sortProtocols([])).toEqual([])
  })
})
