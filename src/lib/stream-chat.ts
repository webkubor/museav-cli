/**
 * SSE 流式请求通用工具（协议无关）
 *
 * 分两层职责：
 *   - 本文件 streamSSE：通用 SSE 字节流分帧。按 SSE 规范解析 event:/data:/id:/retry:
 *     字段，yield 结构化事件。不认识 [DONE]、不认识 OpenAI、不做任何业务解释。
 *     对任何标准 SSE 源（AI 流式、消息推送、日志流…）都成立。
 *   - 协议适配器（调用方或独立文件）：把 {event,data} 翻译成自己的语义
 *     （什么是 delta、什么算结束、什么是错误）。
 *
 * 为什么不直接用 ky/axios：封装过的 HTTP 客户端会把响应体整个读光（拆信封），
 * 破坏流式。流式必须裸 fetch + 手动 getReader。
 *
 * 为什么不内建 [DONE] 识别：[DONE] 是 OpenAI 的约定，不是 SSE 规范。
 * Anthropic 用 event:type(message_stop)，豆包用自己的字段。把结束判定
 * 下沉到协议适配器，本层才能对任意 SSE 源复用。
 */
import i18n from 'i18next'

/** 单个 SSE 事件（一个空行分隔的帧） */
export interface SSEEvent {
  /** event: 字段的值，缺省为 'message'（SSE 规范默认） */
  event: string
  /** data: 字段累积值（多行 data: 用 \n 连接，SSE 规范规定） */
  data: string
  /** id: 字段的值（重连用 Last-Event-ID），通常用不到 */
  id?: string
}

export interface StreamSSEOptions {
  url: string
  body: unknown
  /** 完整请求头（鉴权/CSRF/traceparent 等全由调用方注入） */
  headers?: Record<string, string>
  /** 中断信号，连 fetch signal；调 controller.abort() 即中断 */
  signal?: AbortSignal
  /** fetch 凭证策略，默认 'include' */
  credentials?: RequestCredentials
}

/**
 * 解析 HTTP 错误响应：兼容多种后端信封，尽力提取可读 message。
 * 支持：{msg} / {message} / {data:{details:[{message}]}} / {error:{message}}
 */
export async function extractHTTPError(response: Response): Promise<Error> {
  let message = `HTTP ${response.status}`
  try {
    const errBody = (await response.json()) as {
      msg?: string
      message?: string
      data?: { details?: Array<{ message?: string }> }
      error?: { message?: string }
    }
    message =
      errBody.data?.details?.[0]?.message ??
      errBody.msg ??
      errBody.error?.message ??
      errBody.message ??
      message
  } catch {
    // 非 JSON 响应，保留 HTTP 状态文案
  }
  return new Error(message)
}

/**
 * 对一个已拿到的 Response 做 SSE 分帧，yield 每个 SSEEvent。
 *
 * 不负责 fetch——给调用方在 fetch 之后判断 Content-Type、决定走 SSE 还是 JSON 的余地
 * （如客服接口同一 URL 可能返回 SSE 或降级 JSON）。调用方自行保证 response.ok 和
 * Content-Type 检查后再调用本函数。
 *
 * - 每个 yield 是一个完整事件（已被空行分帧）
 * - response.body 读尽即迭代结束（不判断 [DONE]，那是业务结束信号，由上层识别）
 */
export async function* readSSE(response: Response): AsyncGenerator<SSEEvent, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error(i18n.t('errors.streamUnsupported', { ns: 'common' }))

  const decoder = new TextDecoder()
  let buffer = ''

  // SSE 规范：帧之间用空行（\n\n）分隔。一个帧内可有多个字段行。
  // 这里用按行处理 + 空行触发派发的方式实现。
  let event = 'message' // SSE 规范：缺省 event 为 'message'
  let dataLines: string[] = []
  let id: string | undefined

  const dispatch = function* (): Generator<SSEEvent> {
    if (dataLines.length > 0) {
      yield { event, data: dataLines.join('\n'), id }
    }
    event = 'message'
    dataLines = []
    id = undefined
  }

  /** 处理一行：更新当前帧累积的 event/data/id；返回 true 表示应派发（遇空行） */
  const processLine = (line: string): boolean => {
    // SSE 规范：空行 = 帧结束，派发当前累积的事件
    if (line.trim() === '') return true
    // 规范：以冒号开头是注释，忽略（如 : heartbeat 保活）
    if (line.startsWith(':')) return false

    const colon = line.indexOf(':')
    // 规范：无冒号的行视为 field 名，value 为空
    const field = colon === -1 ? line : line.slice(0, colon)
    // 规范：value 前若有一个空格，去掉它（且只去一个）
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
    else if (field === 'id') id = value
    // retry 字段影响重连间隔，浏览器 EventSource 自动处理；手动 fetch 忽略。
    return false
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // 最后一行可能不完整（chunk 边界不对齐换行），暂扣等下个 chunk
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (processLine(line)) yield* dispatch()
    }
  }
  // 流关闭：冲刷残留。先处理 buffer 里最后一行（无尾随 \n 的源），再派发未收尾的帧。
  if (buffer.trim() !== '') {
    if (processLine(buffer)) yield* dispatch()
  }
  yield* dispatch()
}

