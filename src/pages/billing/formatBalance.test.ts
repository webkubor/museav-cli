import { describe, expect, it } from 'vitest'
import { calculateSpendableBalance, parseBalanceAmount } from './formatBalance'

describe('calculateSpendableBalance', () => {
  it('adds the available main, gift and reward buckets required by the PRD', () => {
    expect(calculateSpendableBalance('999998007.00', '1502.24', '0.31')).toBe(999999509.55)
  })

  it('uses available main balance instead of the unreserved main bucket', () => {
    expect(calculateSpendableBalance('80.00', '10.00', '5.00')).toBe(95)
  })

  it('does not present a partial total before every bucket is available', () => {
    expect(calculateSpendableBalance('80.00', undefined, '5.00')).toBeUndefined()
  })
})

describe('parseBalanceAmount', () => {
  it('parses numeric strings including negatives', () => {
    expect(parseBalanceAmount('0.00')).toBe(0)
    expect(parseBalanceAmount('-5.00')).toBe(-5)
  })

  it('returns undefined for missing or non-numeric input', () => {
    expect(parseBalanceAmount(undefined)).toBeUndefined()
    expect(parseBalanceAmount('')).toBeUndefined()
    expect(parseBalanceAmount('abc')).toBeUndefined()
  })
})
