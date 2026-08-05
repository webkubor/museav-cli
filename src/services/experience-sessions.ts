/**
 * 模型体验会话/消息（PRD 1.0.4 §7 模型体验，接口真源见飞书《模型体验(Playground V1)
 * 前端接口文档》，2026-07-27 已合入 test）。
 *
 * 覆盖：会话 CRUD、历史消息恢复、发送消息（对话组走 SSE，媒体任务走同步/异步 JSON，
 * 本文件先实现对话组 SSE——单模型体验页当前只用得到这部分）。
 */
import { apiBaseUrl, get, post, patch, put, del, upload } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import i18n from 'i18next'

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
  /** 只有创建（§3.1）/详情（§3.3）响应带这个字段；列表（§3.2）响应不带，改用轻量 `models`（qa#535 已修复） */
  conversations?: ExperienceConversation[]
  /** 列表（§3.2）响应专属：轻量 model_id 数组，不含 position/conversation id，仅供历史侧栏展示模型名 */
  models?: string[]
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

/** 逐模型累计统计（§3.7 + Swagger GET .../stats），设置弹窗「本会话累计」用 */
export interface ExperienceModelStats {
  model_id: string
  requests: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_spend: string
  actual_spend?: string
}

export async function getExperienceSessionStats(sessionId: string): Promise<{ items: ExperienceModelStats[] }> {
  return get(`experience/sessions/${sessionId}/stats`)
}

/**
 * 会话新增模型列（真实端点，取自 Swagger `POST /experience/sessions/{sessionId}/conversations`，
 * 不是 PRD 接口文档 §3.8 那张读不到的内嵌表格）。最多 3 列，同会话模型不重复。
 */
export async function addExperienceConversation(sessionId: string, modelId: string): Promise<ExperienceConversation> {
  return post(`experience/sessions/${sessionId}/conversations`, { model_id: modelId })
}

/** 移除模型列（删除该列聊天记录），真实端点见 Swagger DELETE .../conversations/{conversationId} */
export async function removeExperienceConversation(sessionId: string, conversationId: string): Promise<void> {
  await del(`experience/sessions/${sessionId}/conversations/${conversationId}`)
}

/**
 * 模型列换模型，真实端点见 Swagger PATCH .../conversations/{conversationId}。
 * 语义（shared/modelgo_prd#336，后端 observer f776c33 起）：模型实际变化时服务端同事务
 * 删除该 conversation 的全部消息（从干净上下文开始，刷新/历史恢复也为空）；
 * 重选同一模型不视为「换」，历史保留。调用方成功后需同步清掉该列本地消息状态。
 */
export async function switchExperienceConversationModel(
  sessionId: string,
  conversationId: string,
  modelId: string,
): Promise<ExperienceConversation> {
  return patch(`experience/sessions/${sessionId}/conversations/${conversationId}`, { model_id: modelId })
}

/** 逐模型设置持久化（§7.6），真实端点见 Swagger GET/PUT/DELETE .../configs(/{modelId}) */
export interface ExperienceModelConfig {
  model_id: string
  config: Record<string, unknown>
  updated_at: string
}

export async function listExperienceModelConfigs(sessionId: string): Promise<{ items: ExperienceModelConfig[] }> {
  return get(`experience/sessions/${sessionId}/configs`)
}

/**
 * 比较配置行的 model_id 和目录 model_id 是否是同一个模型。
 * 实测后端 PUT/GET .../configs 把路径参数原样存回 model_id 字段，不做 URL 解码——
 * 存的是 "anthropic%2Fclaude-sonnet-4.6" 这种编码后的字面量，不是 "anthropic/claude-sonnet-4.6"。
 * 直接 === 比较会永远匹配不上（存了配置却读不回来），这里做容错解码后再比。
 */
export function matchesModelConfigId(configModelId: string, catalogModelId: string): boolean {
  if (configModelId === catalogModelId) return true
  try {
    return decodeURIComponent(configModelId) === catalogModelId
  } catch {
    return false
  }
}

export async function saveExperienceModelConfig(
  sessionId: string,
  modelId: string,
  config: Record<string, unknown>,
): Promise<ExperienceModelConfig> {
  // model_id 形如 "anthropic/claude-sonnet-4.6" 带斜杠，直接拼进路径会被路由拆成多段
  // 返回 40401 资源不存在（实测踩到）——modelId 段必须 encodeURIComponent
  return put(`experience/sessions/${sessionId}/configs/${encodeURIComponent(modelId)}`, { config })
}

export async function resetExperienceModelConfig(sessionId: string, modelId: string): Promise<void> {
  await del(`experience/sessions/${sessionId}/configs/${encodeURIComponent(modelId)}`)
}

/** 附件（§7.5），真实端点见 Swagger POST/GET .../attachments(/url) */
export interface ExperienceAttachment {
  resource_id: string
  kind: 'image' | 'audio' | 'video'
  mime: string
  size: number
}

export async function uploadExperienceAttachment(file: File): Promise<ExperienceAttachment> {
  const formData = new FormData()
  formData.append('file', file)
  return upload('post', 'experience/attachments', formData)
}

export async function getExperienceAttachmentUrl(resourceId: string): Promise<{ url: string; expires_at: string }> {
  return get('experience/attachments/url', { resource_id: resourceId })
}

/** 解析单行 SSE：区分 `event:` 与 `data:`，供 streamExperienceMessage 逐行喂入 */
type SSELine = { kind: 'event'; value: string } | { kind: 'data'; value: string } | null

function parseSSELine(line: string): SSELine {
  if (line.startsWith('event:')) return { kind: 'event', value: line.slice(6).trim() }
  if (line.startsWith('data:')) return { kind: 'data', value: line.slice(5).trim() }
  return null
}

/**
 * 同步媒体任务发送（text_to_image / image_to_image / text_to_audio / audio_to_text），
 * 走普通 JSON（非 SSE），接口文档第五节 5.2。同步等待模型完成，生图/TTS 通常 5-30 秒，
 * 调用方应设置较长的请求超时（ky 客户端默认 30s，媒体任务用独立 fetch 不复用它）。
 */
export interface SendMediaMessageResult {
  message: ExperienceMessageView
  attachment_urls: Record<string, string>
}

export async function sendExperienceMediaMessage(opts: {
  conversationId: string
  dispatchId: string
  content: string
  attachments?: string[]
}): Promise<SendMediaMessageResult> {
  return post(`experience/conversations/${opts.conversationId}/messages`, {
    dispatch_id: opts.dispatchId,
    content: opts.content,
    attachments: opts.attachments ?? [],
  })
}

/**
 * 视频任务轮询单条消息（text_to_video / image_to_video），接口文档 5.3/5.4。
 * running 状态需继续轮询（建议间隔 5 秒），succeeded/failed 是终态。
 */
export async function getExperienceMessage(conversationId: string, messageId: string): Promise<SendMediaMessageResult> {
  return get(`experience/conversations/${conversationId}/messages/${messageId}`)
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
  if (!reader) throw new Error(i18n.t('errors.streamUnsupported', { ns: 'common' }))
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
