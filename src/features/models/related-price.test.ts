/**
 * 相关模型条价格视图（shared/modelgo_prd#861 前端半）。
 *
 * 钉住的是「与广场卡片同口径」这件事：媒体模型取 price_tiers 最高档、不显示上下文、
 * 划线只在原价确高于现价时出现；文本模型维持既有「¥输入 / ¥输出 每M」形态。
 * 用例数据取自 #861 正文与 #871 交付评论里的生产实测形状（Seedance / gemini 图片 /
 * seedream 按张 / glm 促销），不是自造的理想值。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { isRelatedMediaModel, relatedPriceView } from './related-price'
import type { CatalogRelatedModel } from '@/types'

function related(overrides: Partial<CatalogRelatedModel>): CatalogRelatedModel {
  return {
    id: 'm',
    model_id: 'm',
    name: 'M',
    vendor: 'V',
    context_length: 128000,
    input_price: '0',
    output_price: '0',
    currency: 'CNY',
    is_free: false,
    pricing_mode: 'token',
    per_call_price: '0',
    ...overrides,
  }
}

beforeAll(async () => {
  await i18n.changeLanguage('zh')
})
afterAll(async () => {
  await i18n.changeLanguage('zh')
})

describe('isRelatedMediaModel — 媒体判别', () => {
  it('输出含 video/image → 媒体；老契约没有 output_modalities → 文本（不误伤存量）', () => {
    expect(isRelatedMediaModel(related({ output_modalities: ['video'] }))).toBe(true)
    expect(isRelatedMediaModel(related({ output_modalities: ['text', 'image'] }))).toBe(true)
    expect(isRelatedMediaModel(related({ output_modalities: ['text'] }))).toBe(false)
    expect(isRelatedMediaModel(related({}))).toBe(false)
  })

  it('audio+text 的 omni 对话模型归文本（与卡片 resolveModelCategory 同细则）；纯 audio / transcription 归媒体', () => {
    expect(isRelatedMediaModel(related({ output_modalities: ['text', 'audio'] }))).toBe(false)
    expect(isRelatedMediaModel(related({ output_modalities: ['audio'] }))).toBe(true)
    expect(isRelatedMediaModel(related({ output_modalities: ['transcription'] }))).toBe(true)
  })

  it('per_call（按张）没有 output_modalities 也按媒体形态（#852 契约下老后端唯一判别位）', () => {
    expect(isRelatedMediaModel(related({ pricing_mode: 'per_call', per_call_price: '0.22' }))).toBe(true)
  })
})

describe('relatedPriceView — 媒体模型', () => {
  // doubao-seedance-2.0-mini（#861 正文）：output_price 是最低档 14，卡片主价格 = 最高档 23
  const seedanceMini = related({
    output_modalities: ['video'],
    input_price: '0',
    output_price: '14',
    price_unit: 'M',
    price_tiers: [
      { label: '文生视频 · 480P', price: '14', unit: 'M', bucket: 'video_tokens' },
      { label: '文生视频 · 720P', price: '18', unit: 'M', bucket: 'video_tokens' },
      { label: '文生视频 · 1080P', price: '23', unit: 'M', bucket: 'video_tokens' },
    ],
  })

  it('主价格 = price_tiers 最高档，不取 output_price 最低档；不显示上下文', () => {
    expect(relatedPriceView(seedanceMini, true)).toEqual({
      kind: 'primary', text: '¥23/M', strike: undefined, showContext: false,
    })
  })

  // prd#1010：cn 生产 GET /catalog/models/qwen-image-3.0/related 的真实形状 ——
  // 计量型价格（unit=image）的 input/output/per_call 三个标量价**全是 "0"**，
  // 价格只在 price_tiers 里。旧组件只读标量价，于是渲染成「—」。
  // 这条钉住：标量全 0 不等于未配价，媒体模型必须回落到 tiers 最高档。
  it('tiers 非空但三个标量价均为 0（按张计量型）→ 仍取最高档，不落到「—」', () => {
    const qwenImagePro = related({
      output_modalities: ['image'],
      input_price: '0',
      output_price: '0',
      per_call_price: '0',
      price_unit: '张',
      price_unit_en: 'image',
      price_tiers: [
        { label: '图片输入 · 1K', price: '0.02', unit: '张', bucket: 'image_input_1k' },
        { label: '图片输入 · 2K', price: '0.02', unit: '张', bucket: 'image_input_2k' },
        { label: '图片输出 · 1K', price: '0.25', unit: '张', bucket: 'image_output_1k' },
        { label: '图片输出 · 2K', price: '0.5', unit: '张', bucket: 'image_output_2k' },
      ],
    })
    expect(relatedPriceView(qwenImagePro, true)).toEqual({
      kind: 'primary', text: '¥0.5/张', strike: undefined, showContext: false,
    })
    // 标准版：最高档 = 输出 1K ¥0.18/张（本单验收标准第 2 条钉的数）
    expect(relatedPriceView(related({
      output_modalities: ['image'],
      input_price: '0', output_price: '0', per_call_price: '0',
      price_unit: '张',
      price_tiers: [
        { label: '图片输入 · 1K', price: '0.02', unit: '张', bucket: 'image_input_1k' },
        { label: '图片输出 · 1K', price: '0.18', unit: '张', bucket: 'image_output_1k' },
      ],
    }), true)).toEqual({ kind: 'primary', text: '¥0.18/张', strike: undefined, showContext: false })
  })

  it('档位单位跟档位走（秒 / 张），不依赖 unit 字面值判定（#861 期望 4）', () => {
    const h3 = related({
      output_modalities: ['video'],
      price_unit: '秒',
      price_tiers: [
        { label: '768P', label_en: '768P', price: '0.5', unit: '秒', unit_en: 's', bucket: 'video_seconds' },
        { label: '2K', label_en: '2K', price: '0.8', unit: '秒', unit_en: 's', bucket: 'video_seconds' },
      ],
    })
    expect(relatedPriceView(h3, true)).toMatchObject({ kind: 'primary', text: '¥0.8/秒', showContext: false })
  })

  it('英文站单位用 unit_en、货币符号跟 currency', async () => {
    await i18n.changeLanguage('en')
    const h3 = related({
      output_modalities: ['video'],
      currency: 'USD',
      price_tiers: [
        { label: '768P', label_en: '768P', price: '0.0721', unit: '秒', unit_en: 's', bucket: 'video_seconds' },
      ],
    })
    expect(relatedPriceView(h3, false)).toMatchObject({ kind: 'primary', text: '$0.0721/s' })
    await i18n.changeLanguage('zh')
  })

  it('矩阵促销：划线取主价那一档自己的 original_price，不取 promotion 的 token 侧原价（prd#863 ④）', () => {
    const promo = related({
      output_modalities: ['video'],
      output_price: '12.32',
      price_tiers: [
        { label: '480P', price: '12.32', original_price: '14', unit: 'M', bucket: 'video_tokens' },
        { label: '1080P', price: '20.24', original_price: '23', unit: 'M', bucket: 'video_tokens' },
      ],
      promotion: { free: false, original_output_per_1m: '14', discount_label: '限时88折' },
    })
    expect(relatedPriceView(promo, true)).toEqual({
      kind: 'primary', text: '¥20.24/M', strike: '¥23/M', showContext: false,
    })
  })

  it('无促销的媒体模型不带划线（负控：防「统一乘一遍」）', () => {
    expect(relatedPriceView(seedanceMini, true).kind === 'primary'
      && (relatedPriceView(seedanceMini, true) as { strike?: string }).strike).toBeUndefined()
  })

  it('per_call（按张）→ 每张价 /张，促销期取 input 侧折后现价并划线 per_call 原价（seedream 生产形状）', () => {
    const seedream = related({
      pricing_mode: 'per_call',
      output_modalities: ['image'],
      input_price: '0.165',
      output_price: '0',
      per_call_price: '0.22',
      promotion: { free: false, original_input_per_1m: '0.22', discount_label: '限时75折' },
    })
    expect(relatedPriceView(seedream, true)).toEqual({
      kind: 'primary', text: '¥0.165/张', strike: '¥0.22/张', showContext: false,
    })
  })

  it('只有 output_modalities 无 tiers 的按 token 媒体模型 → output 价 /M（#853「纯 token 无矩阵」支）', () => {
    expect(relatedPriceView(related({ output_modalities: ['video'], input_price: '20', output_price: '46' }), true))
      .toMatchObject({ kind: 'primary', text: '¥46/M', showContext: false })
  })

  it('媒体模型未配价 → none（渲染「—」），限免 → free；两者都不显示上下文', () => {
    expect(relatedPriceView(related({ output_modalities: ['image'] }), true)).toEqual({ kind: 'none', showContext: false })
    expect(relatedPriceView(related({ output_modalities: ['image'], is_free: true }), true)).toEqual({ kind: 'free', showContext: false })
  })
})

describe('relatedPriceView — 文本模型（既有形态不变）', () => {
  it('输入/输出两个数各带符号，显示上下文；折后现价直接用（#871 起后端已折）', () => {
    expect(relatedPriceView(related({ output_modalities: ['text'], input_price: '0.95', output_price: '1.9' }), true))
      .toEqual({ kind: 'pair', input: '¥0.95', output: '¥1.9', showContext: true })
  })

  it('输出为 0 的脏数据只给输入价；两侧都为 0 → none；限免 → free', () => {
    expect(relatedPriceView(related({ input_price: '2', output_price: '0' }), true))
      .toEqual({ kind: 'single', text: '¥2', showContext: true })
    expect(relatedPriceView(related({}), true)).toEqual({ kind: 'none', showContext: true })
    expect(relatedPriceView(related({ is_free: true }), true)).toEqual({ kind: 'free', showContext: true })
  })

  it('context_length 为 0 的文本模型不显示上下文', () => {
    expect(relatedPriceView(related({ context_length: 0, input_price: '1', output_price: '2' }), true).showContext).toBe(false)
  })
})
