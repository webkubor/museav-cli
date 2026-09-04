/**
 * 调用日志到任务产物详情下钻的回归测试（需求方#954）
 * 路由：/logs?record_type=async&task_id=<gateway_request_id>
 * API：GET /async-tasks/:requestId
 */
import { describe, expect, it } from 'vitest'
import type { TaskItem } from '@/types'
import { taskForAutoOpen } from './task-artifact-link'

const task = (id: string) => ({ gateway_request_id: id }) as TaskItem

describe('任务产物下钻', () => {
  it('列表命中时用列表项', () => {
    expect(taskForAutoOpen([task('gw-1')], 'gw-1', undefined)).toEqual(task('gw-1'))
  })

  it('列表未命中时只接受相同 ID 的详情响应', () => {
    expect(taskForAutoOpen([], 'gw-1', { task: task('gw-1') })).toEqual(task('gw-1'))
    expect(taskForAutoOpen([], 'gw-1', { task: task('gw-2') })).toBeUndefined()
  })
})
