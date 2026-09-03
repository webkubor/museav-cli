/**
 * 智能客服工单体系（问题反馈 / 人工服务）的接口类型。
 *
 * 契约真源：《ModelGo 智能客服与工单体系技术方案（v0.1）》§5.1 用户侧 API、§4.1 工单主表、
 * §4.5 状态机与四态口径、§4.6 展示类型与能力位。**后端预计 9/7 上线**，本文件先按契约落类型。
 *
 * 三条口径（来自 §4.5 / §4.6，前端不得自行推算）：
 *   1. 状态是英文枚举 `status`，展示用服务端下发的 `status_label`；
 *      「排队中」「待客服联系」「待用户回复」都不是状态值，是 pending/processing 的展示文案。
 *   2. 能力位 `capabilities`（下划线命名）由服务端计算下发，前端不按状态字符串推按钮显隐。
 *   3. 工单编号、预计响应时间由服务端返回，前端不本地生成、不硬编码「2 小时内」
 *      （§13 明确该承诺值是服务端配置项）。
 */

/** §4.5：状态只有四个取值，服务端是唯一权威 */
export type SupportTicketStatus = 'pending' | 'processing' | 'resolved' | 'cancelled'

/** §4.1：三类工单共用聚合根，类型 + 服务模式派生展示类型 */
export type SupportTicketType = 'feedback' | 'human_support'
export type SupportServiceMode = 'live' | 'async'

/** §4.6 能力位表。注意是下划线命名，且由服务端下发 */
export interface SupportTicketCapabilities {
  can_reply: boolean
  can_supplement: boolean
  can_reopen: boolean
  can_create_followup: boolean
}

/** §5.1 的工单摘要结构（建单接口直接返回同一形状，见 §6.6：REST 响应同时直接返回工单摘要） */
export interface SupportTicketSummary {
  ticket_id: string
  ticket_type: SupportTicketType
  service_mode: SupportServiceMode | null
  /** 服务端派生的展示类型，如「问题反馈」「人工服务 · 转异步」 */
  display_type: string
  status: SupportTicketStatus
  /** 展示用中文标签，如 pending + feedback → 「等待客服受理」（§4.5 映射表） */
  status_label: string
  title: string
  latest_visible_message?: string
  created_at: string
  updated_at: string
  assignee_display_name?: string | null
  version: number
  latest_message_seq?: number
  read_message_seq?: number
  unread_count?: number
  source_ticket_id?: string | null
  capabilities: SupportTicketCapabilities
}

/**
 * POST /support/attachments 的返回。
 *
 * §6.6：附件先经 web-api 上传到 OSS 换回 `oss://` 引用，再带引用调建单接口。
 * §4.3 `support_attachments` 表列：id / object_ref / file_name / mime_type / size_bytes / scan_status。
 * 前端只需要 `id`（建单入参是「附件 ID 列表」）与 `file_name`（表单回显），
 * 其余字段按表结构声明为可选，避免后端多返/少返就类型报错。
 */
export interface SupportAttachment {
  id: string
  file_name: string
  mime_type?: string
  size_bytes?: number
  /** §4.3：扫描未通过不可预览下载 */
  scan_status?: 'pending' | 'clean' | 'rejected'
}

/**
 * POST /support/feedback 入参。
 *
 * §5.1 原文：「入参含问题类型、描述、发生时间、Request ID、附件 ID 列表与页面上下文；
 * `client_submission_id` 幂等；返回工单编号与预计响应时间」。
 *
 * ⚠️ 除 `client_submission_id` 外，技术方案没有逐字给出 JSON 字段名。这里的键名直接取
 * §4.1 `support_tickets` 里同一批事实的列名（category / description / request_id /
 * page_name / page_path / conversation_id），是与文档措辞距离最近的映射，**不是前端发明**；
 * 联调时若后端实际键名不同，改这一处即可。占位含义已在每行注释标出。
 */
