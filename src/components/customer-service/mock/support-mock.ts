/**
 * dev-only 客服后端替身。
 *
 * 为什么需要它：客服后端（熊仁杰，《v1.0.6后端分工》开发截止 9/11）尚未交付，
 * 而 PRD §12 的验收项里有一半是**交互体系**（九模式互斥、未读三层、转异步只由后台
 * 事件驱动、能力位驱动按钮、未读置顶与已读回落），这些不在浏览器里跑一遍就没法验。
 * 所以这里扮演服务端：**它是唯一被允许"造数据"的地方**，业务代码依旧只认服务端下发的
 * `status_label` / `capabilities` / 事件，后端上线后删掉 mock/ 目录与 gateway 里的分支即可。
 *
 * 三条自律，避免 mock 把前端带出坏习惯：
 *   1. 定时器只存在于这一层 —— 它扮演的是后台 worker（§6.8 明确前端计时器不得建单）。
 *      前端组件永远只响应事件，删掉 mock 后行为不变。
 *   2. 所有派生字段（status_label、capabilities、unread_count）在这一层算完再下发，
 *      与真服务端的职责边界一致。
 *   3. 幂等键（client_submission_id / client_message_id）真的去重，不然前端的重试
 *      逻辑在 mock 下永远测不出问题。
 *
 * 开关：`VITE_SUPPORT_MOCK=on`（见 `.env.development`）。默认关闭 —— 关闭时走真接口，
 * 未上线就如实报错，这是本仓「不伪造成功」的既定做法。
 */

import type {
  SupportAttachment,
  SupportEvent,
  SupportEventsResponse,
  SupportFeedbackRequest,
  SupportFeedbackResponse,
  SupportHandoffRequest,
  SupportHandoffResponse,
  SupportHumanRatingValue,
  SupportSupplementRequest,
  SupportTicketDetail,
  SupportTicketListQuery,
  SupportTicketListResponse,
  SupportTicketReplyRequest,
  SupportTicketStatus,
  SupportTicketSummary,
} from '@/interfaces/support'
import { MOCK_AGENT, capabilitiesFor, createSeedTickets, statusLabel } from './seed'

const ENDED: SupportTicketStatus[] = ['resolved', 'cancelled']

/**
 * mock 内部把三个聚合字段收窄成必填 —— wire 类型里它们可选（后端可能少返），
 * 但 mock 扮演服务端，永远写满。收窄一次胜过在十几处写 `?? 0`。
 */
type MockTicket = SupportTicketDetail & {
  latest_message_seq: number
  read_message_seq: number
  unread_count: number
}

let tickets: MockTicket[] = createSeedTickets() as MockTicket[]
/** 全局单调事件游标。真接口的 since_version 按工单版本编码，mock 简化为一条全局序列 */
let eventCursor = 0
let pending: SupportEvent[] = []
const submissions = new Map<string, string>()
const clientMessageIds = new Set<string>()
let serial = 7000
/** 转人工是否走「无坐席在线 → 转异步」降级路径。默认走正常接通，可从控制台切换 */
let forceAsync = false
const timers: number[] = []

function nowIso() {
  return new Date().toISOString()
}

function nextSerial() {
  serial += 1
  return String(serial).padStart(4, '0')
}

function ticketNumber(prefix: 'CS' | 'FB') {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return `${prefix}-${date}-${nextSerial()}`
}

/**
 * 事件的 `version` 是**全局单调**的事件序号，不是工单自己的版本 ——
 * 技术方案 §5.3 说「响应里按 uq_support_events_version 顺序返回缺口事件」，
 * 那是一条全局唯一序列，长轮询的 since_version 才能是 URL 上的单值。
 * 工单版本单独维护在 `ticket.version` 里，随摘要下发，两者不同量纲、不可混用。
 */
function emit(ticket: MockTicket, event: Omit<SupportEvent, 'event_id' | 'version' | 'ticket_id'>) {
  eventCursor += 1
  ticket.version += 1
  ticket.updated_at = event.occurred_at
  pending.push({
    event_id: `evt-${eventCursor}`,
    ticket_id: ticket.ticket_id,
    version: eventCursor,
    ...event,
  })
}

