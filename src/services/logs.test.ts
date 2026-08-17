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

describe('getLogsSummary', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  it('后端未交付的指标保持 undefined（显 —），不用 0 冒充', async () => {
    // 现契约（qa#605 交付前）：totals 仅 requests/spend/tokens
    getMock.mockResolvedValue({ totals: { requests: 12, spend: '3.5', tokens: 900, currency: 'CNY' } })

    const { getLogsSummary } = await import('@/services/logs')
    const result = await getLogsSummary({ from: '2026-08-10', to: '2026-08-17' })

    expect(result.total_requests).toBe(12)
    expect(result.total_tokens).toBe(900)
    expect(result.total_cost).toEqual({ amount: '3.5', currency: 'CNY' })
    expect(result.succeeded).toBeUndefined()
    expect(result.failed).toBeUndefined()
    expect(result.guardrail_hits).toBeUndefined()
    expect(result.avg_duration_ms).toBeUndefined()
    expect(result.avg_ttft_ms).toBeUndefined()
    expect(result.cost_records).toBeUndefined()
  })

  it('qa#605 契约字段齐备时完整映射，且筛选参数与列表同口径（model_id→model）', async () => {
    getMock.mockResolvedValue({
      totals: {
        requests: 100, spend: '10', tokens: 5000, currency: 'CNY',
        succeeded: 90, failed: 8, guardrail_hits: 15,
        avg_duration_ms: 1200, avg_ttft_ms: 300, spend_with_cost_count: 80,
      },
    })

    const { getLogsSummary } = await import('@/services/logs')
    const result = await getLogsSummary({
      model_id: 'm-1', status: 'succeeded', guardrail: 'hit', q: 'kw', workspace_id: 'ws-1',
    })

    expect(result.succeeded).toBe(90)
    expect(result.failed).toBe(8)
    expect(result.guardrail_hits).toBe(15)
    expect(result.avg_duration_ms).toBe(1200)
    expect(result.avg_ttft_ms).toBe(300)
    expect(result.cost_records).toBe(80)
    const query = getMock.mock.calls[0][1] as Record<string, unknown>
    expect(query.model).toBe('m-1')
    expect(query.model_id).toBeUndefined()
    expect(query.status).toBe('succeeded')
    expect(query.guardrail).toBe('hit')
    expect(query.q).toBe('kw')
    expect(query.workspace_id).toBe('ws-1')
  })
})
