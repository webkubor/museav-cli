// Budget amount contract, mirrored from the backend (qa#156):
// plain positive decimal, at most 12 integer digits (NUMERIC(24,12) capacity)
// and 2 fraction digits, no sign / exponent. Anything else either mutates
// inside NUMERIC (rounding, 1e5 normalization) or is rejected upstream, so the
// input value would not be the stored value.
export const BUDGET_AMOUNT_RE = /^(0|[1-9]\d{0,11})(\.\d{1,2})?$/

export function isValidBudgetAmount(s: string): boolean {
  return BUDGET_AMOUNT_RE.test(s) && Number(s) > 0
}

// NUMERIC(24,12)::text pads to fixed scale ("100" comes back as
// "100.000000000000"); trim it string-wise (no float round-trip) so the input
// echoes the exact saved value.
export function trimAmountScale(s: string): string {
  if (!s.includes('.')) return s
  return s.replace(/0+$/, '').replace(/\.$/, '')
}
