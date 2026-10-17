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
  /**
   * 会话标识（swagger support.swaggerAskRequest 字段名为 session_id，非早期的
   * conversation_id）。同一会话内保持稳定并本地持久化（刷新/重开保留），后端据此记住
   * 「已澄清」并支持多轮续问与「最多澄清一次」（shared/modelgo_prd#1057，PRD 6.1/6.4/6.6）。
   */
  session_id?: string
  /** 当前控制台路由，后端仅作只读范围提示，不覆盖问句主题（PRD 6.6）。 */
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
  /** 后端给的中文描述文案（「等待客服受理」）；上屏走 ticketStatusTextOf 取规范名，不要直接透传。 */
  status_label?: string
  /** SLA 文案实测在这里（「我们将在 1 个工作日内联系你。」）；PRD 叫 sla_text。 */
  next_step?: string
  sla_text?: string
}

/**
 * `POST /support/attachments`（web-api 中转上传到 OSS）的响应。
 * 拿到 `object_ref` 后再调 `POST /support/tickets/:id/attachments` 把附件关联到工单。
 */
export interface SupportAttachmentUploadResponse {
  object_ref: string
  file_name: string
  mime_type: string
  size_bytes: number
}

/** 工单附件（`GET /support/tickets/:id/attachments` 的 items[]，字段照 agent handler）。
 *  download_url 只有 OSS 附件才有；本地存储的附件要走单条下载接口拿 content_base64。 */
export interface SupportTicketAttachment {
  id: string
  ticket_id?: string
  file_name: string
  mime_type?: string
  size_bytes?: number
  download_url?: string
}

export interface SupportAttachmentContent extends SupportTicketAttachment {
  content_base64?: string
}

export interface SupportHandoffRequest {
  page_path?: string
  summary?: string
  /** 幂等键：同一次转人工意图的失败重试必须复用，避免后端重复建单（PRD 12.5）。 */
  client_submission_id: string
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
  /** 后端判定这张单现在能不能发消息（进行中的人工单为 true）。 */
  can_reply?: boolean
  can_reopen: boolean
  can_create_followup: boolean
  /** 问题反馈单处理中（pending/processing）时为 true：详情底部给「补充问题描述」入口。 */
  can_supplement?: boolean
}

/** 提交补充的结果 —— ok：成功，清空收起；failed：可重试，保留输入；closed：工单已不能补充，收起。 */
export type SupplementResult = 'ok' | 'failed' | 'closed'

/** 建单后追加的一条「补充问题描述」。详情页在描述区块内按「补充 · 时间」渲染，
 *  不当作沟通消息（PRD §7.11）；时间由前端格式化，便于中英文本地化。 */
export interface SupportTicketSupplement {
  id: string
  content: string
  created_at: string
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
  /** 上下文描述文案（「排队中 · 前方 0 人」「待客服联系」「等待客服受理」），**不是**规范状态名。
   *  列表/详情/回执的状态徽标统一走 ticketStatusTextOf 按机器码 status 取 PRD 规范名；
   *  只有人工服务面板的排队态需要这里面的描述文案，不要直接透传到状态徽标。 */
  status_label?: string
  service_mode?: SupportServiceMode
  title?: string
  description?: string
  /** Agent 列表返回的最新可见消息；反馈单创建时由脱敏后的 description 初始化。 */
  latest_visible_message?: string
  /** 兼容旧版列表字段。 */
  latest_message_preview?: string
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
  /** 后端下发的人工服务评分字段是 human_rating；rating 是早期口径，兼容保留。读取一律走 ticketRatingOf。 */
  human_rating?: number
  rating?: number
  /** 客服解决工单时填写的解决结论（agent ticketView.resolution，已脱敏）。 */
  resolution?: string
  sla_text?: string
  capabilities: SupportTicketCapabilities
  /** 只在详情接口下发（列表不带），按时间升序。 */
  supplements?: SupportTicketSupplement[]
  /** 问题反馈的问题类型机器码（bug / api_issue / billing / suggestion / other）。 */
  category?: string
  request_id?: string
  /** 反馈表单填写的发生时间。⚠️ 2026-09-28 核对 agent ticketView 尚未下发，前端有就显示。 */
  occurred_at?: string
}

/** 统一取值口径：编号 / 状态文案 / SLA / 是否已接通，一处定义，调用方不再各拼各的。 */
export function ticketNoOf(t: Pick<SupportTicketSummary, 'ticket_id' | 'ticket_no' | 'id'>): string {
  return t.ticket_id || t.ticket_no || t.id || ''
}

