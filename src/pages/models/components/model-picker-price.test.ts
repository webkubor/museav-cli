import { describe, it, expect } from 'vitest'
import { priceLabel } from './model-picker-price'
import type { CatalogModelItem } from '@/types'
import '@/i18n'

/** prd#851 复验时发现：选择模型弹窗把 per_call 模型的每张价套 token 单位，
 *  显示成「¥0.05/1M tokens」。构造最小模型对象只给价格相关字段。 */
function m(pricing: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { id: 'x', model_id: 'x', name: 'x', pricing, ...extra } as unknown as CatalogModelItem
}

describe('ModelPickerDialog priceLabel per_call 口径（prd#851 同族）', () => {
  it('per_call：输入侧显示单张价 + /张，不再是 /1M tokens', () => {
    const model = m({ mode: 'per_call', per_call_price: '0.05', input_per_1m: '0.05', output_per_1m: '0', currency: 'CNY' })
    expect(priceLabel(model, 'input')).toBe('¥0.05/张')
  })

  it('per_call：输出侧显示 —（按张计价没有输出价）', () => {
    const model = m({ mode: 'per_call', per_call_price: '0.05', input_per_1m: '0.05', output_per_1m: '0', currency: 'CNY' })
    expect(priceLabel(model, 'output')).toBe('—')
  })

  it('per_call：per_call_price 缺失回落 input_per_1m 镜像', () => {
    expect(priceLabel(m({ mode: 'per_call', input_per_1m: '0.22', currency: 'CNY' }))).toBe('¥0.22/张')
  })

  it('per_call：单价为 0 显示 —（未配价不算免费，qa#624 口径）', () => {
    expect(priceLabel(m({ mode: 'per_call', per_call_price: '0', input_per_1m: '0', currency: 'CNY' }))).toBe('—')
  })

  it('token：行为不变，仍是 ¥价格/1M tokens', () => {
    expect(priceLabel(m({ mode: 'token', input_per_1m: '6.5', output_per_1m: '27', currency: 'CNY' }))).toBe('¥6.5/1M tokens')
    expect(priceLabel(m({ mode: 'token', input_per_1m: '6.5', output_per_1m: '27', currency: 'CNY' }), 'output')).toBe('¥27/1M tokens')
  })
})
