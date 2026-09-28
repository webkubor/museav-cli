import { get, getPage, post, apiV1Url, ModelGoApiError, SERVER_ERROR_MESSAGE, refreshCsrf } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import { handleSessionExpired } from '@/lib/auth/auth-controller'
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
  SupportAttachmentContent,
  SupportTicketAttachment,
  SupportTicketDetail,
  SupportTicketListParams,
  SupportTicketSummary,
  SupportMessage,
} from '@/interfaces/support'
import type { CursorPage } from '@/types'

export function askSupport(body: SupportAskRequest) {
  return post<SupportAskResponse>('support/ask', body)
}

/** One relayed frame from `POST /support/ask` over SSE (#1157). */
export interface SupportAskStreamFrame {
  type: 'status' | 'answer' | 'done' | 'error'
  stage?: string
  data?: SupportAskResponse
  error?: string
}

/**
 * Ask the support bot over Server-Sent Events. The backend acknowledges the
 * request with an immediate `status` frame — the byte the PRD §13 5s
 * first-response budget is measured against — then sends the fully validated
 * `answer` and a `done` frame.
 *
 * A web-api without SSE support answers the ordinary JSON envelope; that is
 * surfaced as `status` + `answer` + `done` frames so callers keep one code
 * path while the two services roll out independently.
 */
export async function askSupportStream(
  body: SupportAskRequest,
  onFrame: (frame: SupportAskStreamFrame) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await askSupportStreamOnce(body, onFrame, signal)
  } catch (err) {
    // The raw fetch bypasses ky's CSRF self-heal; replay once after refreshing
    // the token. 40302 is only ever the non-SSE envelope, so no frame has been
    // emitted yet and the retry cannot double-emit.
    if (err instanceof ModelGoApiError && err.code === 40302) {
      await refreshCsrf()
      await askSupportStreamOnce(body, onFrame, signal)
      return
    }
    throw err
  }
}

async function askSupportStreamOnce(
  body: SupportAskRequest,
  onFrame: (frame: SupportAskStreamFrame) => void,
  signal?: AbortSignal,
): Promise<void> {
  const request = new Request(apiV1Url('support/ask'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  injectHeaders(request)

  const resp = await fetch(request, { signal })
  const contentType = resp.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    const envelope = (await resp.json().catch(() => null)) as {
      code?: number
      msg?: string
      message?: string
      data?: SupportAskResponse
      request_id?: string
      trace_id?: string
    } | null
    if (!envelope || envelope.code !== 0 || !envelope.data) {
      const code = envelope?.code ?? resp.status
      // The raw fetch bypasses ky's afterResponse hook; mirror its session-expiry
      // handling so a revoked session still prompts and returns to login.
      if (code === 40101 && typeof window !== 'undefined') {
        handleSessionExpired()
      }
      throw new ModelGoApiError({
        code,
        msg: envelope?.msg ?? envelope?.message ?? SERVER_ERROR_MESSAGE,
        request_id: envelope?.request_id ?? resp.headers.get('x-request-id') ?? undefined,
        trace_id: envelope?.trace_id ?? resp.headers.get('x-trace-id') ?? undefined,
        data: null,
      })
    }
    onFrame({ type: 'status', stage: 'retrieving' })
    onFrame({ type: 'answer', data: envelope.data })
    onFrame({ type: 'done' })
    return
  }
  if (!resp.body) {
    throw new Error(SERVER_ERROR_MESSAGE)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep = buffer.indexOf('\n\n')
    while (sep >= 0) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const line = block.split('\n').find((l) => l.startsWith('data:'))
      if (line) {
        const payload = line.slice(5).trim()
        if (payload) {
          const frame = JSON.parse(payload) as SupportAskStreamFrame
          if (frame.type === 'error') {
            throw new Error(frame.error || SERVER_ERROR_MESSAGE)
          }
          onFrame(frame)
        }
      }
      sep = buffer.indexOf('\n\n')
    }
  }
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

/**
 * 开新问答会话（qa#751，后端未上线前会 404）。传旧 id 让后端把旧会话标记结束；
 * 返回服务端签发的新 session_id，后续 /support/ask 用它。
 */
export function createSupportSession(previousSessionId: string | null) {
  return post<{ session_id: string }>('support/sessions', previousSessionId ? { previous_session_id: previousSessionId } : {})
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

/** 把已读游标推进到 seq（agent MarkRead 只认 `seq`，空 body 等于标到 0、什么都不消）。
 *  回包是标记后的工单，unread_count 已重算。 */
export function listTicketAttachments(id: string) {
  return get<{ items: SupportTicketAttachment[] }>(`support/tickets/${id}/attachments`)
}

/** 单条附件（含 content_base64），给没有 download_url 的本地附件用。 */
export function getTicketAttachment(id: string, attachmentId: string) {
  return get<SupportAttachmentContent>(`support/tickets/${id}/attachments/${attachmentId}`)
}

export function markTicketRead(id: string, seq: number) {
  return post<SupportTicketDetail>(`support/tickets/${id}/read`, { seq })
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

/**
 * 长轮询一轮 `GET /support/events`。
 *
 * agent PollEvents 只有**同时**带 `since_version` + `wait` 才会挂起：不带 wait 立即返回，
 * 不带 since_version 每次回全量历史事件。原先两个都没传，面板每秒打 ~60 轮
 * events + 详情 + 消息（2026-09-28 test 实测 40s 内 events 948 次）。
 * 等到超时没有新事件时后端回 204 无响应体 → 这里返回 null，调用方原地再发下一轮。
 * 契约与运营后台 watchEvents 同口径。走裸 fetch：ky 对 204 空体解析 JSON 会抛错。
 */
export async function pollSupportEvents(
  query: { ticketId?: string; sinceVersion?: number; wait: number },
  signal?: AbortSignal,
): Promise<SupportEventsResponse | null> {
  const qs = new URLSearchParams({ wait: String(query.wait) })
  if (query.ticketId) qs.set('ticket_id', query.ticketId)
  if (query.sinceVersion && query.sinceVersion > 0) qs.set('since_version', String(query.sinceVersion))
  const request = new Request(`${apiV1Url('support/events')}?${qs}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  })
  injectHeaders(request)
  const resp = await fetch(request, { signal })
  if (resp.status === 204) return null
  const envelope = (await resp.json().catch(() => null)) as {
    code?: number
    msg?: string
    data?: SupportEventsResponse
    request_id?: string
    trace_id?: string
  } | null
  if (!resp.ok || !envelope || envelope.code !== 0) {
    const code = envelope?.code ?? resp.status
    // 裸 fetch 绕过了 ky 的 afterResponse：会话过期照样要提示并回登录（同 askSupportStream）
    if (code === 40101 && typeof window !== 'undefined') handleSessionExpired()
    throw new ModelGoApiError({
      code,
      msg: envelope?.msg ?? SERVER_ERROR_MESSAGE,
      request_id: envelope?.request_id ?? resp.headers.get('x-request-id') ?? undefined,
      trace_id: envelope?.trace_id ?? resp.headers.get('x-trace-id') ?? undefined,
      data: null,
    })
  }
  return envelope.data ?? null
}
