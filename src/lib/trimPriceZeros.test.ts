import { describe, it, expect } from 'vitest'
import { trimPriceZeros } from '@/lib/utils'

describe('trimPriceZeros', () => {
  it('裁掉后端 NUMERIC 的尾随零', () => {
    expect(trimPriceZeros('30.000000000000')).toBe('30')
    expect(trimPriceZeros('7.200000000000')).toBe('7.2')
    expect(trimPriceZeros('0.140000000000')).toBe('0.14')
    expect(trimPriceZeros('12.5')).toBe('12.5')
  })
  it('不改写整数与无小数值', () => {
    expect(trimPriceZeros('30')).toBe('30')
    expect(trimPriceZeros(10)).toBe('10')
  })
  it('不做四舍五入 —— 价格不能被前端改写', () => {
    expect(trimPriceZeros('7.256789')).toBe('7.256789')
    expect(trimPriceZeros('0.000001')).toBe('0.000001')
  })
  it('全零小数退化为整数而非空串', () => {
    expect(trimPriceZeros('0.000')).toBe('0')
  })
})
