import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExperienceStatsEvent } from '@/services/experience-sessions'

vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
vi.mock('@/services/experience-sessions', () => ({ getExperienceMessage: vi.fn() }))

import { trackEvent } from '@/lib/track'
import { getExperienceMessage } from '@/services/experience-sessions'
import { trackModelRun, buildDialogueMetrics, buildMediaMetrics, pollMediaTask } from './experience-run'

const stats = {
  status: 'succeeded',
  input_tokens: 120,
  output_tokens: 380,
  first_token_ms: 800,
  total_ms: 4200,
  estimated_spend: '0.02',
  actual_spend: '0.03',
  free: false,
} as unknown as ExperienceStatsEvent

const fallback = {
  inputTokens: 10,
  outputTokens: 20,
  firstTokenMs: 500,
  totalMs: 1500,
  spend: 0.001,
  free: true,
}

describe('buildDialogueMetrics', () => {
  it('有 stats 帧时全部取 stats，actual_spend 优先于 estimated_spend', () => {
    const m = buildDialogueMetrics({ modelLabel: 'Kimi', stats, fallback })
    expect(m).toEqual({
      model: 'Kimi',
      inputTokens: 120,
      outputTokens: 380,
      firstTokenLatency: '800ms',
      totalLatency: '4.20s',
      spend: 0.03,
      free: false,
      totalMs: 4200,
    })
  })

  it('无 actual_spend 时回落到 estimated_spend', () => {
    const m = buildDialogueMetrics({
      modelLabel: 'Kimi',
      stats: { ...stats, actual_spend: undefined } as ExperienceStatsEvent,
      fallback,
    })
    expect(m.spend).toBe(0.02)
  })

  it('stats 缺失时整组用本地兜底值', () => {
    const m = buildDialogueMetrics({ modelLabel: 'Kimi', stats: null, fallback })
    expect(m).toEqual({
      model: 'Kimi',
      inputTokens: 10,
      outputTokens: 20,
      firstTokenLatency: '500ms',
      totalLatency: '1.50s',
      spend: 0.001,
      free: true,
      totalMs: 1500,
    })
  })
})

describe('buildMediaMetrics', () => {
  it('花费为 0 记为免费', () => {
    expect(buildMediaMetrics({ modelLabel: 'Seedream', spend: 0, totalMs: 12000 })).toEqual({
      model: 'Seedream',
      inputTokens: 0,
      outputTokens: 0,
      firstTokenLatency: '',
      totalLatency: '12.00s',
      spend: 0,
      free: true,
      totalMs: 12000,
    })
  })

  it('花费非 0 记为计费', () => {
    expect(buildMediaMetrics({ modelLabel: 'Seedance', spend: 1.2, totalMs: 30000 }).free).toBe(false)
  })
})

describe('trackModelRun', () => {
  beforeEach(() => vi.mocked(trackEvent).mockClear())

  it('成功路径按耗时/Token 分桶，计费状态取 free', () => {
    trackModelRun({ modelId: 'kimi-k2.7', failed: false, totalMs: 4200, tokens: 500, free: false })
    expect(trackEvent).toHaveBeenCalledWith(
      'playground_model_run_result',
      { model_id: 'kimi-k2.7', status: 'succeeded', latency_bucket: '3-10s', token_bucket: '500-2k', billing_status: 'billed' },
      { result: 'success' },
    )
  })

  it('失败路径记 unbilled 并带错误码', () => {
    trackModelRun({ modelId: 'kimi-k2.7', failed: true, totalMs: 500, errorCode: 'MODEL_UNAVAILABLE' })
    expect(trackEvent).toHaveBeenCalledWith(
      'playground_model_run_result',
      { model_id: 'kimi-k2.7', status: 'failed', latency_bucket: '<1s', token_bucket: '<500', billing_status: 'unbilled' },
      { result: 'fail', error_code: 'MODEL_UNAVAILABLE' },
    )
  })

  it('免费成功路径记 free，媒体任务 token 缺省为 0', () => {
    trackModelRun({ modelId: 'seedream', failed: false, totalMs: 40000, free: true })
    expect(trackEvent).toHaveBeenCalledWith(
      'playground_model_run_result',
      expect.objectContaining({ billing_status: 'free', latency_bucket: '>30s', token_bucket: '<500' }),
      { result: 'success' },
    )
  })
})

describe('pollMediaTask', () => {
  beforeEach(() => vi.mocked(getExperienceMessage).mockReset())

  it('running 继续轮询，拿到终态才返回', async () => {
    const running = { message: { status: 'running' }, attachment_urls: {} }
    const done = { message: { status: 'succeeded' }, attachment_urls: {} }
    vi.mocked(getExperienceMessage)
      .mockResolvedValueOnce(running as never)
      .mockResolvedValueOnce(running as never)
      .mockResolvedValueOnce(done as never)

    const result = await pollMediaTask('conv-1', 'msg-1', { intervalMs: 1 })
    expect(result).toBe(done)
    expect(getExperienceMessage).toHaveBeenCalledTimes(3)
    expect(getExperienceMessage).toHaveBeenCalledWith('conv-1', 'msg-1')
  })

  it('单次请求失败不放弃，下一轮继续', async () => {
    const done = { message: { status: 'failed' }, attachment_urls: {} }
    vi.mocked(getExperienceMessage)
      .mockRejectedValueOnce(new Error('网络抖动'))
      .mockResolvedValueOnce(done as never)

    await expect(pollMediaTask('conv-1', 'msg-1', { intervalMs: 1 })).resolves.toBe(done)
    expect(getExperienceMessage).toHaveBeenCalledTimes(2)
  })
})
