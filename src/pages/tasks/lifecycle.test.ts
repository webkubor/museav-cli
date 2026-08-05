import { describe, expect, it } from 'vitest'

import { getSnapshotLifecycleEvents } from './lifecycle'

const t = (key: string) => ({
  'lifecycle.submitted': '已提交',
  'lifecycle.submittedNote': '任务创建',
  'lifecycle.queued': '排队中',
  'lifecycle.queuedNote': '等待 ModelGo 或上游调度',
  'lifecycle.running': '生成中',
  'lifecycle.runningNote': '生成进行中',
  'lifecycle.completed': '已完成',
  'lifecycle.completedNote': '产物可下载',
  'lifecycle.failed': '失败',
  'lifecycle.failedNote': '任务执行失败',
}[key] ?? key)

describe('getSnapshotLifecycleEvents', () => {
  it('renders ModelGo queue and upstream state snapshots in lifecycle order', () => {
    expect(getSnapshotLifecycleEvents({
      submitted: '2026-07-21T15:35:00.823Z',
      queued: '2026-07-21T15:35:00.900Z',
      running: '2026-07-21T15:35:01.290Z',
      succeeded: '2026-07-21T15:37:49.629Z',
    }, t)).toEqual([
      { time: '2026-07-21T15:35:00.823Z', label: '已提交', note: '任务创建', tone: 'brand' },
      { time: '2026-07-21T15:35:00.900Z', label: '排队中', note: '等待 ModelGo 或上游调度', tone: 'brand' },
      { time: '2026-07-21T15:35:01.290Z', label: '生成中', note: '生成进行中', tone: 'brand' },
      { time: '2026-07-21T15:37:49.629Z', label: '已完成', note: '产物可下载', tone: 'success' },
    ])
  })

  it('does not fabricate a lifecycle transition that has no snapshot', () => {
    expect(getSnapshotLifecycleEvents({
      submitted: '2026-07-21T15:35:00.823Z',
      queued: '2026-07-21T15:35:00.900Z',
      running: '2026-07-21T15:35:01.290Z',
    }, t).map((event) => event.label)).toEqual(['已提交', '排队中', '生成中'])
  })
})
