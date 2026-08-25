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
  it('最多保留 4 位小数并四舍五入', () => {
    expect(trimPriceZeros('0.073529411765')).toBe('0.0735')
    expect(trimPriceZeros('0.117647058824')).toBe('0.1176')
    expect(trimPriceZeros('7.256789')).toBe('7.2568')
    expect(trimPriceZeros('1.23455')).toBe('1.2346')
  })
  it('正确处理跨整数进位与小额价格', () => {
    expect(trimPriceZeros('999.99996')).toBe('1000')
    expect(trimPriceZeros('0.00005')).toBe('0.0001')
    expect(trimPriceZeros('0.000049')).toBe('0')
  })
  it('全零小数退化为整数而非空串', () => {
    expect(trimPriceZeros('0.000')).toBe('0')
  })
})
