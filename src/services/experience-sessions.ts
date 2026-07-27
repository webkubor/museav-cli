/**
 * 模型体验会话/消息（PRD 1.0.4 §7 模型体验，接口真源见飞书《模型体验(Playground V1)
 * 前端接口文档》，2026-07-27 已合入 test）。
 *
 * 覆盖：会话 CRUD、历史消息恢复、发送消息（对话组走 SSE，媒体任务走同步/异步 JSON，
 * 本文件先实现对话组 SSE——单模型体验页当前只用得到这部分）。
 */
import { apiBaseUrl, get, post, patch, del } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'

export type ExperienceCategory = 'dialogue' | 'image' | 'audio' | 'video'

export interface ExperienceConversation {
  id: string
  session_id: string
  model_id: string
  position: number
  created_at: string
  updated_at: string
}

export interface ExperienceSessionDetail {
  id: string
  name: string
  category: string
  task: string
  input_mode: string
  created_at: string
  updated_at: string
  /** 只有创建（§3.1）/详情（§3.3）响应带这个字段；列表（§3.2）响应实测不带，取列表项时按空数组兜底 */
  conversations?: ExperienceConversation[]
}

export interface ExperienceMessageAttachment {
  resource_id: string
  kind: string
  mime: string
  size: number
}

export interface ExperienceMessageView {
  id: string
  conversation_id: string
  session_id: string
  seq: number
  dispatch_id: string
  role: 'user' | 'assistant'
  model_id: string
  status: 'succeeded' | 'failed' | 'running'
  content: string
  attachments: ExperienceMessageAttachment[]
  actual_spend?: string
  currency?: string
  billing_status?: string
  total_ms?: number
  async_task_id?: string
  error?: string
  created_at: string
  updated_at: string
}

/** SSE 统计帧（`event: modelgo.stats`），逐字段对齐接口文档第五节 5.1 */
export interface ExperienceStatsEvent {
  message_id: string
  conversation_id: string
  session_id: string
  dispatch_id: string
  model_id: string
  request_id: string
  status: 'succeeded' | 'failed'
  input_tokens: number
  output_tokens: number
  total_tokens: number
  first_token_ms: number
  total_ms: number
  finish_reason: string
  estimated_spend: string
  actual_spend?: string
  currency: string
  billing_status: string
  free: boolean
}

/**
 * input_mode 真实枚举是 "sync"（多列同步输入）/ "independent"（每列独立输入）——
 * 接口文档里写的示例值 "text"/"voice" 是错的（实测 test 环境返回
 * `input_mode 必须为 sync / independent`，已按 #533 报给后端要求勘误文档）。
 */
export type ExperienceInputMode = 'sync' | 'independent'

export async function createExperienceSession(payload: {
  name: string
  category: ExperienceCategory
  task: string
  input_mode: ExperienceInputMode
  models: string[]
}): Promise<ExperienceSessionDetail> {
  return post('experience/sessions', payload)
}

export async function listExperienceSessions(
  params: { limit?: number; offset?: number } = {}
): Promise<{ items: ExperienceSessionDetail[]; total: number; has_more: boolean }> {
  return get('experience/sessions', { limit: params.limit ?? 20, offset: params.offset ?? 0 })
}

export async function getExperienceSession(sessionId: string): Promise<ExperienceSessionDetail> {
  return get(`experience/sessions/${sessionId}`)
}

export async function renameExperienceSession(sessionId: string, name: string): Promise<ExperienceSessionDetail> {
  return patch(`experience/sessions/${sessionId}`, { name })
}

export async function deleteExperienceSession(sessionId: string): Promise<{ status: string }> {
  return del(`experience/sessions/${sessionId}`)
}

export async function getExperienceSessionMessages(sessionId: string): Promise<{ items: ExperienceMessageView[] }> {
  return get(`experience/sessions/${sessionId}/messages`)
}

/** 解析单行 SSE：区分 `event:` 与 `data:`，供 streamExperienceMessage 逐行喂入 */
type SSELine = { kind: 'event'; value: string } | { kind: 'data'; value: string } | null

function parseSSELine(line: string): SSELine {
  if (line.startsWith('event:')) return { kind: 'event', value: line.slice(6).trim() }
  if (line.startsWith('data:')) return { kind: 'data', value: line.slice(5).trim() }
  return null
}

export interface StreamExperienceMessageOptions {
  conversationId: string
  dispatchId: string
  content: string
  attachments?: string[]
  signal?: AbortSignal
  onDelta: (delta: string) => void
  onStats?: (stats: ExperienceStatsEvent) => void
}

interface ChatCompletionChunk {
  choices?: Array<{ delta?: { role?: string; content?: string }; finish_reason?: string | null }>
  error?: { message?: string }
}

/**
 * 发送对话组消息（text_to_text / image_to_text / video_to_text），SSE 流式。
 * 帧序：若干 OpenAI 增量帧 → `event: modelgo.stats` 统计帧 → `data: [DONE]`（文档第五节 5.1）。
 * resolve 为完整回复文本；统计帧通过 onStats 回调交给调用方拼真实 Token/延迟/费用。
 */
export async function streamExperienceMessage(opts: StreamExperienceMessageOptions): Promise<string> {
  const url = `${apiBaseUrl()}/api/v1/experience/conversations/${opts.conversationId}/messages`
  const probe = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  })
  injectHeaders(probe)

  const response = await fetch(url, {
    method: 'POST',
    headers: Object.fromEntries(probe.headers.entries()),
    credentials: 'include',
    signal: opts.signal,
    body: JSON.stringify({
      dispatch_id: opts.dispatchId,
      content: opts.content,
      attachments: opts.attachments ?? [],
    }),
  })

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.ok || !contentType.includes('text/event-stream')) {
    let message = `HTTP ${response.status}`
    try {
      // 两种错误信封都要认：BFF 业务失败走文档里的 {code,msg,data.details[]}；
      // 网关层拦截（如安全护栏 IP 白名单）走 {error:{message}}，不经过 BFF 信封包装。
      const body = (await response.json()) as {
        msg?: string
        data?: { details?: Array<{ message?: string }> }
        error?: { message?: string }
      }
      message = body.data?.details?.[0]?.message ?? body.msg ?? body.error?.message ?? message
    } catch {
      // 非 JSON 响应——保留 HTTP 状态文案
    }
    throw new Error(message)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('浏览器不支持流式读取')
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  let currentEvent = 'message'

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) {
        currentEvent = 'message'
        continue
      }
      const parsed = parseSSELine(line)
      if (!parsed) continue
      if (parsed.kind === 'event') {
        currentEvent = parsed.value
        continue
      }
      // parsed.kind === 'data'
      if (!parsed.value) continue
      if (currentEvent === 'modelgo.stats') {
        try {
          opts.onStats?.(JSON.parse(parsed.value) as ExperienceStatsEvent)
        } catch {
          // 统计帧解析失败不影响正文流
        }
        continue
      }
      if (parsed.value === '[DONE]') return accumulated
      let chunk: ChatCompletionChunk
      try {
        chunk = JSON.parse(parsed.value) as ChatCompletionChunk
      } catch {
        continue
      }
      if (chunk.error?.message) throw new Error(chunk.error.message)
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        accumulated += delta
        opts.onDelta(delta)
      }
    }
  }
  return accumulated
}