/** 详情 → 摘要：显式挑字段而不是解构剔除，后者会留下一串未使用变量 */
function summary(ticket: MockTicket): SupportTicketSummary {
  return {
    ticket_id: ticket.ticket_id,
    ticket_type: ticket.ticket_type,
    service_mode: ticket.service_mode,
    display_type: ticket.display_type,
    status: ticket.status,
    status_label: ticket.status_label,
    title: ticket.title,
    latest_visible_message: ticket.latest_visible_message,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    assignee_display_name: ticket.assignee_display_name,
    version: ticket.version,
    latest_message_seq: ticket.latest_message_seq,
    read_message_seq: ticket.read_message_seq,
    unread_count: ticket.unread_count,
    source_ticket_id: ticket.source_ticket_id,
    capabilities: ticket.capabilities,
  }
}

function find(ticketId: string) {
  const ticket = tickets.find((item) => item.ticket_id === ticketId)
  if (!ticket) throw new Error(`[support-mock] 工单不存在：${ticketId}`)
  return ticket
}

/** 未读在服务端算：只有 service_mode <> 'live' 才计（§4.6） */
function recomputeUnread(ticket: MockTicket) {
  ticket.unread_count = ticket.service_mode === 'live'
    ? 0
    : Math.max(0, ticket.latest_message_seq - ticket.read_message_seq)
}

function appendMessage(
  ticket: MockTicket,
  input: {
    kind: 'message' | 'system' | 'attachment' | 'rating'
    sender: 'user' | 'agent' | 'system'
    content: string
    attachment?: SupportAttachment
  },
) {
  const seq = ticket.latest_message_seq + 1
  ticket.latest_message_seq = seq
  ticket.messages = [
    ...(ticket.messages ?? []),
    {
      message_id: `${ticket.ticket_id}-m${seq}`,
      seq,
      kind: input.kind,
      sender_type: input.sender,
      content: input.content,
      created_at: nowIso(),
      ...(input.attachment ? { attachment: input.attachment } : {}),
    },
  ]
  ticket.latest_visible_message = input.content
  // 自己发的消息不产生未读（§6.11：用户自己发消息不产生未读）
  if (input.sender === 'user') ticket.read_message_seq = seq
  recomputeUnread(ticket)
  return seq
}

function setStatus(ticket: MockTicket, status: SupportTicketStatus, queuePosition?: number) {
  ticket.status = status
  ticket.status_label = statusLabel(status, ticket.service_mode, queuePosition)
  ticket.capabilities = capabilitiesFor(ticket.ticket_type, ticket.service_mode, status)
}

function clearTimers() {
  timers.forEach((timer) => window.clearTimeout(timer))
  timers.length = 0
}

function later(fn: () => void, delay: number) {
  timers.push(window.setTimeout(fn, delay))
}

/* ── 端点实现 ─────────────────────────────────────────────────────────────── */

