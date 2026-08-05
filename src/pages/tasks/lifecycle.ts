import type { TaskStatusTimestamps } from '@/types/tasks'

export type LifecycleTone = 'brand' | 'success' | 'warning' | 'danger'

export interface SnapshotLifecycleEvent {
  time: string
  label: string
  note: string
  tone: LifecycleTone
}

const SNAPSHOT_STEPS: Array<{
  key: keyof TaskStatusTimestamps
  labelKey: string
  noteKey: string
  tone: LifecycleTone
}> = [
  { key: 'submitted', labelKey: 'lifecycle.submitted', noteKey: 'lifecycle.submittedNote', tone: 'brand' },
  { key: 'queued', labelKey: 'lifecycle.queued', noteKey: 'lifecycle.queuedNote', tone: 'brand' },
  { key: 'running', labelKey: 'lifecycle.running', noteKey: 'lifecycle.runningNote', tone: 'brand' },
  { key: 'succeeded', labelKey: 'lifecycle.completed', noteKey: 'lifecycle.completedNote', tone: 'success' },
  { key: 'failed', labelKey: 'lifecycle.failed', noteKey: 'lifecycle.failedNote', tone: 'danger' },
]

/**
 * 将后端持久化的状态快照映射为详情页时间线。只使用真实快照，避免为历史任务虚构中间状态。
 */
export function getSnapshotLifecycleEvents(statusTimestamps: TaskStatusTimestamps | undefined, t: (key: string) => string): SnapshotLifecycleEvent[] {
  if (!statusTimestamps) return []

  return SNAPSHOT_STEPS.flatMap((step) => {
    const time = statusTimestamps[step.key]
    return time ? [{ time, label: t(step.labelKey), note: t(step.noteKey), tone: step.tone }] : []
  })
}
