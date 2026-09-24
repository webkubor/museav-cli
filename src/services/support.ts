import { get, getPage, post } from '@/lib/request'
import type {
  SupportAskRequest,
  SupportAskResponse,
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

export function supplementTicket(id: string, content: string) {
  // agent 只认 content：原先发 { description } 会被判空，返回 40001（#1119）。
  // 响应就是补充后的工单详情（含 supplements），调用方直接拿来刷新。
  return post<SupportTicketDetail>(`support/tickets/${id}/supplements`, { content })
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
