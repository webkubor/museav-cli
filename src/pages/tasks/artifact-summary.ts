import type { TaskRequestSummary } from '@/types/tasks'

/** Returns only the display-safe prompt summary that the backend allowed us to show. */
export function artifactSummary(summary?: TaskRequestSummary): string | null {
  if (summary?.redaction_state === 'not_captured') return null
  return summary?.prompt?.trim() || null
}