export const supportMock = {
  async listTickets(query: SupportTicketListQuery = {}): Promise<SupportTicketListResponse> {
    const keyword = query.query?.trim().toLocaleLowerCase() ?? ''
    const filtered = tickets
      .filter((ticket) => {
        if (query.filter === 'ended') return ENDED.includes(ticket.status)
        if (query.filter === 'processing') return !ENDED.includes(ticket.status)
        return true
      })
      // §6.11：搜索只匹配编号与用户可见标题
      .filter((ticket) => !keyword
        || ticket.ticket_id.toLocaleLowerCase().includes(keyword)
        || ticket.title.toLocaleLowerCase().includes(keyword))
      // §6.11：有未读优先，其余按 updated_at 倒序
      .sort((left, right) => {
        const leftUnread = left.unread_count ? 1 : 0
        const rightUnread = right.unread_count ? 1 : 0
        if (leftUnread !== rightUnread) return rightUnread - leftUnread
        return right.updated_at.localeCompare(left.updated_at)
      })

    const limit = query.limit ?? 10
    const start = query.cursor ? filtered.findIndex((t) => t.ticket_id === query.cursor) + 1 : 0
    const items = filtered.slice(start, start + limit)
    const hasMore = start + items.length < filtered.length
    return {
      items: items.map(summary),
      next_cursor: hasMore ? items.at(-1)?.ticket_id ?? null : null,
      total: filtered.length,
    }
  },

  async getTicket(ticketId: string): Promise<SupportTicketDetail> {
    return structuredClone(find(ticketId))
  },

  async submitFeedback(body: SupportFeedbackRequest): Promise<SupportFeedbackResponse> {
    // §6.6：client_submission_id 幂等，重复提交返回同一张工单
    const existingId = submissions.get(body.client_submission_id)
    if (existingId) {
      return { ...summary(find(existingId)), expected_response_label: '预计 2 小时内响应' }
    }

    const id = ticketNumber('FB')
    const createdAt = nowIso()
    const ticket: MockTicket = {
      ticket_id: id,
      ticket_type: 'feedback',
      service_mode: null,
      display_type: '问题反馈',
      status: 'pending',
      status_label: statusLabel('pending', null),
      title: body.description.slice(0, 48),
      latest_visible_message: body.description,
      created_at: createdAt,
      updated_at: createdAt,
      assignee_display_name: null,
      version: 1,
      latest_message_seq: 1,
      read_message_seq: 1,
      unread_count: 0,
      source_ticket_id: null,
      capabilities: capabilitiesFor('feedback', null, 'pending'),
      messages: [],
      handling_events: [{
        id: `${id}-created`,
        type: 'ticket.created',
        actor_name: '你',
        created_at: createdAt,
        summary: '用户提交问题反馈',
      }],
      feedback: {
        category: body.category,
        description: body.description,
        ...(body.occurred_at ? { occurred_at: body.occurred_at } : {}),
        ...(body.request_id ? { request_id: body.request_id } : {}),
        ...(body.attachment_ids?.length
          ? { attachments: body.attachment_ids.map((attId) => ({ id: attId, file_name: attachmentNames.get(attId) ?? attId, scan_status: 'clean' as const })) }
          : {}),
      },
      supplements: [],
      rating: null,
    }
    tickets = [ticket, ...tickets]
    submissions.set(body.client_submission_id, id)
    return { ...summary(ticket), expected_response_label: '预计 2 小时内响应' }
  },

  async uploadAttachment(file: File): Promise<SupportAttachment> {
    const id = `att-${Date.now()}`
    attachmentNames.set(id, file.name)
    return { id, file_name: file.name, mime_type: file.type, size_bytes: file.size, scan_status: 'clean' }
  },

  /**
   * 发起转人工：建单入队 → 排名递减 → 接通（或按 forceAsync 走转异步降级）。
   * 这里的 setTimeout 扮演的是后台 worker（§6.7 排名事件、§6.8 每 5 秒扫队列的降级 worker），
   * 不是前端计时器。
   */
  async startHandoff(body: SupportHandoffRequest): Promise<SupportHandoffResponse> {
    const existingId = submissions.get(body.client_submission_id)
    if (existingId) return { ...summary(find(existingId)), queue_position: 0 }

    const id = ticketNumber('CS')
    const createdAt = nowIso()
    const ticket: MockTicket = {
      ticket_id: id,
      ticket_type: 'human_support',
      service_mode: 'live',
      display_type: '人工服务',
      status: 'pending',
      status_label: statusLabel('pending', 'live', 2),
      title: '人工客服咨询',
      latest_visible_message: '正在为你转接人工客服。',
      created_at: createdAt,
      updated_at: createdAt,
      assignee_display_name: null,
      version: 1,
      latest_message_seq: 1,
      read_message_seq: 1,
      unread_count: 0,
      source_ticket_id: null,
      capabilities: capabilitiesFor('human_support', 'live', 'pending'),
      messages: [{
        message_id: `${id}-m1`,
        seq: 1,
        kind: 'system',
        sender_type: 'system',
        content: '开始转接人工客服。',
        created_at: createdAt,
      }],
      rating: null,
    }
    tickets = [ticket, ...tickets]
    submissions.set(body.client_submission_id, id)

    clearTimers()
    later(() => {
      if (ticket.status !== 'pending' || ticket.service_mode !== 'live') return
      emit(ticket, { type: 'queue.position_changed', occurred_at: nowIso(), payload: { queue_position: 1 } })
    }, 900)

    later(() => {
      if (ticket.status !== 'pending' || ticket.service_mode !== 'live') return
      if (forceAsync) {
        // §4.6：转异步是模式变更而非新建工单 —— 编号、创建时间与历史消息全部保留
        ticket.service_mode = 'async'
        ticket.display_type = '人工服务 · 转异步'
        setStatus(ticket, 'pending')
        appendMessage(ticket, {
          kind: 'system',
          sender: 'system',
          content: '客服将通过账号预留联系方式主动联系你，请留意后续通知。',
        })
        ticket.handling_events = [{
          id: `${ticket.ticket_id}-created`,
          type: 'ticket.created',
          actor_name: '你',
          created_at: ticket.created_at,
          summary: '转人工工单已创建',
        }]
        emit(ticket, {
          type: 'ticket.async_converted',
          occurred_at: nowIso(),
          payload: {
            status: 'pending',
            status_label: ticket.status_label,
            message: '当前咨询量较大，暂时未能接入人工客服。',
            expected_contact_label: '2 小时内',
            ticket: summary(ticket),
          },
        })
        return
      }
      setStatus(ticket, 'processing')
      ticket.assignee_display_name = `${MOCK_AGENT.name} · ${MOCK_AGENT.employee_id}`
      emit(ticket, {
        type: 'ticket.status_changed',
        occurred_at: nowIso(),
        payload: { status: 'processing', status_label: ticket.status_label, message: '客服已接入' },
      })
      const seq = appendMessage(ticket, {
        kind: 'message',
        sender: 'agent',
        content: '您好，我是客服小沐，请告诉我需要协助处理的问题。',
      })
      emit(ticket, {
        type: 'message.created',
        seq,
        occurred_at: nowIso(),
        payload: { sender_type: 'agent', message: '您好，我是客服小沐，请告诉我需要协助处理的问题。' },
      })
    }, 2100)

    return { ...summary(ticket), queue_position: 2 }
  },

  async cancelHandoff(ticketId: string): Promise<SupportTicketSummary> {
    clearTimers()
    const ticket = find(ticketId)
    // §6.8：用户主动取消走 cancelled，不建转异步工单、不生成卡片
    setStatus(ticket, 'cancelled')
    ticket.assignee_display_name = null
    emit(ticket, { type: 'ticket.cancelled', occurred_at: nowIso(), payload: { message: '已取消人工客服转接。' } })
    return summary(ticket)
  },

  async endHandoff(ticketId: string): Promise<SupportTicketSummary> {
    clearTimers()
    const ticket = find(ticketId)
    // §6.10：用户结束只结束连接，是否解决由客服判定 —— 但 live 会话结束即归档为已解决
    setStatus(ticket, 'resolved')
    appendMessage(ticket, { kind: 'system', sender: 'system', content: '人工服务已结束。' })
    emit(ticket, {
      type: 'ticket.resolved',
      occurred_at: nowIso(),
      payload: { status: 'resolved', status_label: ticket.status_label, message: '人工服务已结束。' },
    })
    return summary(ticket)
  },

  /**
   * 工单内发消息。两个来源共用这一个端点：转异步工单的工单内回复，以及**主面板正在进行的
   * 人工会话**（技术方案 §5.1 只给了一个 `POST /support/tickets/{id}/messages`，没有单独
   * 的 live 会话发消息接口）。
   *
   * ⚠️ 所以这里**不能**用 `can_reply` 当服务端校验：§4.6 给 live 工单的 `can_reply=false`
   * 约束的是「服务记录详情页不给回复入口」（避免出现第二个并行沟通界面），不是禁止主面板
   * 发消息。服务端该校验的是状态 —— 已结束的工单不再接收消息。
   * 联调时要和熊仁杰确认这一条，并落 API 单。
   */
  async reply(ticketId: string, body: SupportTicketReplyRequest): Promise<SupportTicketSummary> {
    const ticket = find(ticketId)
    if (clientMessageIds.has(body.client_message_id)) return summary(ticket)
    clientMessageIds.add(body.client_message_id)
    if (ENDED.includes(ticket.status)) throw new Error('[support-mock] 工单已结束，不能再发消息')

    const seq = appendMessage(ticket, { kind: 'message', sender: 'user', content: body.content })
    emit(ticket, { type: 'message.created', seq, occurred_at: nowIso(), payload: { sender_type: 'user', message: body.content } })

    // 客服回一句：live 会话里是实时应答，转异步里是异步回复并制造一次真未读（验 §7.9 已读口径）
    const reply = ticket.service_mode === 'live'
      ? '收到，我正在帮你核对相关信息，请稍候。'
      : '收到，我们正在核实，稍后通过工单回复你。'
    later(() => {
      const agentSeq = appendMessage(ticket, { kind: 'message', sender: 'agent', content: reply })
      emit(ticket, { type: 'message.created', seq: agentSeq, occurred_at: nowIso(), payload: { sender_type: 'agent', message: reply } })
    }, 1400)

    return summary(ticket)
  },

  async supplement(ticketId: string, body: SupportSupplementRequest): Promise<SupportTicketDetail> {
    const ticket = find(ticketId)
    if (clientMessageIds.has(body.client_message_id)) return structuredClone(ticket)
    clientMessageIds.add(body.client_message_id)
    if (!ticket.capabilities.can_supplement) throw new Error('[support-mock] 该工单不允许补充')

    // §7.11：补充不是独立消息，是续写在问题描述之后的一段
    ticket.supplements = [
      ...(ticket.supplements ?? []),
      {
        id: `${ticketId}-sup-${(ticket.supplements?.length ?? 0) + 1}`,
        content: body.content,
        created_at: nowIso(),
        ...(body.attachment_ids?.length
          ? { attachments: body.attachment_ids.map((attId) => ({ id: attId, file_name: attachmentNames.get(attId) ?? attId, scan_status: 'clean' as const })) }
          : {}),
      },
    ]
    ticket.updated_at = nowIso()
    ticket.version += 1
    return structuredClone(ticket)
  },

  async markRead(ticketId: string, readSeq: number): Promise<void> {
    const ticket = find(ticketId)
    // 幂等、只增不减
    ticket.read_message_seq = Math.max(ticket.read_message_seq ?? 0, readSeq)
    recomputeUnread(ticket)
  },

  async rate(ticketId: string, rating: SupportHumanRatingValue): Promise<SupportTicketSummary> {
    const ticket = find(ticketId)
    if (ticket.rating) return summary(ticket)
    ticket.rating = rating
    appendMessage(ticket, { kind: 'rating', sender: 'system', content: String(rating) })
    return summary(ticket)
  },

  async reopen(ticketId: string): Promise<SupportTicketSummary> {
    const ticket = find(ticketId)
    if (!ticket.capabilities.can_reopen) throw new Error('[support-mock] 该工单不允许重开')
    setStatus(ticket, 'pending')
    appendMessage(ticket, { kind: 'system', sender: 'system', content: '用户反馈问题未解决，工单已重新打开。' })
    emit(ticket, {
      type: 'ticket.reopened',
      occurred_at: nowIso(),
      payload: { status: 'pending', status_label: ticket.status_label, message: '用户反馈问题未解决，工单已重新打开。' },
    })
    return summary(ticket)
  },

  async attachmentUrl(): Promise<{ url: string }> {
    // 真接口每次重签分钟级短期 URL；mock 给一个占位 blob，让下载交互可点通
    const blob = new Blob(['mock attachment'], { type: 'text/plain' })
    return { url: URL.createObjectURL(blob) }
  },

  /**
   * 长轮询。真接口会把请求挂起最长 55 秒，无事件时才返回空 —— mock 必须照做，
   * 否则 hook 的 `while` 循环拿到立即返回的空响应就变成忙等，一秒打几百轮。
   * 挂起在这一层模拟（它扮演服务端），hook 里不需要知道 mock 存在。
   */
  async pollEvents(sinceVersion: number): Promise<SupportEventsResponse> {
    const events = pending.filter((event) => event.version > sinceVersion)
    if (events.length === 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 800))
    }
    return {
      events,
      server_versions: tickets.map((ticket) => ({ ticket_id: ticket.ticket_id, version: ticket.version })),
      retry_after: 0,
    }
  },

  /** 当前全局游标，供 hook 初始化 since_version */
  currentCursor() {
    return eventCursor
  },

  /** dev 控制台开关：切换转人工是否走「无坐席在线 → 转异步」降级 */
  setForceAsync(value: boolean) {
    forceAsync = value
    return forceAsync
  },

  reset() {
    clearTimers()
    tickets = createSeedTickets() as MockTicket[]
    pending = []
    eventCursor = 0
    submissions.clear()
    clientMessageIds.clear()
    forceAsync = false
  },
}

const attachmentNames = new Map<string, string>()
