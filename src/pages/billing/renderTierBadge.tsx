// ─── Render Helper for Referral Tiers ──────────────────────────────────────

export function renderTierBadge(tierName?: string) {
  if (!tierName) return <span className="text-mg-text-3">—</span>

  // 普通伙伴 / Partner
  if (tierName.includes('普通') || tierName.toLowerCase().includes('partner')) {
    return (
      <span className="text-xs font-bold text-mg-text-2 select-none">
        {tierName}
      </span>
    )
  }

  // 战略伙伴 / Strategic Partner
  if (tierName.includes('战略') || tierName.toLowerCase().includes('strategic')) {
    return (
      <span className="text-xs font-black text-amber-500 select-none">
        {tierName}
      </span>
    )
  }

  // 核心伙伴 / Core Partner 等默认主色
  return (
    <span className="text-xs font-extrabold text-brand-base select-none">
      {tierName}
    </span>
  )
}