/**
 * 发起流式请求 + 分帧一体化（最常用入口）。
 *
 * 内部：fetch → 校验 2xx + event-stream（否则抛解析后的错误）→ readSSE。
 * 如果调用方需要在 fetch 后判断响应类型（如同一 URL 可能降级 JSON），
 * 请改用「自己 fetch + readSSE」组合，不要用本函数。
 *
 * 用法：
 *   for await (const ev of streamSSE({ url, body, signal, headers })) {
 *     if (ev.event === 'message') { ... }
 *   }
 */
export async function* streamSSE(
  opts: StreamSSEOptions,
): AsyncGenerator<SSEEvent, void, unknown> {
  const { url, body, headers, signal, credentials = 'include' } = opts

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...headers },
    credentials,
    signal,
    body: JSON.stringify(body),
  })

  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.ok || !contentType.includes('text/event-stream')) {
    throw await extractHTTPError(response)
  }
  yield* readSSE(response)
}

// ─────────────────────────────────────────────────────────────────────
// 协议适配器：在 streamSSE 上封装特定 AI 协议，yield delta 字符串。
// 新协议加一个 createXxxStream 即可，不动 streamSSE。
// ─────────────────────────────────────────────────────────────────────

/** 通用请求选项（适配器共享） */
export interface AdapterOptions extends Omit<StreamSSEOptions, 'body'> {
  body: unknown
}

/**
 * OpenAI chat.completion.chunk 协议适配器
 * 结束信号：data: [DONE]
 * delta：choices[0].delta.content
 * 流中错误：chunk.error.message
 */
export async function* createOpenAIStream(
  opts: AdapterOptions,
): AsyncGenerator<string, void, unknown> {
  for await (const ev of streamSSE(opts)) {
    if (ev.event !== 'message') continue
    if (ev.data === '[DONE]') return
    try {
      const chunk = JSON.parse(ev.data) as {
        choices?: Array<{ delta?: { content?: string } }>
        error?: { message?: string }
      }
      if (chunk.error?.message) throw new Error(chunk.error.message)
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) yield delta
    } catch (e) {
      // JSON 解析失败：跳过非 JSON 帧（如保活注释透出来的空 data）
      if (e instanceof SyntaxError) continue
      throw e
    }
  }
}

/**
 * 自定义 JSON 事件协议适配器（modelgo agent / 客服等自研 SSE 用）
 * 每帧 data 是 {type, ...}，由 typeField 区分语义：
 *   - type === deltaType → 取 deltaField 作为增量 yield
 *   - type === doneType → 结束（可选 doneField 作为最终全文）
 *   - type === errorType → 抛错（错误信息取 errorField）
 *   - 其余 type → 忽略（如 start/stats，调用方若需要请直接用 streamSSE）
 *
 * 如果你的协议更复杂（多种 delta、需多字段回调），直接用 streamSSE 自己写，
 * 不要往这个适配器里塞开关。
 */
export interface CustomEventAdapterOptions extends AdapterOptions {
  /** type 字段名，默认 'type' */
  typeField?: string
  /** 标记 delta 的 type 值，默认 'delta' */
  deltaType?: string
  /** delta 帧里取增量文本的字段名，默认 'delta' */
  deltaField?: string
  /** 标记结束的 type 值，默认 'done' */
  doneType?: string
  /** 标记错误的 type 值，默认 'error' */
  errorType?: string
  /** error 帧里取错误信息的字段名，默认 'error' */
  errorField?: string
}

export async function* createCustomEventStream(
  opts: CustomEventAdapterOptions,
): AsyncGenerator<string, void, unknown> {
  const {
    typeField = 'type',
    deltaType = 'delta',
    deltaField = 'delta',
    doneType = 'done',
    errorType = 'error',
    errorField = 'error',
  } = opts

  for await (const ev of streamSSE(opts)) {
    if (ev.event !== 'message') continue
    let frame: Record<string, unknown>
    try {
      frame = JSON.parse(ev.data) as Record<string, unknown>
    } catch {
      continue
    }
    const type = frame[typeField] as string | undefined
    if (type === deltaType) {
      const delta = frame[deltaField] as string | undefined
      if (delta) yield delta
    } else if (type === doneType) {
      return
    } else if (type === errorType) {
      throw new Error((frame[errorField] as string | undefined) ?? '流中错误')
    }
  }
}
