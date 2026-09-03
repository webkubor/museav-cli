/**
 * 智能客服工单接口（问题反馈、转人工、服务记录、工单详情与评价）。
 *
 * 契约见《ModelGo 智能客服与工单体系技术方案（v0.1）》§5.1。
 * **后端负责人熊仁杰，《v1.0.6后端分工》给的开发截止是 9/11** —— 除 `/agent/chat`
 * 外这批端点尚未上线，调用会失败，失败一律如实抛出，不在这一层兜数据。
 * 路径不带 `api/v1` 前缀 —— `src/lib/request.ts` 会统一补齐；鉴权沿用会话 cookie + CSRF 双提交，
 * 业务失败仍是 HTTP 200，错误落在 `code`/`errors`，由 request.ts 的信封解包统一抛成 ModelGoApiError。
 */

import { get, post, upload } from '@/lib/request'
import type {
  SupportAnswerRatingValue,
  SupportAttachment,
  SupportFeedbackRequest,
  SupportFeedbackResponse,
  SupportHandoffRequest,
  SupportHandoffResponse,
  SupportHumanRatingValue,
  SupportSupplementRequest,
  SupportTicketDetail,
  SupportTicketListQuery,
  SupportTicketListResponse,
  SupportTicketMessagePage,
  SupportTicketReplyRequest,
  SupportTicketSummary,
} from '@/interfaces/support'

/**
 * 上传反馈附件，换回附件 ID 用于建单（§6.6：提交分两步，先传附件再建单）。
 * 类型、大小、数量与病毒扫描由服务端校验，前端不重复实现规则（§5.1）。
 */
export function uploadSupportAttachment(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return upload<SupportAttachment>('post', 'support/attachments', formData)
}

/** 提交问题反馈建单，返回工单摘要（编号、状态与 status_label、预计响应时间） */
export function submitSupportFeedback(body: SupportFeedbackRequest) {
  return post<SupportFeedbackResponse>('support/feedback', body)
}

/* ────────────────────────────────────────────────────────────────────────────
 * V1.0.6 全量端点（技术方案 §5.1）。后端 9/11 交付，此前调用会失败 ——
 * 失败一律如实抛给调用方，由 UI 显示错误态，不在这一层兜数据、不伪造成功。
 *
 * 长轮询 GET /support/events 不在这里：它要挂起 55 秒且要能被登出立即中断，
 * 超出 request.ts 的 30 秒默认超时与信封解包模型，实现在
 * `components/customer-service/use-support-events.ts` 里直接用 fetch。
 * ──────────────────────────────────────────────────────────────────────────── */


/** 智能回答点赞点踩。两者互斥，同一会话内可改判；传 null 取消评价 */
export function rateAssistantAnswer(messageId: string, rating: SupportAnswerRatingValue | null) {
  return post<void>(`agent/messages/${encodeURIComponent(messageId)}/rating`, { rating })
}

/** 发起转人工：同事务建单、入队、写上下文快照，返回工单摘要 + 排队位次 */
export function startSupportHandoff(body: SupportHandoffRequest) {
  return post<SupportHandoffResponse>('support/handoff', body)
}

/** 取消排队或取消转接。仅 pending 可取消，置 cancelled；不创建转异步工单 */
export function cancelSupportHandoff(ticketId: string) {
  return post<SupportTicketSummary>('support/handoff/cancel', { ticket_id: ticketId })
}

/** 用户结束人工服务：只结束连接，不改工单处理状态（是否解决由客服判定） */
export function endSupportHandoff(ticketId: string) {
  return post<SupportTicketSummary>('support/handoff/end', { ticket_id: ticketId })
}

/** 服务记录列表。游标是不透明串，直接回传服务端 */
export function listSupportTickets(query: SupportTicketListQuery = {}) {
  return get<SupportTicketListResponse>('support/tickets', {
    ...(query.filter ? { filter: query.filter } : {}),
    ...(query.query?.trim() ? { query: query.query.trim() } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
    limit: query.limit ?? 10,
  })
}

/** 工单详情。按类型返回不同结构，处理记录只含 visible_to_user = true 的事件 */
export function getSupportTicket(ticketId: string) {
  return get<SupportTicketDetail>(`support/tickets/${encodeURIComponent(ticketId)}`)
}

/** 消息分页，按 seq 游标 */
export function listSupportTicketMessages(ticketId: string, cursor?: string | null, limit = 30) {
  return get<SupportTicketMessagePage>(`support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    ...(cursor ? { cursor } : {}),
    limit,
  })
}

/** 转异步工单回复（需 can_reply）。client_message_id 幂等 */
export function replySupportTicket(ticketId: string, body: SupportTicketReplyRequest) {
  return post<SupportTicketSummary>(`support/tickets/${encodeURIComponent(ticketId)}/messages`, body)
}

/** 补充问题描述（仅问题反馈，需 can_supplement） */
export function supplementSupportTicket(ticketId: string, body: SupportSupplementRequest) {
  return post<SupportTicketDetail>(`support/tickets/${encodeURIComponent(ticketId)}/supplements`, body)
}

/** 推进已读游标。幂等、只增不减，服务端产生 ticket.read_cursor_changed 供多端同步 */
export function markSupportTicketRead(ticketId: string, readSeq: number) {
  return post<void>(`support/tickets/${encodeURIComponent(ticketId)}/read`, { read_message_seq: readSeq })
}

/** 提交五星评价。仅 live 且已解决，一次性 */
export function rateSupportTicket(ticketId: string, rating: SupportHumanRatingValue) {
  return post<SupportTicketSummary>(`support/tickets/${encodeURIComponent(ticketId)}/rating`, { rating })
}

/** 重开工单（需 can_reopen） */
export function reopenSupportTicket(ticketId: string) {
  return post<SupportTicketSummary>(`support/tickets/${encodeURIComponent(ticketId)}/reopen`, {})
}

/** 换取附件下载地址：服务端每次重签分钟级短期 URL 并复核归属 */
export function getSupportAttachmentUrl(attachmentId: string) {
  return get<{ url: string }>(`support/attachments/${encodeURIComponent(attachmentId)}/url`)
}
