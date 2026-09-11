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

export function supplementTicket(id: string, description: string) {
  return post<void>(`support/tickets/${id}/supplements`, { description })
}

export function markTicketRead(id: string) {
  return post<void>(`support/tickets/${id}/read`, {})
}

export function rateAnswer(answerId: string, rating: 'like' | 'dislike') {
  return post<void>(`support/answers/${answerId}/rating`, { rating })
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
