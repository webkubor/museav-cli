import { del, get, patch, post, put } from '@/lib/request'
import { useDevStore } from '@/store/use-dev-store'
import type {
  AddBudgetPolicyRequest,
  AssignmentInput,
  CreateGuardrailRequest,
  GuardrailDetail,
  GuardrailListResponse,
  UpdateGuardrailRequest,
} from '@/interfaces/guardrails'

let mockWorkspaceId = ''
let mockConfiguredCount = 0
let mockGuardrails: GuardrailDetail[] = []

function mockEnabled() {
  return import.meta.env.DEV && useDevStore.getState().mockGuardrailCount > 0
}

function nowIso() {
  return new Date().toISOString()
}

function assignment(id: string, apiKeyId: string, index: number) {
  return {
    id: `${id}-api-key-${index}`,
    subject_type: 'api_key' as const,
    account_id: '',
    api_key_id: apiKeyId,
    assigned_at: '2026-06-01T08:00:00Z',
  }
}

function budgetPolicy(id: string, amount: string): GuardrailDetail['budget_policies'][number] {
  return {
    id: `${id}-budget-monthly`,
    aggregation_scope: 'guardrail_total',
    enforcement_mode: 'hard_limit',
    enabled: true,
    currency: 'CNY',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
    period_unit: 'month',
    period_length: 1,
    spend_limit_amount: amount,
    token_limit: 0,
    request_limit: 0,
    rate_token_limit: 0,
    rate_request_limit: 0,
    rate_window_seconds: 0,
    effective_from: '2026-06-01T00:00:00Z',
    effective_to: '',
  }
}

function guardrailBase(workspaceId: string, index: number): GuardrailDetail {
  const createdAt = `2026-05-${String(20 + index).padStart(2, '0')}T09:30:00Z`
  const samples = [
    {
      name: '企业默认护栏',
      description: '默认保护策略，覆盖基础提示词防御和模型调用安全。',
      isDefault: true,
      priority: 100,
      status: 'active' as const,
      models: [],
      ips: [],
      apiKeys: ['ak_prod_gateway', 'ak_console_default'],
      budget: '30000',
    },
    {
      name: '生产专用（限来源 IP）',
      description: '生产环境 API Key 仅允许从白名单出口访问。',
      isDefault: false,
      priority: 80,
      status: 'active' as const,
      models: [],
      ips: ['101.37.118.26/32'],
      apiKeys: ['ak_prod_gateway'],
      budget: '12000',
    },
    {
      name: 'PoC 团队（禁高价模型）',
      description: '用于试用和方案验证，限制高价模型与月度预算。',
      isDefault: false,
      priority: 60,
      status: 'active' as const,
      models: ['gpt-4o', 'gpt-4-turbo', 'claude-opus-4'],
      ips: [],
      apiKeys: ['ak_poc_team'],
      budget: '3000',
    },
    {
      name: '研发测试护栏',
      description: '研发环境允许更宽松的模型范围，但保留调用审计。',
      isDefault: false,
      priority: 40,
      status: 'inactive' as const,
      models: ['gemini-2.5-pro-preview'],
      ips: ['10.12.0.0/16', '172.16.2.0/24'],
      apiKeys: ['ak_dev_test', 'ak_cli_local'],
      budget: '5000',
    },
  ]
  const sample = samples[index % samples.length]
  const id = `mock-guardrail-${index + 1}`

  return {
    id,
    name: index < samples.length ? sample.name : `${sample.name} ${Math.floor(index / samples.length) + 1}`,
    description: sample.description,
    status: sample.status,
    is_default: index === 0 ? true : sample.isDefault,
    priority: sample.priority - index,
    scope_level: 'workspace',
    policy_id: `mock-policy-${index + 1}`,
    gateway_policy_version: 1,
    version: 1,
    tenant_id: 'mock-tenant',
    workspace_id: workspaceId,
    metadata: {
      model_blacklist: sample.models,
      ip_whitelist: sample.ips,
    },
    created_at: createdAt,
    updated_at: createdAt,
    assignments: sample.apiKeys.map((key, keyIndex) => assignment(id, key, keyIndex)),
    budget_policies: [budgetPolicy(id, sample.budget)],
  }
}

function ensureMockGuardrails(workspaceId: string) {
  const count = useDevStore.getState().mockGuardrailCount
  if (workspaceId !== mockWorkspaceId || mockConfiguredCount !== count) {
    mockWorkspaceId = workspaceId
    mockConfiguredCount = count
    mockGuardrails = Array.from({ length: count }, (_, index) => guardrailBase(workspaceId, index))
  }
  return mockGuardrails
}

function findMockGuardrail(guardrailId: string) {
  return mockGuardrails.find((item) => item.id === guardrailId) ?? guardrailBase(mockWorkspaceId || 'mock-workspace', 0)
}

