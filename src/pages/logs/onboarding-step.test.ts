/**
 * 新手指南第 ⑤ 步判据回归测试（shared/modelgo_prd#1036）
 *
 * 背景：测试环境实测，近四次人工完成 ⑤ 用的全是模型体验那条请求
 * （api_key_type=trial，跑在系统托管的隐藏试用 Key 上）。而模型体验本身已经是第 ② 步的
 * 证据 —— 同一次用户动作点亮两步，五步任务就塌成四个动作，用户没走通「建 Key → 复制
 * 接入配置 → 自己发起调用」也能凑满领 ¥10（规格 §11：每租户每版一笔、发出不可回收）。
 */

import { describe, expect, it } from 'vitest'
import type { CallLogItem } from '@/types'
import { canCompleteRequestLogStep } from './onboarding-step'

/** 造一条最小可用的日志记录，按需覆盖字段。 */
function makeRow(over: Partial<CallLogItem> = {}): CallLogItem {
  return {
    call_log_id: 'c1',
    request_id: 'r1',
    started_at: '2026-09-15T08:18:48Z',
    duration_ms: 1200,
    model: { id: 'm', display_name: 'Qwen' },
    provider: { id: 'p', name: 'aliyun', type: 'llm' },
    workspace_id: 'w',
    tenant_id: 't',
    trace_id: 'tr',
    requested_model: 'qwen3.6-flash',
    upstream_model: 'qwen3.6-flash',
    path: '/v1/chat/completions',
    call_type: 'sync',
    http_status: 200,
    tpot_ms: 0,
    fallback_count: 0,
    api_key: { api_key_id: 'k', name: 'key', masked: '***' },
    api_key_type: 'personal',
    account: { account_id: 'a', display_name: 'dev' },
    app_name: null,
    status: 'succeeded',
    finish_reason: 'stop',
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    },
    usage_type: 'token',
    speed: { tps: 1, first_token_ms: 1 },
    cost: { amount: '0', currency: 'CNY' },
    billing_status: 'settled',
    error: null,
    ...over,
  }
}

describe('canCompleteRequestLogStep', () => {
  it('用户自己 Key 打出去的成功调用算证据', () => {
    expect(canCompleteRequestLogStep(makeRow({ api_key_type: 'personal' }))).toBe(true)
  })

  it.each(['member', 'service'])('企业侧的 %s Key 调用同样算证据', (type) => {
    expect(canCompleteRequestLogStep(makeRow({ api_key_type: type }))).toBe(true)
  })

  it('模型体验（trial Key）那条请求不算证据 —— #1036 的核心回归', () => {
    expect(canCompleteRequestLogStep(makeRow({ api_key_type: 'trial' }))).toBe(false)
  })

  it.each([
    { call_kind: 'async_task' } as const,
    { call_mode: 'async' } as const,
  ])('异步任务的日志详情同样算证据（#1341 起不再排除）：%o', (marker) => {
    expect(canCompleteRequestLogStep(makeRow(marker))).toBe(true)
  })

  it.each(['failed', 'rejected', 'accepted'] as const)(
    '未成功（%s）的调用同样算证据（#1341：非模型体验来源即可）',
    (status) => {
      expect(canCompleteRequestLogStep(makeRow({ status }))).toBe(true)
    },
  )

  it('模型体验 + 未成功：仍不算 —— 模型体验这条否决与调用状态无关', () => {
    expect(canCompleteRequestLogStep(makeRow({ api_key_type: 'trial', status: 'failed' }))).toBe(
      false,
    )
  })

  it('类型未知（2026-07-14 前的历史行没打标）按放行处理，不堵死正常路径', () => {
    expect(canCompleteRequestLogStep(makeRow({ api_key_type: '' }))).toBe(true)
  })
})
