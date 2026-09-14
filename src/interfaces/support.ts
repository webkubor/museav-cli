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
  | 'human_handoff'
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
  /** 敏感信息检测结果，实测字段名首字母大写（Go 结构体直出）：{ Hit: false, Kind: "" } */
  sensitive?: { Hit?: boolean; Kind?: string }
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
  /** SLA 文案实测在这里（「我们将在 1 个工作日内联系你。」）；PRD 叫 sla_text。 */
  next_step?: string
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

/**
 * 工单摘要 —— 字段按 2026-09-14 test 实测响应写，不是 PRD 措辞。
 * 实测原文（`GET /support/tickets?filter=all`）：
 * ```
 * { ticket_id:"CS-20260914-2377", ticket_type:"human_support", service_mode:"live",
 *   display_type:"人工服务", status:"pending", status_label:"排队中 · 前方 0 人",
 *   title, description, assignee_display_name:"", version, latest_message_seq,
 *   read_message_seq, unread_count:0, capabilities:{...}, next_step:"我们将在 1 个工作日内联系你。" }
 * ```
 * 旧字段（id / ticket_no / type / unread）后端一个都不下发，留成可选只为兼容老代码路径。
 */
export interface SupportTicketSummary {
  /** 编号本体，就是展示用的 CS-/FB- 号。 */
  ticket_id: string
  ticket_type?: 'feedback' | 'human_support'
  /** 已本地化的类型名（「人工服务」「人工服务 · 转异步」「问题反馈」），直接上屏。 */
  display_type?: string
  status: string
  /** 已本地化的状态文案（「排队中 · 前方 0 人」「待客服联系」「等待客服受理」）。
   *  status 是机器码，**上屏一律用这个**，前端不再自己拼状态文案。 */
  status_label?: string
  service_mode?: SupportServiceMode
  title?: string
  description?: string
  /** 客服显示名；非空 = 已接通（前端据此判排队/接通，不依赖 status 枚举）。 */
  assignee_display_name?: string
  /** SLA / 下一步文案（「我们将在 1 个工作日内联系你。」）—— PRD 叫 sla_text，后端叫这个。 */
  next_step?: string
  latest_message_seq?: number
  read_message_seq?: number
  unread_count?: number
  version?: number
  created_at: string
  updated_at: string

  // ↓ 兼容位：后端实测不下发
  id?: string
  ticket_no?: string
  type?: 'feedback' | 'handoff'
  unread?: boolean
}

export interface SupportTicketDetail extends SupportTicketSummary {
  /** 后端实测用 assignee_display_name；agent_name/agent_no 从未下发，保留兼容。 */
  agent_name?: string
  agent_no?: string
  rating?: number
  sla_text?: string
  capabilities: SupportTicketCapabilities
}

/** 统一取值口径：编号 / 状态文案 / SLA / 是否已接通，一处定义，调用方不再各拼各的。 */
export function ticketNoOf(t: Pick<SupportTicketSummary, 'ticket_id' | 'ticket_no' | 'id'>): string {
  return t.ticket_id || t.ticket_no || t.id || ''
}

export function ticketStatusTextOf(t: Pick<SupportTicketSummary, 'status_label' | 'status'>): string {
  return t.status_label || t.status || ''
}

export function ticketSlaTextOf(t: Pick<SupportTicketSummary, 'next_step'> & { sla_text?: string }): string | undefined {
  return t.next_step || t.sla_text || undefined
}

export function ticketAgentNameOf(t: Pick<SupportTicketSummary, 'assignee_display_name'> & { agent_name?: string }): string | undefined {
  return t.assignee_display_name || t.agent_name || undefined
}

export function ticketUnreadOf(t: Pick<SupportTicketSummary, 'unread_count' | 'unread'>): boolean {
  return (t.unread_count ?? 0) > 0 || t.unread === true
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

/**
 * `GET /support/events` 的**实测**响应（2026-09-14 test）：
 * ```
 * { events: [{ id, ticket_id, version, type: "ticket.created", actor_type,
 *              actor_id, actor_name, summary, visible_to_user, created_at }],
 *   resync_required: [], retry_after: 0,
 *   server_versions: [{ ticket_id, version }] }
 * ```
 * 它是**变更信号**，不带 service_mode / queue_position / has_new_messages
 * ——那三个字段是照 PRD 写的，后端从没下发过，导致长轮询空转：排队→接通、
 * 超时转异步、新消息全都推不动。真状态一律以工单详情为准。
 */
export interface SupportEventItem {
  id: string
  ticket_id: string
  version: number
  type: string
  actor_type?: string
  actor_id?: string
  actor_name?: string
  summary?: string
  visible_to_user?: boolean
  created_at?: string
}

export interface SupportEventsResponse {
  events?: SupportEventItem[]
  resync_required?: string[]
  retry_after?: number
  server_versions?: { ticket_id: string; version: number }[]
}

/** 由工单详情推导出的状态快照，喂给面板的模式机。 */
export interface SupportTicketSnapshot {
  service_mode?: SupportServiceMode
  status?: string
  status_label?: string
  agent_name?: string
  has_new_messages?: boolean
}
