/**
 * 任务产物模块的三个纯函数（PRD d5b0352 / d0ddb56）。
 *
 * 锁两件在真实数据上会出错的事：
 * 1. `artifact_state` 缺失或是没见过的取值时要落到「生成中」文案，不能渲染出空白
 * 2. 总耗时只在两个时间都有、且差值为正时显示 —— 任务还没结束、或后端只给了
 *    created_at 时不能显示「0ms」（那会被读成瞬间完成）
 */
import { describe, expect, it } from 'vitest'
import { artifactGuideKey, artifactTone, taskTotalDuration } from './task-artifact'

describe('任务产物引导文案', () => {
  it('四个已知状态各自映射', () => {
    expect(artifactGuideKey('available')).toBe('available')
    expect(artifactGuideKey('failed')).toBe('failed')
    expect(artifactGuideKey('expired')).toBe('expired')
    expect(artifactGuideKey('generating')).toBe('generating')
  })

  it('缺失或未知状态落到「生成中」，不留空文案', () => {
    expect(artifactGuideKey(null)).toBe('generating')
    expect(artifactGuideKey(undefined)).toBe('generating')
    expect(artifactGuideKey('some_new_state_from_backend')).toBe('generating')
  })
})

describe('任务产物状态色', () => {
  it('失败红、完成绿、其余中性（不把生成中也涂成成功色）', () => {
    expect(artifactTone('failed')).toBe('text-mg-danger')
    expect(artifactTone('available')).toBe('text-mg-success')
    expect(artifactTone('generating')).toBe('text-mg-text-2')
    expect(artifactTone('expired')).toBe('text-mg-text-2')
    expect(artifactTone(null)).toBe('text-mg-text-2')
  })
})

describe('任务总耗时', () => {
  it('两个时间都有且差值为正时算出毫秒数', () => {
    expect(taskTotalDuration({ created_at: '2026-09-07T10:00:00Z', completed_at: '2026-09-07T10:05:00Z' })).toBe(300_000)
  })

  it('任务未结束（无 completed_at）不显示', () => {
    expect(taskTotalDuration({ created_at: '2026-09-07T10:00:00Z' })).toBeNull()
    expect(taskTotalDuration({ created_at: '2026-09-07T10:00:00Z', completed_at: '' })).toBeNull()
  })

  it('时间倒挂或为零不显示，避免渲染出「0ms 完成」', () => {
    expect(taskTotalDuration({ created_at: '2026-09-07T10:05:00Z', completed_at: '2026-09-07T10:00:00Z' })).toBeNull()
    expect(taskTotalDuration({ created_at: '2026-09-07T10:00:00Z', completed_at: '2026-09-07T10:00:00Z' })).toBeNull()
  })

  it('时间串不可解析时不显示', () => {
    expect(taskTotalDuration({ created_at: 'not-a-date', completed_at: '2026-09-07T10:00:00Z' })).toBeNull()
  })
})
