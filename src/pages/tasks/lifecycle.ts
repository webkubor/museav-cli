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
  label: string
  note: string
  tone: LifecycleTone
}> = [
  { key: 'submitted', label: '已提交', note: '任务创建', tone: 'brand' },
  { key: 'queued', label: '排队中', note: '等待 ModelGo 或上游调度', tone: 'brand' },
  { key: 'running', label: '生成中', note: '生成进行中', tone: 'brand' },
  { key: 'succeeded', label: '已完成', note: '产物可下载', tone: 'success' },
  { key: 'failed', label: '失败', note: '任务执行失败', tone: 'danger' },
]

/**
 * 将后端持久化的状态快照映射为详情页时间线。只使用真实快照，避免为历史任务虚构中间状态。
 */
export function getSnapshotLifecycleEvents(statusTimestamps?: TaskStatusTimestamps): SnapshotLifecycleEvent[] {
  if (!statusTimestamps) return []

  return SNAPSHOT_STEPS.flatMap((step) => {
    const time = statusTimestamps[step.key]
    return time ? [{ time, label: step.label, note: step.note, tone: step.tone }] : []
  })
}
