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

/**
 * 人工服务形态。`live` 是后端实测返回值（2026-09-14 test：`POST /support/handoff`
 * 回 `service_mode:"live"` + `status:"pending"` + `status_label:"排队中 · 前方 0 人"`），
 * PRD 里没有这个取值 —— 前端 switch 不认它就返回 undefined，整棵 React 树白屏。
 * 语义上 live 是「实时人工」这条线（对应 async 异步工单），排队到哪一步看 status。
 */
export type SupportServiceMode = 'queueing' | 'connecting' | 'connected' | 'ended' | 'async' | 'live'

export type SupportTicketFilter = 'all' | 'processing' | 'ended'

export interface SupportAskRequest {
  message: string
  conversation_id?: string
  page_path?: string
}

export interface SupportAskResponse {
  /**
   * 回答 id。后端实测返回的是 `message_id`（2026-09-14 test 实测），
   * `answer_id` 从未出现过 —— 早期照 PRD 写的字段名，导致点赞点踩控件
   * 恒不渲染（渲染条件是 answerId 非空）。/support/* 不在 Swagger 里
   * （`/swagger/doc.json` 的 support 路径数 = 0），静态校验查不出来，
   * 只能以实测响应为准，两个名字都留着兼容。
   */
  message_id?: string
  answer_id?: string
  answer: string
  answer_status: SupportAnswerStatus
  conversation_id?: string
  sla_text?: string
  intent?: string
  confidence?: string
  suggest_handoff?: boolean
  suggest_feedback?: boolean
  needs_login?: boolean
  unresolved_streak?: number
}

/**
 * 匿名提问时后端回的占位 id：这条回答没落库，拿它调
 * `POST /support/answers/:id/rating` 没有意义，因此不展示评分控件。
 */
export const EPHEMERAL_ANSWER_ID = 'ans_ephemeral'

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
  /** 编号本体。实测就是这个字段（FB-20260914-8315）；后端不返回 ticket_no。 */
  ticket_id: string
  ticket_no?: string
  status: string
  /** 后端给的中文状态（「等待客服受理」）；status 是机器码（pending），不能直接上屏。 */
  status_label?: string
  sla_text?: string
}

export interface SupportHandoffRequest {
  page_path?: string
  summary?: string
}

export interface SupportHandoffResponse {
  ticket_id: string
  service_mode: SupportServiceMode
  status?: string
  /** 后端给的完整排队文案（「排队中 · 前方 0 人」）。 */
  status_label?: string
  /** 后端实测不下发，排队人数只能从 status_label 读；留着兼容将来补上。 */
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