export interface SupportFeedbackRequest {
  /** 幂等键，重复提交返回同一张工单（§6.6） */
  client_submission_id: string
  /** 问题类型（§4.1 `category`：问题反馈的问题类型） */
  category: string
  /** 问题描述（§4.1 `description`） */
  description: string
  /** 发生时间，ISO 8601 带时区 */
  occurred_at?: string
  /** 关联调用日志用（§4.1 `request_id`） */
  request_id?: string
  /** 附件 ID 列表（§5.1「附件 ID 列表」，来自 POST /support/attachments） */
  attachment_ids?: string[]
  /** 页面上下文（§4.1 `page_name` / `page_path`），PRD §7.5 要求随反馈一并记录 */
  page_name?: string
  page_path?: string
  /** 关联本次问答会话（§4.1 `conversation_id`） */
  conversation_id?: string | null
}

/**
 * POST /support/feedback 返回：工单摘要 + 预计响应时间。
 *
 * ⚠️ 「预计响应时间」的字段名技术方案未给出（§5.1 只写返回它，§13 写明该承诺值由客服团队
 * 确认并做成配置而非硬编码文案）。这里声明为可选，**取不到就不展示这一行**，
 * 绝不回退成前端写死的「2 小时内」。字段名待后端确认。
 */
export interface SupportFeedbackResponse extends SupportTicketSummary {
  expected_response_label?: string
}

/* ────────────────────────────────────────────────────────────────────────────
 * 以下为 V1.0.6 全量客服工单体系补齐的契约（技术方案 §4.2 / §5.1 / §5.3）。
 * 后端负责人熊仁杰，《v1.0.6后端分工》给的开发截止是 9/11 —— 除 `/agent/chat`
 * 外这批端点尚未上线，联调前一律按本文件的类型对照文档核，不改这里去迁就实现。
 * ──────────────────────────────────────────────────────────────────────────── */

/** §5.1：服务记录列表的三个筛选页签 */
export type SupportTicketFilter = 'all' | 'processing' | 'ended'

/** GET /support/tickets 入参。cursor 是 (has_unread, updated_at, id) 编码后的不透明串，前端不解析 */
export interface SupportTicketListQuery {
  filter?: SupportTicketFilter
  query?: string
  cursor?: string | null
  limit?: number
}

export interface SupportTicketListResponse {
  items: SupportTicketSummary[]
  next_cursor: string | null
  total: number
}

/**
 * §4.2：系统状态、客服消息、用户消息与附件共用同一顺序号 seq。
 * `kind` 决定渲染成气泡、系统行、附件行还是评价行。
 */
export type SupportMessageKind = 'message' | 'system' | 'attachment' | 'rating'
export type SupportMessageSender = 'user' | 'agent' | 'system'

export interface SupportTicketMessage {
  message_id: string
  seq: number
  kind: SupportMessageKind
  sender_type: SupportMessageSender
  content: string
  created_at: string
  /** 附件行才有；下载地址要另调 GET /support/attachments/{id}/url 换短期签名 URL */
  attachment?: SupportAttachment
}

export interface SupportTicketMessagePage {
  items: SupportTicketMessage[]
  next_cursor: string | null
}

/**
 * §6.11：处理记录的外露过滤在服务端完成 —— 更换处理人、优先级调整、关联工单
 * 一律不出现在响应里。前端拿到的每条都是可展示的，不再自行过滤。
 */
export type SupportHandlingEventType =
  | 'ticket.created'
  | 'ticket.claimed'
  | 'ticket.contact_recorded'
  | 'ticket.waiting_user'
  | 'ticket.resumed'
  | 'ticket.resolved'

export interface SupportHandlingEvent {
  id: string
  type: SupportHandlingEventType
  actor_name: string
  created_at: string
  summary: string
}

/** §7.10 问题反馈详情：表单快照 + 补充记录，Request ID 与附件为空时服务端整行不返回 */
export interface SupportFeedbackSnapshot {
  category: string
  description: string
  occurred_at?: string
  request_id?: string
  attachments?: SupportAttachment[]
}

