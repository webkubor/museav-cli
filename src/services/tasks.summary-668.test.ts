/**
 * 异步任务 Summary 服务测试（需求方#668）
 * API：GET /async-tasks/summary（后端 qa#605）
 *
 * 这里守的是 #668 踩过的那个坑：同步侧当初误接 `model-logs/stats`，两个端点都活着、
 * 都回 `{ totals }`，类型和映射都不报错，只有数值差 20 倍 —— 靠人眼看不出来。
 * 所以端点字符串和「参数与列表同口径」必须由测试钉死。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/request', () => ({
  get: vi.fn(),
}))

import { get } from '@/lib/request'
import { getAsyncTasksSummary, listTasks } from '@/services/tasks'

const getMock = vi.mocked(get)

describe('getAsyncTasksSummary', () => {
  beforeEach(() => {
    getMock.mockReset()
    getMock.mockResolvedValue({})
  })

  it('打的是 async-tasks/summary，不是列表端点也不是 stats', async () => {
    await getAsyncTasksSummary({ preset: '7d' })

    expect(getMock).toHaveBeenCalledTimes(1)
    const [endpoint] = getMock.mock.calls[0]
    expect(endpoint).toBe('async-tasks/summary')
    // 反向断言：这三个都是「看起来对但错」的端点，历史上真的接错过
    expect(endpoint).not.toBe('async-tasks')
    expect(endpoint).not.toBe('async-tasks/stats')
    expect(endpoint).not.toBe('model-logs/summary')
  })

  it('筛选参数原样透传（Summary 必须与列表同口径）', async () => {
    const params = {
      workspace_id: 'ws-1',
      api_key_id: 'key-1',
      status: 'failed',
      artifact_state: 'available' as const,
      billing_state: 'pending' as const,
      preset: '24h' as const,
      search: 'kw',
      account_id: 'acc-1',
    }

    await getAsyncTasksSummary(params)

    expect(getMock.mock.calls[0][1]).toEqual(params)
  })

  it('与列表端点收到的筛选参数逐项一致，只差分页', async () => {
    const filters = {
      workspace_id: 'ws-1',
      status: 'succeeded',
      preset: '7d' as const,
      search: 'abc',
      account_id: 'acc-9',
    }

    await listTasks({ ...filters, limit: 20, offset: 40 })
    await getAsyncTasksSummary(filters)

    const listParams = { ...(getMock.mock.calls[0][1] as Record<string, unknown>) }
    const summaryParams = getMock.mock.calls[1][1] as Record<string, unknown>

    // 列表多出且仅多出分页两项
    expect(listParams.limit).toBe(20)
    expect(listParams.offset).toBe(40)
    delete listParams.limit
    delete listParams.offset
    expect(summaryParams).toEqual(listParams)
  })

  it('不传参数时不硬塞默认值（默认口径由调用方决定）', async () => {
    await getAsyncTasksSummary()
    expect(getMock.mock.calls[0][1]).toBeUndefined()
  })

  it('响应原样返回，服务层不做归一化（六项指标的缺失判定在组件层）', async () => {
    // 故意只给一半字段：服务层不该补 0，否则组件分不清「读不到」和「本来是 0」
    getMock.mockResolvedValue({ total_tasks: 80, succeeded_tasks: 60 })

    const data = await getAsyncTasksSummary({ preset: '7d' })

    expect(data).toEqual({ total_tasks: 80, succeeded_tasks: 60 })
    expect(data).not.toHaveProperty('failed_tasks', 0)
    expect(data.queued_tasks).toBeUndefined()
  })
})
