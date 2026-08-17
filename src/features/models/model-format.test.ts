/**
 * 计价单位后缀单测。
 * 锚点：shared/modelgo_prd#675 —— 图片生成类模型（pricing.mode=per_call）应显示「/张」
 * 而非回落「/M」；后端已改用 mode/per_call_price 表达每张计价，price_unit 字段已废弃为 null。
 */

import { afterAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { priceUnitSuffix } from './model-format'

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
