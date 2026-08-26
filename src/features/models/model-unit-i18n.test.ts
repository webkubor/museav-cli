/**
 * 计价单位的英文化。
 * 锚点：shared/modelgo_prd#857 腿 D —— 海外站档位文案已全英（`Text to video · 768P`），
 * 单位却仍是中文，渲染成 `$ 0.0735/秒`。后端对已知单位下发 `unit_en`，前端按语言取。
 */

import { afterAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { displayUnitText, priceTierUnit, priceUnitSuffix, mediaPrimaryPrice, pricingRulePriceText } from './model-format'
import type { CatalogPriceTier } from '@/types'

afterAll(async () => {
  await i18n.changeLanguage('zh')
})

const secondTier: CatalogPriceTier = {
  label: '文生视频 · 768P', label_en: 'Text to video · 768P',
  price: '0.0735', unit: '秒', unit_en: 's', bucket: 'video_seconds',
}

describe('displayUnitText — 单位随站点语言', () => {
  it('中文站用中文单位', async () => {
    await i18n.changeLanguage('zh')
    expect(displayUnitText('秒', 's')).toBe('秒')
    expect(priceTierUnit(secondTier)).toBe('秒')
  })

  it('英文站用 unit_en', async () => {
    await i18n.changeLanguage('en')
    expect(displayUnitText('秒', 's')).toBe('s')
    expect(priceTierUnit(secondTier)).toBe('s')
  })

  it('后端未下发 unit_en（未知单位）→ 回落中文，而不是猜一个英文出来', async () => {
    await i18n.changeLanguage('en')
    expect(displayUnitText('坤')).toBe('坤')
    expect(priceTierUnit({ ...secondTier, unit_en: undefined })).toBe('秒')
  })

  it('空单位不产出「/undefined」', () => {
    expect(displayUnitText(undefined, 's')).toBe('')
  })
})

describe('单位英文化贯穿各渲染口', () => {
  it('priceUnitSuffix 用 price_unit_en', async () => {
    await i18n.changeLanguage('en')
    expect(priceUnitSuffix('秒', 'token', 's')).toBe('/s')
    await i18n.changeLanguage('zh')
    expect(priceUnitSuffix('秒', 'token', 's')).toBe('/秒')
  })

  it('per_call 仍按语言硬翻（该形态后端不下发 price_unit）', async () => {
    await i18n.changeLanguage('en')
    expect(priceUnitSuffix(undefined, 'per_call')).toBe('/image')
    await i18n.changeLanguage('zh')
    expect(priceUnitSuffix(undefined, 'per_call')).toBe('/张')
  })

  it('主价格取最高档时，后缀与「计费单位」格都用英文单位', async () => {
    await i18n.changeLanguage('en')
    const got = mediaPrimaryPrice({}, '秒', [secondTier], 's')
    expect(got.unit).toBe('/s')
    expect(got.unitName).toBe('s')
  })

  it('梯度表单元格用英文单位', async () => {
    await i18n.changeLanguage('en')
    expect(pricingRulePriceText(
      { dimension: 'context_length', input_per_1m: '0.8', unit: 'M', unit_en: 'M' }, 'input', '$',
    )).toBe('$0.8/M')
  })
})