export interface SupportSupplement {
  id: string
  content: string
  created_at: string
  attachments?: SupportAttachment[]
}

/**
 * GET /support/tickets/{id}：按类型返回不同结构（§6.11）。
 *   · 人工服务   → messages + rating，作为主面板那场会话的归档回看
 *   · 转异步     → messages + handling_events，开放回复
 *   · 问题反馈   → feedback + supplements + handling_events，无对话气泡
 * 三者共用摘要头，所以这里用可选字段而不是联合类型 —— 服务端按类型省略无关字段。
 */
export interface SupportTicketDetail extends SupportTicketSummary {
  messages?: SupportTicketMessage[]
  handling_events?: SupportHandlingEvent[]
  feedback?: SupportFeedbackSnapshot
  supplements?: SupportSupplement[]
  /** 已解决时客服填写的解决结论 */
  resolution?: string
  /** 人工服务已提交的五星评价 */
  rating?: number | null
  /** processing + waiting_user=true → 列表额外标「待你回复」（§4.5，不是新状态值） */
  waiting_user?: boolean
}

/** §5.3 事件类型枚举 */
export type SupportEventType =
  | 'ticket.created'
  | 'ticket.status_changed'
  | 'ticket.async_converted'
  | 'message.created'
  | 'ticket.read_cursor_changed'
  | 'ticket.reopened'
  | 'ticket.resolved'
  | 'ticket.cancelled'
  | 'presence.changed'
  | 'queue.position_changed'

/** §5.3 事件信封。version 是每张工单的单调版本，充当长轮询游标 */
export interface SupportEvent {
  event_id: string
  ticket_id: string
  version: number
  seq?: number
  type: SupportEventType
  occurred_at: string
  payload: {
    status?: SupportTicketStatus
    status_label?: string
    waiting_user?: boolean
    message?: string
    queue_position?: number
    sender_type?: SupportMessageSender
    read_seq?: number
    resolution?: string
    actor?: string
    state?: string
    /** 转异步事件带上预计联系时长文案，卡片直接用，不前端拼「2 小时内」 */
    expected_contact_label?: string
    ticket?: SupportTicketSummary
  }
}

/**
 * GET /support/events 长轮询响应（§5.3）。
 * 无新事件时服务端返回 204 + 空 events；`retry_after` 为正数表示服务端过载，按它退避。
 */
export interface SupportEventsResponse {
  events: SupportEvent[]
  server_versions?: Array<{ ticket_id: string; version: number }>
  /** 缺口过大的工单：改走列表全量对齐，不再按游标补拉 */
  resync_required?: string[]
  retry_after?: number
}

/** POST /support/handoff：同事务建单、入队、写上下文快照 */
export interface SupportHandoffRequest {
  client_submission_id: string
  /** 触发方式，用于埋点 support_handoff_start 的 trigger 属性 */
  trigger: 'button' | 'intent'
  conversation_id?: string | null
  page_name?: string
  page_path?: string
  request_id?: string
}

export interface SupportHandoffResponse extends SupportTicketSummary {
  /** 排队位次 = 前方人数，后续变化走 queue.position_changed 事件 */
  queue_position?: number
}

/** POST /support/tickets/{id}/messages：转异步工单回复 */
export interface SupportTicketReplyRequest {
  /** 幂等键，(ticket_id, client_message_id) 唯一索引 */
  client_message_id: string
  content: string
  attachment_ids?: string[]
}

/** POST /support/tickets/{id}/supplements：仅问题反馈 */
export interface SupportSupplementRequest {
  client_message_id: string
  content: string
  attachment_ids?: string[]
}

/** POST /agent/messages/{id}/rating：智能回答点赞点踩，两者互斥、会话内可改判 */
export type SupportAnswerRatingValue = 'up' | 'down'

/** POST /support/tickets/{id}/rating：人工服务五星，仅 live 且已解决，一次性 */
export type SupportHumanRatingValue = 1 | 2 | 3 | 4 | 5
