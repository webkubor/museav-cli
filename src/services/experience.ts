/**
 * 模型体验对话（#97）
 * POST /api/v1/experience/chat/completions — session+CSRF 鉴权的网关反代，
 * 返回原始 OpenAI chat.completion.chunk SSE 流。额度走 grant→cash 多桶链路。
 *
 * 流式分帧/解析复用 npm 包 ai-sse-kit 的 createOpenAIStream；本文件只保留
 * 鉴权头注入（injectHeaders）和累计文本的业务逻辑。
 */
import { apiBaseUrl } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import { createOpenAIStream } from 'ai-sse-kit'

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

/**
 * 发起体验对话并流式消费回复，resolve 为完整回复文本。
 * 错误（HTTP/流中 error 帧/AbortError）由 createOpenAIStream 抛出。
 */
export async function streamExperienceChat(opts: StreamExperienceChatOptions): Promise<string> {
  const url = `${apiBaseUrl()}/api/v1/experience/chat/completions`
  const probe = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  })
  injectHeaders(probe)

  let accumulated = ''
  for await (const delta of createOpenAIStream({
    url,
    body: { model: opts.model, messages: opts.messages, stream: true },
    headers: Object.fromEntries(probe.headers.entries()),
    signal: opts.signal,
    // ai-sse-kit 0.2.0 起 credentials 不再默认 'include'（库侧理由：多数 AI 后端用
    // Authorization 头，跨域强行 include 会让预检失败）。本控制台是 cookie 会话鉴权，
    // 必须显式声明 —— 漏了不会报错，只是请求不带 cookie，表现为静默 401。
    credentials: 'include',
  })) {
    accumulated += delta
    opts.onDelta(delta)
  }
  return accumulated
}
