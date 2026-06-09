// ─── Format Balance Helper ────────────────────────────────────────────────

export function formatBalance(amountStr: string | undefined): { main: string; exact: string } {
  if (!amountStr) return { main: '0.00', exact: '0.00' }
  const num = parseFloat(amountStr)
  if (isNaN(num)) return { main: '0.00', exact: '0.00' }

  // Format with thousands separator and exactly 2 decimals
  const mainVal = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // High precision exact value (trim redundant trailing zeros if dot exists)
  let exactVal = amountStr
  if (exactVal.includes('.')) {
    exactVal = exactVal.replace(/0+$/, '').replace(/\.$/, '')
  }
  return { main: mainVal, exact: exactVal }
}
