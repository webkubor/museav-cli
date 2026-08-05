/**
 * 模型体验对话（#97）
 * POST /api/v1/experience/chat/completions — session+CSRF 鉴权的网关反代，
 * 返回原始 OpenAI chat.completion.chunk SSE 流。额度走 grant→cash 多桶链路。
 *
 * 走 raw fetch 而非 lib/request 的 ky 客户端：ky 封装会拆 {code,msg,data}
 * JSON 信封，无法流式读取。请求头复用 injectHeaders（X-Tenant-Id / CSRF /
 * traceparent / Accept-Language）。
 */
import { apiBaseUrl } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import i18n from 'i18next'

export interface ExperienceChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamExperienceChatOptions {
  model: string
  messages: ExperienceChatMessage[]
  signal?: AbortSignal
  /** 每个增量 token 回调（已累计文本由调用方维护） */
  onDelta: (delta: string) => void
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: { role?: string; content?: string }
    finish_reason?: string | null
  }>
  error?: { message?: string }
}

/** 解析单行 SSE：仅处理 `data:` 行；[DONE] 返回终止哨兵 */
export function parseExperienceSSELine(line: string): ChatCompletionChunk | 'done' | null {
  if (!line.startsWith('data:')) return null
  const payload = line.slice(5).trim()
  if (!payload) return null
  if (payload === '[DONE]') return 'done'
  try {
    return JSON.parse(payload) as ChatCompletionChunk
  } catch {
    return null
  }
}

/**
 * 发起体验对话并流式消费回复，resolve 为完整回复文本。
 * 非 2xx 时尽力解析 ModelGo 信封 msg 或 OpenAI error.message 作为错误信息。
 */
export async function streamExperienceChat(opts: StreamExperienceChatOptions): Promise<string> {
  const url = `${apiBaseUrl()}/api/v1/experience/chat/completions`
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
      model: opts.model,
      messages: opts.messages,
      stream: true,
    }),
  })

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.ok || !contentType.includes('text/event-stream')) {
    // 错误路径：可能是 ModelGo 信封（业务码 HTTP 200/500）或网关 JSON。
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as {
        msg?: string
        error?: { message?: string }
      }
      message = body.msg ?? body.error?.message ?? message
    } catch {
      // 非 JSON 响应——保留 HTTP 状态文案
    }
    throw new Error(message)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error(i18n.t('errors.streamUnsupported', { ns: 'common' }))
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const event = parseExperienceSSELine(line.trim())
      if (event === 'done') return accumulated
      if (!event) continue
      if (event.error?.message) throw new Error(event.error.message)
      const delta = event.choices?.[0]?.delta?.content
      if (delta) {
        accumulated += delta
        opts.onDelta(delta)
      }
    }
  }
  return accumulated
}
