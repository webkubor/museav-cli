export interface AgentChatRequest {
  message: string
  conversation_id?: string
  lang?: string
}

export interface AgentEvent {
  type: string
  delta?: string
  conversation_id?: string
  answer?: string
  error?: string
}

export interface AgentChatResponse {
  answer: string
  conversation_id: string
  events: AgentEvent[]
}

export interface AgentMessage {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: string
}

export interface AgentConversation {
  id: string
  title: string
  lang: string
  message_count: number
  created_at: string
  updated_at: string
}

export interface AgentConversationsResponse {
  items: AgentConversation[]
  page: number
  page_size: number
  total: number
}

export interface AgentConversationDetail extends AgentConversation {
  messages: AgentMessage[]
}

export interface StopAgentConversationResponse {
  conversation_id: string
  stopped: boolean
}
