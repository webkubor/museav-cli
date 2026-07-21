import { del, get, patch, post, put } from '@/lib/request'
import type {
  AddBudgetPolicyRequest,
  AssignmentInput,
  CreateGuardrailRequest,
  GuardrailAuditLogsResponse,
  GuardrailDetail,
  GuardrailListResponse,
  UpdateBudgetPolicyRequest,
  UpdateGuardrailRequest,
} from '@/interfaces/guardrails'

export function listGuardrails(workspaceId: string) {
  return get<GuardrailListResponse>(`workspaces/${workspaceId}/guardrails`)
}

/** 操作记录（GET /workspaces/{workspaceId}/guardrails/audit）：按工作空间返回，
 *  调用方按 target_id 过滤出单条护栏的记录。 */
export function listGuardrailAudit(workspaceId: string, params?: { cursor?: string; limit?: number }) {
  return get<GuardrailAuditLogsResponse>(`workspaces/${workspaceId}/guardrails/audit`, params)
}

export function createGuardrail(workspaceId: string, body: CreateGuardrailRequest) {
  return post<GuardrailDetail>(`workspaces/${workspaceId}/guardrails`, body)
}

export function getGuardrail(guardrailId: string) {
  return get<GuardrailDetail>(`guardrails/${guardrailId}`)
}

export function updateGuardrail(guardrailId: string, body: UpdateGuardrailRequest) {
  return patch<GuardrailDetail>(`guardrails/${guardrailId}`, body)
}

export function replaceAssignments(guardrailId: string, assignments: AssignmentInput[]) {
  return put<GuardrailDetail>(`guardrails/${guardrailId}/assignments`, { assignments })
}

export function addBudgetPolicy(guardrailId: string, body: AddBudgetPolicyRequest) {
  return post<GuardrailDetail>(`guardrails/${guardrailId}/budget-policies`, body)
}

/** qa#164 单条维护：原地编辑同一条预算策略（同一 id），省略字段保持原值 */
export function updateBudgetPolicy(guardrailId: string, budgetPolicyId: string, body: UpdateBudgetPolicyRequest) {
  return patch<GuardrailDetail>(`guardrails/${guardrailId}/budget-policies/${budgetPolicyId}`, body)
}

export function deleteBudgetPolicy(guardrailId: string, budgetPolicyId: string) {
  return del<GuardrailDetail>(`guardrails/${guardrailId}/budget-policies/${budgetPolicyId}`)
}

export function deleteGuardrail(guardrailId: string) {
  return del<void>(`guardrails/${guardrailId}`)
}