/**
 * 工单机器码 → PRD §7.6.1 规范状态名的 i18n key 后缀。
 * 后端 status_label 在 pending 态给的是描述文案（「等待客服受理」/「排队中 · 前方 N 人」），
 * 服务记录列表/详情要的是规范名（待处理/处理中/已解决/已取消），故按机器码映射。
 * 「已结束」只是筛选页签名，不是终态规范名（PRD §7.9 终态为已解决/已取消）。
 */
const SUPPORT_STATUS_KEY: Record<string, string> = {
  pending: 'pending',
  processing: 'processing',
  resolved: 'resolved',
  cancelled: 'cancelled',
}

/** 机器码是否有规范状态名；返回 i18n key 后缀，未识别返回 undefined。 */
export function supportStatusKeyOf(status?: string): string | undefined {
  return status ? SUPPORT_STATUS_KEY[status] : undefined
}

/**
 * 状态徽标/回执的统一文案：按机器码 status 取 PRD 规范名（待处理/处理中/已解决/已取消）；
 * status 未识别时才回退到后端 status_label。translate 传 react-i18next 的 t。
 */
export function ticketStatusTextOf(
  t: Pick<SupportTicketSummary, 'status_label' | 'status'>,
  translate: (key: string) => string,
): string {
  const key = supportStatusKeyOf(t.status)
  if (key) return translate(`common.customerService.tickets.statuses.${key}`)
  return t.status_label || t.status || ''
}

export function ticketSlaTextOf(t: Pick<SupportTicketSummary, 'next_step'> & { sla_text?: string }): string | undefined {
  return t.next_step || t.sla_text || undefined
}

/** 人工服务评分：后端字段是 human_rating，旧代码读 rating 导致已评分的单在详情里不显示星级（prd46#1202 附带项）。 */
export function ticketRatingOf(t: Pick<SupportTicketDetail, 'human_rating' | 'rating'>): number | undefined {
  // 0 / 越界都当未评分：否则会显示 5 颗空星、还把评分入口藏掉
  const v = t.human_rating ?? t.rating
  return typeof v === 'number' && v >= 1 && v <= 5 ? v : undefined
}

export function ticketAgentNameOf(t: Pick<SupportTicketSummary, 'assignee_display_name'> & { agent_name?: string }): string | undefined {
  return t.assignee_display_name || t.agent_name || undefined
}

/** 实时人工单：会话当场在主面板进行，用户即时可见（工单类型 PRD「未读触发」：人工服务 → 不触发）。 */
export function isLiveHumanTicket(t: Pick<SupportTicketSummary, 'ticket_type' | 'type' | 'service_mode'>): boolean {
  return (t.ticket_type === 'human_support' || t.type === 'handoff') && t.service_mode === 'live'
}

/** 这张单计入的未读条数。实时人工单恒为 0 —— 后端 UnreadCount 同口径，前端再兜一层，
 *  不能因为某次下发带了计数就把 live 单标成「有新消息」、或算进入口角标（#1153）。 */
export function ticketUnreadCountOf(t: Pick<SupportTicketSummary, 'unread_count' | 'unread' | 'ticket_type' | 'type' | 'service_mode'>): number {
  if (isLiveHumanTicket(t)) return 0
  const n = t.unread_count ?? 0
  return n > 0 ? n : t.unread === true ? 1 : 0
}

export function ticketUnreadOf(t: Pick<SupportTicketSummary, 'unread_count' | 'unread' | 'ticket_type' | 'type' | 'service_mode'>): boolean {
  return ticketUnreadCountOf(t) > 0
}

export interface SupportTicketListParams {
  filter?: SupportTicketFilter
  q?: string
  cursor?: string
  limit?: number
}

export type SupportMessageRole = 'user' | 'assistant' | 'agent' | 'system'

export interface SupportMessage {
  id: string
  /**
   * 前端气泡用的角色。后端实测字段是 `sender_type`（CS-20260917-4109：
   * `GET /support/tickets/:id/messages` 只下发 sender_type，从不下发 role），
   * 收口在 supportMessageRoleOf，调用方不要自己读 role。
   */
  role?: SupportMessageRole
  sender_type?: SupportMessageRole
  content: string
  created_at: string
  answer_status?: SupportAnswerStatus
  rating?: SupportAnswerRating | null
}

const SUPPORT_MESSAGE_ROLES = new Set<SupportMessageRole>(['user', 'assistant', 'agent', 'system'])

/** 消息角色：优先 role，否则用后端实测的 sender_type。 */
export function supportMessageRoleOf(m: Pick<SupportMessage, 'role' | 'sender_type'>): SupportMessageRole | undefined {
  const raw = m.role || m.sender_type
  return raw && SUPPORT_MESSAGE_ROLES.has(raw) ? raw : undefined
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
