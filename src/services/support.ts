import { get, getPage, post } from '@/lib/request'
import type {
  SupportAskRequest,
  SupportAskResponse,
  SupportAttachmentUploadResponse,
  SupportEventsResponse,
  SupportFeedbackRequest,
  SupportFeedbackResponse,
  SupportHandoffEndRequest,
  SupportHandoffRequest,
  SupportHandoffResponse,
  SupportTicketDetail,
  SupportTicketListParams,
  SupportTicketSummary,
  SupportMessage,
} from '@/interfaces/support'
import type { CursorPage } from '@/types'

export function askSupport(body: SupportAskRequest) {
  return post<SupportAskResponse>('support/ask', body)
}

export function submitSupportFeedback(body: SupportFeedbackRequest) {
  return post<SupportFeedbackResponse>('support/feedback', body)
}

/**
 * 读 File 为 base64。web-api 的附件上传接口收 JSON
 * `{file_name, mime_type, content_base64}`（不是 multipart），所以要自己转。
 * 分块拼接避免 `String.fromCharCode(...bytes)` 在大文件上爆栈。
 */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 上传附件到 OSS（web-api 中转），返回对象引用 object_ref。 */
export async function uploadSupportAttachment(file: File): Promise<SupportAttachmentUploadResponse> {
  // 5MiB 文件 base64 后请求体约 6.7MB，默认 30s 在慢速上行下会中途超时（按设计会中止
  // 建单，用户白填一遍反馈）。给上传单独放宽到 120s，其余接口仍用默认。
  return post<SupportAttachmentUploadResponse>('support/attachments', {
    file_name: file.name,
    mime_type: file.type,
    content_base64: await fileToBase64(file),
  }, { timeout: 120_000 })
}

/** 把已上传的对象关联到工单（`POST /support/tickets/:id/attachments`）。 */
export function attachSupportTicketAttachment(
  ticketId: string,
  ref: { file_name: string; mime_type: string; object_ref: string; size_bytes: number },
) {
  return post<void>(`support/tickets/${ticketId}/attachments`, ref)
}

export function requestHandoff(body: SupportHandoffRequest) {
  return post<SupportHandoffResponse>('support/handoff', body)
}

export function cancelHandoff(ticketId: string) {
  return post<void>('support/handoff/cancel', { ticket_id: ticketId })
}

export function endHandoff(ticketId: string, body: SupportHandoffEndRequest) {
  return post<void>('support/handoff/end', { ticket_id: ticketId, ...body })
}

export function listSupportTickets(params?: SupportTicketListParams) {
  return getPage<CursorPage<SupportTicketSummary>>('support/tickets', params as Record<string, string | number | boolean | undefined>)
}

export function getSupportTicket(id: string) {
  return get<SupportTicketDetail>(`support/tickets/${id}`)
}

export function listTicketMessages(id: string, cursor?: string) {
  return getPage<CursorPage<SupportMessage>>(`support/tickets/${id}/messages`, cursor ? { cursor } : undefined)
}

export function replyTicketMessage(id: string, content: string) {
  return post<SupportMessage>(`support/tickets/${id}/messages`, { content })
}

export function supplementTicket(id: string, description: string) {
  return post<void>(`support/tickets/${id}/supplements`, { description })
}

export function markTicketRead(id: string) {
  return post<void>(`support/tickets/${id}/read`, {})
}

export function rateAnswer(answerId: string, rating: 'like' | 'dislike') {
  // 后端契约实测（qa#731）：只收 up/down，like/dislike 会被 40001 support.empty_content 拒
  return post<void>(`support/answers/${answerId}/rating`, { rating: rating === 'like' ? 'up' : 'down' })
}

export function rateTicket(id: string, rating: number) {
  return post<void>(`support/tickets/${id}/rating`, { rating })
}

export function reopenTicket(id: string) {
  return post<SupportTicketDetail>(`support/tickets/${id}/reopen`, {})
}

export function getSupportEvents(ticketId?: string) {
  return get<SupportEventsResponse>('support/events', ticketId ? { ticket_id: ticketId } : undefined)
}
