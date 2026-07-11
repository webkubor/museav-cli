import { describe, it, expect } from 'vitest'
import type { CallLogItem } from '@/types'
import {
  deriveLogStatus,
  guardrailAction,
  isGuardrailHit,
  isModelNotStarted,
  isRedacted,
  modelCallState,
} from './guardrail'

/** 造一条最小可用的日志记录，按需覆盖字段。 */
function makeRow(over: Partial<CallLogItem> = {}): CallLogItem {
  return {
    call_log_id: 'c1',
    request_id: 'r1',
    started_at: '2026-07-11T00:00:00Z',
    duration_ms: 1200,
    model: { id: 'm', display_name: 'GPT' },
    provider: { id: 'p', name: 'openai', type: 'llm' },
    workspace_id: 'w',
    tenant_id: 't',
    trace_id: 'tr',
    requested_model: 'gpt',
    upstream_model: 'gpt',
    path: '/v1/chat',
    call_type: 'chat',
    http_status: 200,
    tpot_ms: 0,
    fallback_count: 0,
    api_key: { api_key_id: 'k', name: 'key', masked: '***' },
    account: { account_id: 'a', display_name: 'user' },
    app_name: null,
    status: 'succeeded',
    finish_reason: 'stop',
    usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cache_read_tokens: 0, cache_write_tokens: 0 },
    usage_type: 'billed',
    speed: { tps: 10, first_token_ms: 100 },
    cost: { amount: '0.01', currency: 'USD' },
    billing_status: 'billed',
    error: null,
    ...over,
  }
}

describe('deriveLogStatus - 原型新字段', () => {
  it('脱敏后继续 = 护栏命中 + 完整指标', () => {
    const row = makeRow({
      model_request_state: 'succeeded',
      guardrail_decision: { rule_name: '提示词注入', action: 'redacted', rule_source: '全局护栏' },
    })
    expect(deriveLogStatus(row)).toBe('guarded')
    expect(isModelNotStarted(row)).toBe(false)
    expect(isRedacted(row)).toBe(true)
    expect(guardrailAction(row)).toBe('redacted')
    expect(modelCallState(row)).toBe('succeeded')
  })

  it('预算拦截 = 护栏命中 + 指标置空', () => {
    const row = makeRow({
      model_request_state: 'not_started',
      guardrail_decision: { rule_name: '预算上限', action: 'blocked', rule_source: '空间护栏' },
    })
    expect(deriveLogStatus(row)).toBe('guarded')
    expect(isModelNotStarted(row)).toBe(true)
    expect(isRedacted(row)).toBe(false)
    expect(guardrailAction(row)).toBe('blocked')
    expect(modelCallState(row)).toBe('not_started')
  })

  it('model_request_state=failed 优先判为异常', () => {
    const row = makeRow({
      model_request_state: 'failed',
      guardrail_decision: { rule_name: '注入', action: 'redacted', rule_source: '全局护栏' },
    })
    expect(deriveLogStatus(row)).toBe('error')
    // 脱敏后下游失败：仍属护栏命中范畴（isGuardrailHit 只看 deriveLogStatus，这里是 error）
    expect(isGuardrailHit(row)).toBe(false)
  })

  it('仅记录（log_only）= 护栏命中 + 完整指标', () => {
    const row = makeRow({
      model_request_state: 'succeeded',
      guardrail_decision: { rule_name: '敏感词', action: 'log_only', rule_source: '个人护栏' },
    })
    expect(deriveLogStatus(row)).toBe('guarded')
    expect(guardrailAction(row)).toBe('log_only')
    expect(isModelNotStarted(row)).toBe(false)
  })

  it('无护栏命中 + 成功 = 成功', () => {
    const row = makeRow({ model_request_state: 'succeeded' })
    expect(deriveLogStatus(row)).toBe('success')
    expect(isGuardrailHit(row)).toBe(false)
  })
})

describe('deriveLogStatus - 降级（后端未返回新字段）', () => {
  it('legacy succeeded → 成功', () => {
    expect(deriveLogStatus(makeRow({ status: 'succeeded' }))).toBe('success')
  })
  it('legacy failed → 异常', () => {
    expect(deriveLogStatus(makeRow({ status: 'failed' }))).toBe('error')
  })
  it('legacy rejected → 护栏命中 + 指标置空 + 视为已拦截/未发起', () => {
    const row = makeRow({ status: 'rejected' })
    expect(deriveLogStatus(row)).toBe('guarded')
    expect(isModelNotStarted(row)).toBe(true)
    expect(guardrailAction(row)).toBe('blocked')
    expect(modelCallState(row)).toBe('not_started')
  })
})
