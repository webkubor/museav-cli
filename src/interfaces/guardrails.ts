export interface GuardrailAssignment {
  id: string
  subject_type: 'member' | 'api_key'
  account_id: string
  api_key_id: string
  assigned_at: string
}

export interface GuardrailBudgetPolicy {
  id: string
  aggregation_scope: 'guardrail_total' | 'per_member' | 'per_api_key'
  enforcement_mode: 'monitor' | 'soft_limit' | 'hard_limit'
  enabled: boolean
  currency: string
  timezone: string
  period_unit: 'hour' | 'day' | 'week' | 'month'
  period_length: number
  spend_limit_amount: string
  token_limit: number
  request_limit: number
  rate_token_limit: number
  rate_request_limit: number
  rate_window_seconds: number
  effective_from: string
  effective_to: string
}

export interface GuardrailDetail {
  id: string
  name: string
  description: string
  status: 'active' | 'inactive' | 'archived'
  is_default: boolean
  priority: number
  scope_level: string
  policy_id: string
  gateway_policy_version: number
  version: number
  tenant_id: string
  workspace_id: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  assignments: GuardrailAssignment[]
  budget_policies: GuardrailBudgetPolicy[]
}

export interface CreateGuardrailRequest {
  name: string
  description?: string
  is_default?: boolean
  priority?: number
  metadata?: Record<string, unknown>
}

export interface UpdateGuardrailRequest {
  name?: string
  description?: string
  is_default?: boolean
  priority?: number
  status?: 'active' | 'inactive' | 'archived'
  metadata?: Record<string, unknown>
}

export interface AssignmentInput {
  subject_type: 'member' | 'api_key'
  account_id?: string
  api_key_id?: string
}

export interface AddBudgetPolicyRequest {
  aggregation_scope: 'guardrail_total' | 'per_member' | 'per_api_key'
  period_unit: 'hour' | 'day' | 'week' | 'month'
  period_length?: number
  enforcement_mode?: 'monitor' | 'soft_limit' | 'hard_limit'
  enabled?: boolean
  currency?: string
  timezone?: string
  spend_limit_amount?: string
  token_limit?: number
  request_limit?: number
  rate_token_limit?: number
  rate_request_limit?: number
  rate_window_seconds?: number
  /** 原子替换：后端在同一事务内停用该策略并创建新策略，避免先删后加丢预算 (qa#156) */
  replace_budget_policy_id?: string
}

export interface GuardrailListResponse {
  items: GuardrailDetail[]
}
