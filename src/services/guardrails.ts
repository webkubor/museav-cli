import { del, get, patch, post, put } from '@/lib/request'
import type {
  AddBudgetPolicyRequest,
  AssignmentInput,
  CreateGuardrailRequest,
  GuardrailDetail,
  GuardrailListResponse,
  UpdateGuardrailRequest,
} from '@/interfaces/guardrails'

export function listGuardrails(workspaceId: string) {
  return get<GuardrailListResponse>(`workspaces/${workspaceId}/guardrails`)
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

export function deleteBudgetPolicy(guardrailId: string, budgetPolicyId: string) {
  return del<GuardrailDetail>(`guardrails/${guardrailId}/budget-policies/${budgetPolicyId}`)
}
