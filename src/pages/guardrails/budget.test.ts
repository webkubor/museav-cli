import { describe, expect, it } from 'vitest'
import { BUDGET_AMOUNT_RE, isValidBudgetAmount, trimAmountScale } from './budget'

// Contract mirrored from the backend (qa/ai-quality-platform#156):
// plain positive decimal, <=12 integer digits, <=2 fraction digits, > 0.
// What the user types must be exactly what NUMERIC(24,12) stores.

describe('isValidBudgetAmount', () => {
  it.each([
    '1',
    '0.01',
    '123.45',
    '999999999999', // 12 integer digits — NUMERIC(24,12) capacity boundary
  ])('accepts %j', (input) => {
    expect(isValidBudgetAmount(input)).toBe(true)
  })

  it.each([
    ['0', 'zero — format-valid but not > 0'],
    ['0.00', 'zero with scale — format-valid but not > 0'],
    ['-5', 'negative sign'],
    ['1e5', 'exponent notation (NUMERIC would normalize it)'],
    ['1.234', 'three fraction digits (NUMERIC(…,2) would round it)'],
    ['', 'empty input'],
    ['abc', 'non-numeric'],
    ['1234567890123', '13 integer digits — over capacity'],
    ['01', 'leading zero'],
    ['.5', 'bare leading dot'],
    ['5.', 'trailing dot'],
  ])('rejects %j (%s)', (input) => {
    expect(isValidBudgetAmount(input)).toBe(false)
  })

  it('rejects zero through the > 0 guard even though the regex matches it', () => {
    // documents the two-stage check: format gate (regex) + positivity gate
    expect(BUDGET_AMOUNT_RE.test('0')).toBe(true)
    expect(BUDGET_AMOUNT_RE.test('0.00')).toBe(true)
    expect(isValidBudgetAmount('0')).toBe(false)
    expect(isValidBudgetAmount('0.00')).toBe(false)
  })
})

describe('trimAmountScale', () => {
  it.each([
    ['100.000000000000', '100'], // the qa#156 echo: NUMERIC(24,12)::text padding
    ['12.340000000000', '12.34'],
    ['100', '100'], // no dot — must NOT strip integer trailing zeros
    ['0.500000000000', '0.5'],
  ])('%j → %j', (input, expected) => {
    expect(trimAmountScale(input)).toBe(expected)
  })
})
