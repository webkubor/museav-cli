// ─── Render Helper for Referral Tiers ──────────────────────────────────────

import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusConfig } from '@/components/ui/StatusBadge'

const TIER_STATUS_MAP: Record<string, StatusConfig> = {
  partner: { label: '', variant: 'secondary' },
  strategic: { label: '', variant: 'warning' },
  core: { label: '', variant: 'default' },
}

function resolveTierKey(tierName: string): string {
  const lower = tierName.toLowerCase()
  if (tierName.includes('战略') || lower.includes('strategic')) return 'strategic'
  if (tierName.includes('普通') || lower.includes('partner')) return 'partner'
  return 'core'
}

export function renderTierBadge(tierName?: string) {
  if (!tierName) return <span className="text-mg-text-3">—</span>

  const key = resolveTierKey(tierName)
  const cfg = TIER_STATUS_MAP[key]
  return (
    <StatusBadge
      status={key}
      statusMap={{ [key]: { ...cfg, label: tierName } }}
    />
  )
}
