import { get, getPage, post, apiV1Url, ModelGoApiError, SERVER_ERROR_MESSAGE, refreshCsrf } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
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
      throw new ModelGoApiError({
        code: envelope?.code ?? resp.status,
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
