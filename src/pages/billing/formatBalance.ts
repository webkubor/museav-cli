// ─── Format Balance Helper ────────────────────────────────────────────────

export function formatBalance(amountStr: string | undefined): { main: string; exact: string } {
  if (!amountStr) return { main: '—', exact: '—' }
  // 原样显示后端金额字符串，不舍入/截断/补零/加千分位；main 与 exact 一致。
  return { main: amountStr, exact: amountStr }
}
