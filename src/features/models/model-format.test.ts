/**
 * 计价单位后缀单测。
 * 锚点：shared/modelgo_prd#675 —— 图片生成类模型（pricing.mode=per_call）应显示「/张」
 * 而非回落「/M」；后端已改用 mode/per_call_price 表达每张计价，price_unit 字段已废弃为 null。
 *
 * shared/modelgo_prd#686：视频/矩阵价走 price_tiers，卡片最多展示 4 档。
 */

import { afterAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { catalogCardReplacesGridWithTiers, priceTierLabel, priceTiersForCard, priceUnitSuffix } from './model-format'

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
