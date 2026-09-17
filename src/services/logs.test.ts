/**
 * 调用日志服务归一化测试
 * API：GET /model-logs
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/request', () => ({
  get: vi.fn(),
}))

import { get } from '@/lib/request'
import { listCallLogs, getLogsSummary } from '@/services/logs'

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

describe('listCallLogs 的 call_log_id 去重（gitlab#938）', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  // 根因：call_log_id 缺失时回退用 request_id，但 request_id 由客户端 X-Request-Id
  // 传入、不保证同页唯一 —— 两次真实调用（trace_id 不同）撞同一个 request_id 时，
  // 若不去重会产出重复的 call_log_id，成为列表 React key 后导致协调时留下孤儿 DOM 行，
  // 换筛选条件后仍残留、穿透后续所有筛选（issue 复现的核心现象）。
  it('后端未回 call_log_id 且 request_id 同页重复时，映射结果的 call_log_id 互不相同', async () => {
    getMock.mockResolvedValue({
      items: [
        {
          request_id: 'gw_pytest_dup',
          trace_id: '3ba41e1833553decff5768159a2db62d',
          started_at: '2026-09-02T06:42:05.000Z',
          status: 'succeeded',
        },
        {
          request_id: 'gw_pytest_dup',
          trace_id: '40d3779d8916483b7cb1cefd6319dd6b',
          started_at: '2026-09-02T06:42:06.000Z',
          status: 'failed',
        },
      ],
      limit: 15,
    })

    const result = await listCallLogs({ limit: 15 })

    const ids = result.items.map((item) => item.call_log_id)
    expect(new Set(ids).size).toBe(ids.length)
    // request_id 本身不受影响，仍然如实反映后端字段（去重只作用于 UI key）。
    expect(result.items[0].request_id).toBe('gw_pytest_dup')
    expect(result.items[1].request_id).toBe('gw_pytest_dup')
  })

  it('call_log_id 由后端提供时原样使用，不做多余改写', async () => {
    getMock.mockResolvedValue({
      items: [
        { call_log_id: 'row-1', request_id: 'gw_a', started_at: '2026-09-02T00:00:00.000Z' },
        { call_log_id: 'row-2', request_id: 'gw_b', started_at: '2026-09-02T00:00:01.000Z' },
      ],
      limit: 15,
    })

    const result = await listCallLogs({ limit: 15 })

    expect(result.items.map((item) => item.call_log_id)).toEqual(['row-1', 'row-2'])
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

describe('getLogsSummary 打的端点', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  // 这条是这次踩坑的护栏：实现一度打的是 model-logs/stats。两个端点都活着、都回
  // { totals }，所以类型和映射都不报错，但 stats 不认 preset（自己回落成最近 24h
  // 分桶）且 totals 只有三项 —— 表现为指标条数值与列表差一个量级、六项里四项显「—」。
  // 2026-08-19 test 实测：summary.requests 84765 == 列表 total 84765，stats 只有 4089。
  it('必须是 model-logs/summary，不能回到 model-logs/stats', async () => {
    getMock.mockResolvedValue({ totals: { requests: 1 } })

    await getLogsSummary({ from: '2026-08-01', to: '2026-08-19' })

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock.mock.calls[0][0]).toBe('model-logs/summary')
  })

  it('六项指标全部映射，缺失项保持 undefined 而不是 0', async () => {
    getMock.mockResolvedValue({
      totals: {
        requests: 84765,
        tokens: 111822869,
        spend: '2095.97',
        currency: 'CNY',
        succeeded: 80840,
        failed: 1665,
        guardrail_hits: 2224,
        spend_with_cost_count: 79799,
        avg_duration_ms: 1274.76,
        avg_ttft_ms: 199.9,
      },
    })

    const s = await getLogsSummary()

    expect(s.total_requests).toBe(84765)
    expect(s.succeeded).toBe(80840)
    expect(s.failed).toBe(1665)
    expect(s.guardrail_hits).toBe(2224)
    expect(s.cost_records).toBe(79799)
    expect(s.avg_duration_ms).toBeCloseTo(1274.76)
    expect(s.avg_ttft_ms).toBeCloseTo(199.9)
    expect(s.total_cost).toEqual({ amount: '2095.97', currency: 'CNY' })
  })

  it('后端某项缺失时该项为 undefined —— 不能用 0 冒充（会被读成「真的是 0」）', async () => {
    getMock.mockResolvedValue({ totals: { requests: 10 } })

    const s = await getLogsSummary()

    expect(s.total_requests).toBe(10)
    expect(s.succeeded).toBeUndefined()
    expect(s.guardrail_hits).toBeUndefined()
    expect(s.avg_ttft_ms).toBeUndefined()
    expect(s.total_cost).toBeUndefined()
  })
})

describe('listCallLogs 透传 api_key_type（shared/modelgo_prd#1036）', () => {
  beforeEach(() => {
    getMock.mockReset()
  })

  // 新手指南第 ⑤ 步要靠它把「模型体验」那条请求排除掉；真源是网关落库的
  // metadata.api_key_type（web-api /model-logs 的 api_key_type 筛选同源）。
  it('从 metadata.api_key_type 取值，模型体验的行读出 trial', async () => {
    getMock.mockResolvedValue({
      items: [
        {
          request_id: '228b1d59-5128-4724-a0f4-e6ae6af24157',
          started_at: '2026-09-15T08:18:48.000Z',
          requested_model: 'qwen3.6-flash',
          metadata: { api_key_name: '__trial__', api_key_type: 'trial' },
        },
        {
          request_id: 'gw_43820446-77e0-4f30-9078-04cd0c00e3e7',
          started_at: '2026-09-15T08:21:22.000Z',
          requested_model: 'qwen3.6-flash',
          metadata: { api_key_name: '11', api_key_type: 'personal' },
        },
      ],
      limit: 15,
    })

    const result = await listCallLogs({ limit: 15 })

    expect(result.items[0].api_key_type).toBe('trial')
    expect(result.items[1].api_key_type).toBe('personal')
  })

  it('历史行没有 metadata 时保持空串（未知），不猜成 personal', async () => {
    getMock.mockResolvedValue({
      items: [{ request_id: 'gw_old', started_at: '2026-06-01T00:00:00.000Z' }],
      limit: 15,
    })

    const result = await listCallLogs({ limit: 15 })

    expect(result.items[0].api_key_type).toBe('')
  })
})