export function listGuardrails(workspaceId: string) {
  if (mockEnabled()) return Promise.resolve({ items: ensureMockGuardrails(workspaceId) })
  return get<GuardrailListResponse>(`workspaces/${workspaceId}/guardrails`)
}

export function createGuardrail(workspaceId: string, body: CreateGuardrailRequest) {
  if (mockEnabled()) {
    const items = ensureMockGuardrails(workspaceId)
    const timestamp = nowIso()
    const item: GuardrailDetail = {
      ...guardrailBase(workspaceId, items.length),
      id: `mock-guardrail-created-${Date.now()}`,
      name: body.name,
      description: body.description ?? '',
      is_default: Boolean(body.is_default),
      priority: body.priority ?? 0,
      status: 'active',
      metadata: body.metadata ?? {},
      created_at: timestamp,
      updated_at: timestamp,
      assignments: [],
      budget_policies: [],
    }
    mockGuardrails = [item, ...items]
    return Promise.resolve(item)
  }
  return post<GuardrailDetail>(`workspaces/${workspaceId}/guardrails`, body)
}

export function getGuardrail(guardrailId: string) {
  if (mockEnabled()) return Promise.resolve(findMockGuardrail(guardrailId))
  return get<GuardrailDetail>(`guardrails/${guardrailId}`)
}

export function updateGuardrail(guardrailId: string, body: UpdateGuardrailRequest) {
  if (mockEnabled()) {
    const current = findMockGuardrail(guardrailId)
    const updated: GuardrailDetail = {
      ...current,
      name: body.name ?? current.name,
      description: body.description ?? current.description,
      is_default: body.is_default ?? current.is_default,
      priority: body.priority ?? current.priority,
      status: body.status ?? current.status,
      metadata: body.metadata ?? current.metadata,
      updated_at: nowIso(),
    }
    mockGuardrails = mockGuardrails.map((item) => (item.id === guardrailId ? updated : item))
    return Promise.resolve(updated)
  }
  return patch<GuardrailDetail>(`guardrails/${guardrailId}`, body)
}

export function replaceAssignments(guardrailId: string, assignments: AssignmentInput[]) {
  if (mockEnabled()) {
    const current = findMockGuardrail(guardrailId)
    const nextAssignments = assignments.map((item, index) => ({
      id: `${guardrailId}-assignment-${index}`,
      subject_type: item.subject_type,
      account_id: item.account_id ?? '',
      api_key_id: item.api_key_id ?? '',
      assigned_at: nowIso(),
    }))
    const updated = { ...current, assignments: nextAssignments, updated_at: nowIso() }
    mockGuardrails = mockGuardrails.map((item) => (item.id === guardrailId ? updated : item))
    return Promise.resolve(updated)
  }
  return put<GuardrailDetail>(`guardrails/${guardrailId}/assignments`, { assignments })
}

export function addBudgetPolicy(guardrailId: string, body: AddBudgetPolicyRequest) {
  if (mockEnabled()) {
    const current = findMockGuardrail(guardrailId)
    const nextBudget = {
      ...budgetPolicy(guardrailId, body.spend_limit_amount ?? '0'),
      aggregation_scope: body.aggregation_scope,
      period_unit: body.period_unit,
      period_length: body.period_length ?? 1,
      enforcement_mode: body.enforcement_mode ?? 'hard_limit',
      enabled: body.enabled ?? true,
      currency: body.currency ?? 'CNY',
      timezone: body.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Shanghai',
      token_limit: body.token_limit ?? 0,
      request_limit: body.request_limit ?? 0,
      rate_token_limit: body.rate_token_limit ?? 0,
      rate_request_limit: body.rate_request_limit ?? 0,
      rate_window_seconds: body.rate_window_seconds ?? 0,
    }
    const updated = { ...current, budget_policies: [nextBudget], updated_at: nowIso() }
    mockGuardrails = mockGuardrails.map((item) => (item.id === guardrailId ? updated : item))
    return Promise.resolve(updated)
  }
  return post<GuardrailDetail>(`guardrails/${guardrailId}/budget-policies`, body)
}

export function deleteBudgetPolicy(guardrailId: string, budgetPolicyId: string) {
  if (mockEnabled()) {
    const current = findMockGuardrail(guardrailId)
    const updated = {
      ...current,
      budget_policies: current.budget_policies.filter((item) => item.id !== budgetPolicyId),
      updated_at: nowIso(),
    }
    mockGuardrails = mockGuardrails.map((item) => (item.id === guardrailId ? updated : item))
    return Promise.resolve(updated)
  }
  return del<GuardrailDetail>(`guardrails/${guardrailId}/budget-policies/${budgetPolicyId}`)
}
export function deleteGuardrail(guardrailId: string) {
  if (mockEnabled()) {
    mockGuardrails = mockGuardrails.filter((item) => item.id !== guardrailId)
    return Promise.resolve()
  }
  return del<void>(`guardrails/${guardrailId}`)
}
