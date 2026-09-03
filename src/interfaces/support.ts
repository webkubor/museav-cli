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
