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
  firstPositivePrice,
  catalogCardReplacesGridWithTiers, mediaPrimaryPrice, priceTierLabel, priceTierUnit, priceTiersForCard, priceUnitSuffix, strikeOriginalPrice,
  pricingRuleGroups, hasPricingGradient, pricingRuleLabel, pricingRulePriceText,
  pricingRuleStrikeText, pricingRuleSubLabel, pricingRulesHaveCacheRead, pricingRulesHaveSub,
  withPromotedRulePrices, withPriceFrom,
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

/**
 * 媒体模型「主价格」取值（需求方 2026-08-25 对齐原型 marketplacePrimaryPriceText）：
 * per_call 每张价 → pricing 的 output||input → price_tiers 首档 → 未配价 undefined。
 */
describe('mediaPrimaryPrice — 媒体模型主价格', () => {
  const tiers = [
    { label: '文生视频 · 720P · 含音频', price: '0.9', unit: '秒', bucket: 'video_seconds' },
    { label: '文生视频 · 1080P · 含音频', price: '1.5', unit: '秒', bucket: 'video_seconds' },
  ]

  it('per_call（按张）→ 每张价 + /张，unitName 从本地化后缀剥出', async () => {
    await i18n.changeLanguage('zh')
    expect(mediaPrimaryPrice({ mode: 'per_call', per_call_price: '0.05', input_per_1m: '0.05' }, undefined, []))
      .toEqual({ amount: '0.05', unit: '/张', unitName: '张' })
  })

  it('per_call 促销期折后现价在 input_per_1m、per_call_price 是折前原价 → 取较低正值（seedream 生产实测）', async () => {
    await i18n.changeLanguage('zh')
    // doubao-seedream-4.0：折后 0.13 在 input，per_call 留原价 0.2
    expect(mediaPrimaryPrice({ mode: 'per_call', per_call_price: '0.2', input_per_1m: '0.13' }, undefined, []).amount)
      .toBe('0.13')
    // 5.0-pro：后端未下发折后价，两侧同为 0.3 → 只能展示 0.3
    expect(mediaPrimaryPrice({ mode: 'per_call', per_call_price: '0.3', input_per_1m: '0.3' }, undefined, []).amount)
      .toBe('0.3')
    // 一侧为 "0"/缺失时取另一侧正值；全无正值 → undefined（渲染为 —）
    expect(mediaPrimaryPrice({ mode: 'per_call', per_call_price: '0', input_per_1m: '0.22' }, undefined, []).amount)
      .toBe('0.22')
    expect(mediaPrimaryPrice({ mode: 'per_call', per_call_price: '0', input_per_1m: '0' }, undefined, []).amount)
      .toBeUndefined()
  })

  it('有档位矩阵 → 取价格最高的一档，且优先于文本 token 价（gemini 图片产出 204 vs 文本 10.2）', () => {
    // 需求方 2026-08-25：主价格取最高档；tiers 是媒体产物价，pricing.* 只是文本侧分项
    expect(mediaPrimaryPrice({ mode: 'token', input_per_1m: '1.7', output_per_1m: '10.2' }, undefined, [
      { label: '图片输出', price: '204', unit: 'M', bucket: 'image_output' },
    ])).toEqual({ amount: '204', unit: '/M', unitName: 'M' })
    expect(mediaPrimaryPrice({ input_per_1m: '0', output_per_1m: '0' }, undefined, tiers))
      .toEqual({ amount: '1.5', unit: '/秒', unitName: '秒' })
  })

  it('按 token 计价且无矩阵的媒体模型 → output 优先，unitName M', () => {
    expect(mediaPrimaryPrice({ mode: 'token', input_per_1m: '20', output_per_1m: '46' }, undefined, []))
      .toEqual({ amount: '46', unit: '/M', unitName: 'M' })
  })

  it('token 计价（unit=M）+ 档位矩阵的视频模型（Seedance 实况）→ 取最高档 37，不取 output 的 22（prd#858）', () => {
    // doubao-seedance-2.0-fast：pricing.output_per_1m=22（最低档镜像），档位 文生视频37/图生视频37/视频生视频22
    // 线上卡片曾显示 ¥22/M（最低档）——主价格必须走档位最高档，与档位 unit 是 M 还是 秒/张 无关
    expect(mediaPrimaryPrice({ mode: 'token', input_per_1m: '0', output_per_1m: '22' }, undefined, [
      { label: '文生视频', price: '37', unit: 'M', bucket: 'video_t2v' },
      { label: '图生视频', price: '37', unit: 'M', bucket: 'video_i2v' },
      { label: '视频生视频', price: '22', unit: 'M', bucket: 'video_v2v' },
    ])).toEqual({ amount: '37', unit: '/M', unitName: 'M' })
  })

  it('未配价（全 0 且无档位）→ amount undefined，调用方渲染「—」', () => {
    expect(mediaPrimaryPrice({ input_per_1m: '0', output_per_1m: '0' }, undefined, []).amount).toBeUndefined()
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

  it('媒体主价的原价选值跳过 "0"：per_call 的 original_output 恒 "0"，折前价在 original_input（seedream 限时71折）', () => {
    expect(firstPositivePrice('0', '0.42', '0.3')).toBe('0.42')
    expect(firstPositivePrice('0', '0', undefined)).toBeUndefined()
    expect(firstPositivePrice(undefined, '', '2')).toBe('2')
    // 选出的折前价高于现价才划线；后端把 original 配成现价（#747 老问题）依旧不划
    expect(strikeOriginalPrice(firstPositivePrice('0', '0.3'), '0.3')).toBeNull()
    expect(strikeOriginalPrice(firstPositivePrice('0', '0.42'), '0.3')).toBe(0.42)
  })

  it('per_call 促销 original_* 缺发时，划线兜底到折前的 per_call_price（seedream-4.5 生产实测）', () => {
    // original_* 全 None，per_call_price=0.25 是折前价、现价 0.1875 在 input
    expect(strikeOriginalPrice(firstPositivePrice(undefined, undefined, undefined, '0.25'), '0.1875')).toBe(0.25)
    // 5.0-pro：兜底值 = 现价 → 守卫拦下，不划无意义的等值线
    expect(strikeOriginalPrice(firstPositivePrice('0', '0.3', '0.3', '0.3'), '0.3')).toBeNull()
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

  it('未知维度不丢弃：降级成组、排已知维度后，且照常算「有梯度」（prd#864 A3）', () => {
    const unknown = [{ dimension: 'output_length', label: '输出 ≥200', input_per_1m: '3', output_per_1m: '14' }]
    expect(pricingRuleGroups(unknown)).toEqual([{ dimension: 'output_length', rules: unknown }])
    expect(hasPricingGradient(unknown)).toBe(true)
    expect(hasPricingGradient(undefined)).toBe(false)
    expect(hasPricingGradient(rules)).toBe(true)
    // 已知维度在前，未知维度按首现顺序在后；无 dimension 的脏行仍丢弃
    const mixed = [...unknown, ...rules, { dimension: '', label: '没维度', input_per_1m: '1' }]
    expect(pricingRuleGroups(mixed).map((g) => g.dimension))
      .toEqual(['context_length', 'peak_time', 'output_length'])
  })

  it('梯度表缓存读取列：cache_read 取 cache_read_per_1m，缺省回落 —（prd#864 A1）', () => {
    expect(pricingRulePriceText({ dimension: 'context_length', cache_read_per_1m: '0.4' }, 'cache_read', '¥')).toBe('¥0.4/M')
    expect(pricingRulePriceText({ dimension: 'context_length', input_per_1m: '2' }, 'cache_read', '¥')).toBe('—')
    // multiplier 时段规则无绝对价 → 倍率对三列同义，照常展示 ×rate
    expect(pricingRulePriceText({ dimension: 'peak_time', mode: 'multiplier', rate: '1.2' }, 'cache_read', '¥')).toBe('×1.2')
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

  it('次级分档（#864）：sub_label 中英各走各的、英文回落中文，无 sub 返回 null', () => {
    const withSub = {
      dimension: 'context_length', label: '0–32K', min: 0, max: 31999,
      sub_dimension: 'output_length', sub_label: '输出 <200', sub_label_en: 'output <200',
      input_per_1m: '2', output_per_1m: '8',
    }
    expect(pricingRuleSubLabel(withSub, true)).toBe('输出 <200')
    expect(pricingRuleSubLabel(withSub, false)).toBe('output <200')
    expect(pricingRuleSubLabel({ ...withSub, sub_label_en: undefined }, false)).toBe('输出 <200')
    expect(pricingRuleSubLabel(rules[1], true)).toBeNull()
  })

  it('次级分档（#864）：组内任一行带 sub_label 才补「条件」列，纯主档组不加列', () => {
    const withSub = {
      dimension: 'context_length', label: '0–32K',
      sub_label: '输出 ≥200', input_per_1m: '3', output_per_1m: '14',
    }
    expect(pricingRulesHaveSub([...rules, withSub])).toBe(true)
    expect(pricingRulesHaveSub(rules)).toBe(false)
    // sub_label 缺但 sub_label_en 在（后端只发英文的脏数据）也算有
    expect(pricingRulesHaveSub([{ dimension: 'context_length', sub_label_en: 'output <200' }])).toBe(true)
  })

  it('梯度表划线折前价（#860 方案 2 / #867 字段）：原价>现价才划，缺失/等值/脏值不划', () => {
    const discounted = {
      dimension: 'context_length', label: '0–256K',
      input_per_1m: '1.6', output_per_1m: '6.4', cache_read_per_1m: '0.32',
      original_input_per_1m: '2', original_output_per_1m: '8', original_cache_read_per_1m: '0.4',
      unit: 'M',
    }
    expect(pricingRuleStrikeText(discounted, 'input', '¥')).toBe('¥2/M')
    expect(pricingRuleStrikeText(discounted, 'output', '¥')).toBe('¥8/M')
    expect(pricingRuleStrikeText(discounted, 'cache_read', '¥')).toBe('¥0.4/M')
    // 无促销档没有 original_* → 不划（存量模型维持现状）
    expect(pricingRuleStrikeText(rules[1], 'input', '¥')).toBeNull()
    // 原价 = 现价（5.0-pro 那类脏数据）→ #747 守卫拦下
    expect(pricingRuleStrikeText({ ...discounted, original_input_per_1m: '1.6' }, 'input', '¥')).toBeNull()
    // 原价 < 现价（通道错配回归，#863 的 2.0-mini 形态）→ 同样不划
    expect(pricingRuleStrikeText({ ...discounted, original_output_per_1m: '5' }, 'output', '¥')).toBeNull()
  })

  it('mode=multiplier 无绝对价 → 展示 ×倍率', () => {
    expect(pricingRulePriceText({ dimension: 'peak_time', mode: 'multiplier', rate: '1.50' }, 'input', '¥')).toBe('×1.5')
  })

  it('缓存读取列（#1000）：组内有真实缓存读取价才留列，倍率档/空值不留', () => {
    // 倍率档不下发 cache_read_per_1m —— 留着列会被「×倍率」兜底填成「缓存读取 ×2」
    expect(pricingRulesHaveCacheRead(rules)).toBe(false)
    expect(pricingRulesHaveCacheRead([{ dimension: 'peak_time', mode: 'multiplier', rate: '2' }])).toBe(false)
    expect(pricingRulesHaveCacheRead([{ dimension: 'context_length', cache_read_per_1m: '' }])).toBe(false)
    // 组内任一行有就留（glm-4.7 那种逐档不同的缓存读取价）
    expect(pricingRulesHaveCacheRead([...rules, { dimension: 'context_length', cache_read_per_1m: '0.4' }])).toBe(true)
    // 明确配 0（缓存读取免费）也是真实价，列要留
    expect(pricingRulesHaveCacheRead([{ dimension: 'context_length', cache_read_per_1m: '0' }])).toBe(true)
  })
})

/**
 * shared/modelgo_prd#1000：cn 生产 deepseek-v4-pro 挂「限时74折」，规格条按 #867
 * 口径显示 ¥3.33 起（划掉 ¥4.5），但峰时倍率档下发的是 `input_per_1m: "9"`
 * —— 折前价 4.5 × 倍率 2，档位表比规格条贵一截还没有划线。这一组钉住「倍率重新
 * 架在折后价上」与各条不该动的守卫。
 */
describe('withPromotedRulePrices — 倍率档补促销折后价（#1000）', () => {
  /** cn 生产 deepseek-v4-pro 实际下发形状（2026-09-11 实测） */
  const pricing = { input_per_1m: '3.33', output_per_1m: '9.99', cache_read_per_1m: '0.111', currency: 'CNY' }
  const promotion = {
    free: false,
    original_price: '4.5', original_input_per_1m: '4.5',
    original_output_per_1m: '13.5', original_cache_read_per_1m: '0.15',
    discount_label: '限时74折',
  }
  const peak = {
    dimension: 'peak_time', label: '09:00–12:00',
    input_per_1m: '9', output_per_1m: '27',
    start_time: '09:00', end_time: '12:00', timezone: 'Asia/Shanghai',
    mode: 'multiplier', rate: '2', unit: 'M',
  }

  it('倍率档：折后价 × 倍率为主价，原档位价降级成划线原价', () => {
    const [promoted] = withPromotedRulePrices([peak], pricing, promotion)
    expect(promoted.input_per_1m).toBe('6.66')
    expect(promoted.original_input_per_1m).toBe('9')
    expect(promoted.output_per_1m).toBe('19.98')
    expect(promoted.original_output_per_1m).toBe('27')
    // 渲染层拿到的就是与规格条同源的双价
    expect(pricingRulePriceText(promoted, 'input', '¥')).toBe('¥6.66/M')
    expect(pricingRuleStrikeText(promoted, 'input', '¥')).toBe('¥9/M')
  })

  it('档位没下发的 kind 不凭空造价：缓存读取该缺还是缺', () => {
    const [promoted] = withPromotedRulePrices([peak], pricing, promotion)
    expect(promoted.cache_read_per_1m).toBeUndefined()
    expect(promoted.original_cache_read_per_1m).toBeUndefined()
    expect(pricingRulesHaveCacheRead([promoted])).toBe(false)
  })

  it('无促销 / 限免 / 非倍率档 / 后端已算过 → 原样返回，不重复打折', () => {
    expect(withPromotedRulePrices([peak], pricing, undefined)[0]).toBe(peak)
    expect(withPromotedRulePrices([peak], pricing, { ...promotion, free: true })[0]).toBe(peak)
    // replace 档是后端给定的绝对价，不碰
    expect(withPromotedRulePrices([{ ...peak, mode: 'replace' }], pricing, promotion)[0].input_per_1m).toBe('9')
    // context_length 档后端已按 #867 下发折后价 + original_*，再打一次就双重折扣
    const backendDone = {
      dimension: 'context_length', label: '0–256K',
      input_per_1m: '1.5', original_input_per_1m: '2', mode: 'multiplier', rate: '2', unit: 'M',
    }
    expect(withPromotedRulePrices([backendDone], pricing, promotion)[0].input_per_1m).toBe('1.5')
  })

  it('脏数据守卫：倍率缺失/非正、促销原价 ≤ 现价、折后价不低于原档位价 → 都不改', () => {
    expect(withPromotedRulePrices([{ ...peak, rate: undefined }], pricing, promotion)[0].input_per_1m).toBe('9')
    expect(withPromotedRulePrices([{ ...peak, rate: '0' }], pricing, promotion)[0].input_per_1m).toBe('9')
    // 促销没落在这个 kind 上（原价 = 现价，#747 那批脏数据形态）
    const flat = { ...promotion, original_input_per_1m: '3.33' }
    expect(withPromotedRulePrices([peak], pricing, flat)[0].input_per_1m).toBe('9')
    // 折后价反而不低于原档位价 → 不渲染「原价 ≤ 现价」的自相矛盾划线
    expect(withPromotedRulePrices([{ ...peak, input_per_1m: '6' }], pricing, promotion)[0].input_per_1m).toBe('6')
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

describe('媒体主价与划线原价同源（shared/modelgo_prd#863 ④）', () => {
  const tiers = [
    { label: '文生视频', price: '20.24', original_price: '23', unit: 'M', bucket: 'output' },
    { label: '图生视频', price: '20.24', original_price: '23', unit: 'M', bucket: 'output' },
    { label: '视频生视频', price: '12.32', original_price: '14', unit: 'M', bucket: 'output' },
  ]

  it('主价取最高档时，折前价也取同一档', () => {
    const got = mediaPrimaryPrice({ output_per_1m: '12.32' }, 'M', tiers)
    expect(got.amount).toBe('20.24')
    expect(got.originalAmount).toBe('23')
  })

  it('同源的原价能通过划线守卫，token 侧的 14 则不能', () => {
    const got = mediaPrimaryPrice({ output_per_1m: '12.32' }, 'M', tiers)
    expect(strikeOriginalPrice(got.originalAmount, got.amount)).toBe(23)
    // 这是修复前的取值：promotion.original_output_per_1m
    expect(strikeOriginalPrice('14', got.amount)).toBeNull()
  })

  it('没有促销时不伪造划线', () => {
    const plain = tiers.map((t) => ({ label: t.label, price: t.price, unit: t.unit, bucket: t.bucket }))
    const got = mediaPrimaryPrice({ output_per_1m: '12.32' }, 'M', plain)
    expect(got.originalAmount).toBeUndefined()
  })
})

describe('英文站计价单位（shared/modelgo_prd#857 腿 D）', () => {
  it('中文站保持中文单位', async () => {
    await i18n.changeLanguage('zh')
    expect(priceUnitSuffix('秒', undefined, 's')).toBe('/秒')
    expect(priceTierUnit({ unit: '秒', unit_en: 's' })).toBe('秒')
  })

  it('英文站取 price_unit_en / unit_en', async () => {
    await i18n.changeLanguage('en')
    try {
      expect(priceUnitSuffix('秒', undefined, 's')).toBe('/s')
      expect(priceTierUnit({ unit: '秒', unit_en: 's' })).toBe('s')
      // 漏配英文单位时回落中文，而不是把价格整格吞掉
      expect(priceUnitSuffix('秒', undefined, undefined)).toBe('/秒')
      expect(priceTierUnit({ unit: '秒' })).toBe('秒')
      expect(mediaPrimaryPrice({ output_per_1m: '1' }, '秒', [], 's').unitName).toBe('s')
    } finally {
      await i18n.changeLanguage('zh')
    }
  })
})
