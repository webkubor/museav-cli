/**
 * 智能客服闭环类型定义（shared/modelgo_prd#996）。
 *
 * 字段命名依据 issue 契约描述 + 仓内既有接口惯例（snake_case，游标分页 items/has_more/next_cursor，
 * 详见 src/lib/request.ts 的 getPage）。后端 test 已实现，但本仓 swagger 尚未收录 support/* 路径，
 * 若联调发现字段名有出入，以后端实测为准调整这一个文件即可（类型收口于此）。
 */

/** 智能问答回答状态：区分气泡文案与后续引导 */
export type SupportAnswerStatus =
  | 'answered'
  | 'answered_tool'
  | 'intent'
  | 'needs_login'
  | 'insufficient_evidence'
  | 'degraded'
  | 'out_of_scope'
  | 'suggest_handoff'

export type SupportAnswerRating = 'like' | 'dislike'

export type SupportServiceMode = 'queueing' | 'connecting' | 'connected' | 'ended' | 'async'

export type SupportTicketFilter = 'all' | 'processing' | 'ended'

export interface SupportAskRequest {
  message: string
  conversation_id?: string
  page_path?: string
}

export interface SupportAskResponse {
  answer_id: string
  answer: string
  answer_status: SupportAnswerStatus
  conversation_id?: string
  sla_text?: string
}

export interface SupportFeedbackRequest {
  /** 幂等键，crypto.randomUUID() 生成 */
  client_submission_id: string
  category: string
  description: string
  occurred_at?: string
  request_id?: string
  page_path?: string
}

export interface SupportFeedbackResponse {
  ticket_id: string
  ticket_no: string
  status: string
  sla_text?: string
}

export interface SupportHandoffRequest {
  page_path?: string
  summary?: string
}

export interface SupportHandoffResponse {
  ticket_id: string
  service_mode: SupportServiceMode
  queue_position?: number
  agent_name?: string
  agent_no?: string
}

export interface SupportHandoffEndRequest {
  rating?: number
  skip?: boolean
}

export interface SupportTicketCapabilities {
  can_reopen: boolean
  can_create_followup: boolean
}

export interface SupportTicketSummary {
  id: string
  ticket_no: string
  type: 'feedback' | 'handoff'
  status: string
  service_mode?: SupportServiceMode
  title?: string
  created_at: string
  updated_at: string
  unread?: boolean
}

export interface SupportTicketDetail extends SupportTicketSummary {
  description?: string
  agent_name?: string
  agent_no?: string
  rating?: number
  sla_text?: string
  capabilities: SupportTicketCapabilities
}

export interface SupportTicketListParams {
  filter?: SupportTicketFilter
  q?: string
  cursor?: string
  limit?: number
}

export interface SupportMessage {
  id: string
  role: 'user' | 'assistant' | 'agent' | 'system'
  content: string
  created_at: string
  answer_status?: SupportAnswerStatus
  rating?: SupportAnswerRating | null
}

export interface SupportEventsResponse {
  service_mode?: SupportServiceMode
  queue_position?: number
  has_new_messages?: boolean
}
