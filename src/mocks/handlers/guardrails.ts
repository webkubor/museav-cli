import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'

const PREFIX = '/api/v1'

const now = () => new Date().toISOString()

const MOCK_POLICIES = [
  {
    id: 'policy-001',
    aggregation_scope: 'guardrail_total',
    enforcement_mode: 'hard_limit',
    enabled: true,
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    period_unit: 'month',
    period_length: 1,
    spend_limit_amount: '500.00',
    token_limit: 0,
    request_limit: 0,
    rate_token_limit: 0,
    rate_request_limit: 0,
    rate_window_seconds: 60,
    effective_from: '',
    effective_to: '',
  },
  {
    id: 'policy-002',
    aggregation_scope: 'per_member',
    enforcement_mode: 'soft_limit',
    enabled: true,
    currency: 'CNY',
    timezone: 'Asia/Shanghai',
    period_unit: 'day',
    period_length: 1,
    spend_limit_amount: '0.00',
    token_limit: 100000,
    request_limit: 500,
    rate_token_limit: 0,
    rate_request_limit: 10,
    rate_window_seconds: 60,
    effective_from: '',
    effective_to: '',
  },
]

let guardrails = [
  {
    id: 'gr-001',
    name: '免费用户限额',
    description: '限制免费套餐用户每月消费上限',
    status: 'active',
    is_default: true,
    priority: 1,
    scope_level: 'workspace',
    policy_id: '',
    gateway_policy_version: 1,
    version: 1,
    tenant_id: '01HV3KTNNT000000000000001',
    workspace_id: '01HV3KWS000000000000001',
    metadata: {},
    created_at: now(),
    updated_at: now(),
    assignments: [
      {
        id: 'asgn-001',
        subject_type: 'member',
        account_id: 'acc-demo-001',
        api_key_id: '',
        assigned_at: now(),
      },
    ],
    budget_policies: MOCK_POLICIES,
  },
  {
    id: 'gr-002',
    name: '高频 API Key 限速',
    description: '对高频调用的 Key 启用限速保护',
    status: 'inactive',
    is_default: false,
    priority: 2,
    scope_level: 'workspace',
    policy_id: '',
    gateway_policy_version: 1,
    version: 1,
    tenant_id: '01HV3KTNNT000000000000001',
    workspace_id: '01HV3KWS000000000000001',
    metadata: {},
    created_at: now(),
    updated_at: now(),
    assignments: [],
    budget_policies: [],
  },
]

export const guardrailHandlers = [
  // 列表
  http.get(`${PREFIX}/workspaces/:workspaceId/guardrails`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { items: guardrails },
    })
  }),

  // 创建
  http.post(`${PREFIX}/workspaces/:workspaceId/guardrails`, async ({ request }) => {
    const body = (await request.json()) as { name: string; description?: string }
    const newGuardrail = {
      id: `gr-${uuid().slice(0, 8)}`,
      name: body.name,
      description: body.description ?? '',
      status: 'active',
      is_default: false,
      priority: guardrails.length + 1,
      scope_level: 'workspace',
      policy_id: '',
      gateway_policy_version: 1,
      version: 1,
      tenant_id: '01HV3KTNNT000000000000001',
      workspace_id: '01HV3KWS000000000000001',
      metadata: {},
      created_at: now(),
      updated_at: now(),
      assignments: [],
      budget_policies: [],
    }
    guardrails = [...guardrails, newGuardrail]
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: newGuardrail })
  }),

  // 更新（状态等）
  http.patch(`${PREFIX}/guardrails/:guardrailId`, async ({ params, request }) => {
    const { guardrailId } = params as { guardrailId: string }
    const body = (await request.json()) as Record<string, unknown>
    guardrails = guardrails.map((g) =>
      g.id === guardrailId ? { ...g, ...body, updated_at: now() } : g
    )
    const updated = guardrails.find((g) => g.id === guardrailId)!
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: updated })
  }),

  // 添加预算策略
  http.post(`${PREFIX}/guardrails/:guardrailId/budget-policies`, async ({ params, request }) => {
    const { guardrailId } = params as { guardrailId: string }
    const body = (await request.json()) as Record<string, unknown>
    const newPolicy = {
      id: `policy-${uuid().slice(0, 8)}`,
      aggregation_scope: 'guardrail_total',
      enforcement_mode: 'hard_limit',
      enabled: true,
      currency: 'CNY',
      timezone: 'Asia/Shanghai',
      period_unit: 'month',
      period_length: 1,
      spend_limit_amount: '0.00',
      token_limit: 0,
      request_limit: 0,
      rate_token_limit: 0,
      rate_request_limit: 0,
      rate_window_seconds: 60,
      effective_from: '',
      effective_to: '',
      ...body,
    }
    guardrails = guardrails.map((g) =>
      g.id === guardrailId
        ? { ...g, budget_policies: [...g.budget_policies, newPolicy], updated_at: now() }
        : g
    )
    const updated = guardrails.find((g) => g.id === guardrailId)!
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: updated })
  }),

  // 删除预算策略
  http.delete(`${PREFIX}/guardrails/:guardrailId/budget-policies/:policyId`, ({ params }) => {
    const { guardrailId, policyId } = params as { guardrailId: string; policyId: string }
    guardrails = guardrails.map((g) =>
      g.id === guardrailId
        ? {
            ...g,
            budget_policies: g.budget_policies.filter((p) => p.id !== policyId),
            updated_at: now(),
          }
        : g
    )
    const updated = guardrails.find((g) => g.id === guardrailId)!
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: updated })
  }),
]
