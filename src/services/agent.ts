import { get, post } from '@/lib/request'
import type {
  AgentChatRequest,
  AgentChatResponse,
  AgentConversationDetail,
  AgentConversationsResponse,
  StopAgentConversationResponse,
} from '@/interfaces/agent'

export function listConversations(params?: { page?: number; page_size?: number }) {
  return get<AgentConversationsResponse>('agent/conversations', params)
}

export function getConversation(id: string) {
  return get<AgentConversationDetail>(`agent/conversations/${id}`)
}

export function stopConversation(id: string) {
  return post<StopAgentConversationResponse>(`agent/conversations/${id}/stop`, {})
}

export function chatAgent(body: AgentChatRequest) {
  return post<AgentChatResponse>('agent/chat', body)
}
