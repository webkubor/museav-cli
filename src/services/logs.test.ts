/**
 * 调用日志服务归一化测试
 * API：GET /model-logs
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/request', () => ({
  get: vi.fn(),
}))

import { get } from '@/lib/request'
import { listCallLogs } from '@/services/logs'

const getMock = vi.mocked(get)

describe('listCallLogs', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('不把 provider_instance_id 当作供应商名称或类型', async () => {
    getMock.mockResolvedValue({
      items: [
        {
          request_id: 'gw_test',
          started_at: '2026-07-14T00:00:00.000Z',
          requested_model: 'deepseek-v4-flash',
          provider_instance_id: 'f97d3443-fafa-4131-bc4d-7e9c694cd102',
        },
      ],
      limit: 15,
    })

    const result = await listCallLogs({ limit: 15 })

    expect(result.items[0].provider).toEqual({
      id: 'f97d3443-fafa-4131-bc4d-7e9c694cd102',
      name: '',
      type: '',
    })
  })
})
