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
      model_request_state: 'completed',
      guardrail_decision: { rule_name: '提示词注入', action: 'redact', rule_scope: 'global' },
    })
    expect(deriveLogStatus(row)).toBe('guarded')
    expect(isModelNotStarted(row)).toBe(false)
    expect(isRedacted(row)).toBe(true)
    expect(guardrailAction(row)).toBe('redact')
    expect(modelCallState(row)).toBe('completed')
  })

  it('拦截 = 护栏命中 + 指标置空', () => {
    const row = makeRow({
      model_request_state: 'not_started',
      guardrail_decision: { rule_name: '注入拦截', action: 'block', rule_scope: 'key' },
    })
    expect(deriveLogStatus(row)).toBe('guarded')
    expect(isModelNotStarted(row)).toBe(true)
    expect(isRedacted(row)).toBe(false)
    expect(guardrailAction(row)).toBe('block')
    expect(modelCallState(row)).toBe('not_started')
  })

  it('model_request_state=failed 优先判为异常', () => {
    const row = makeRow({
      model_request_state: 'failed',
      guardrail_decision: { rule_name: '注入', action: 'redact', rule_scope: 'global' },
    })
    expect(deriveLogStatus(row)).toBe('error')
    // 脱敏后下游失败：仍属护栏命中范畴（isGuardrailHit 只看 deriveLogStatus，这里是 error）
    expect(isGuardrailHit(row)).toBe(false)
  })

  it('仅标记（flag）= 护栏命中 + 完整指标', () => {
    const row = makeRow({
      model_request_state: 'completed',
      guardrail_decision: { rule_name: '敏感词', action: 'flag', rule_scope: 'personal' },
    })
    expect(deriveLogStatus(row)).toBe('guarded')
    expect(guardrailAction(row)).toBe('flag')
    expect(isModelNotStarted(row)).toBe(false)
  })

  it('无护栏命中 + 成功 = 成功', () => {
    const row = makeRow({ model_request_state: 'completed' })
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
    expect(guardrailAction(row)).toBe('block')
    expect(modelCallState(row)).toBe('not_started')
  })
})

describe('deriveLogStatus - 客户端取消 (prd#830)', () => {
  it('error_code=client_canceled 显示已取消，不算异常', () => {
    const row = makeRow({ status: 'failed', error_code: 'client_canceled', http_status: 499 })
    expect(deriveLogStatus(row)).toBe('canceled')
  })

  it('finish_reason=canceled 覆盖 model_request_state=failed', () => {
    const row = makeRow({
      status: 'failed',
      model_request_state: 'failed',
      finish_reason: 'canceled',
    })
    expect(deriveLogStatus(row)).toBe('canceled')
  })
})
