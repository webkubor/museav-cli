/**
 * 客服数据网关：业务组件只调这里，由它决定走真接口还是 dev mock。
 *
 * 存在的唯一理由是客服后端 9/11 才交付（《v1.0.6后端分工》，负责人熊仁杰），
 * 而 PRD §12 有一半验收项是交互体系，必须能在浏览器里跑通。
 *
 * 后端上线后的下线动作就三步：删 `mock/` 目录、删本文件里的 `MOCK` 分支、
 * 把 `.env.development` 里的 `VITE_SUPPORT_MOCK` 去掉。业务组件一行不用改 ——
 * 它们拿到的一直是服务端形状的数据。
 *
 * ⚠️ 默认 **off**：没显式开 mock 就走真接口，接口没上线就如实报错。
 * 这是本仓既有做法（见 `components/customer-service/index.tsx` 的反馈提交注释），
 * 不静默兜底、不伪造成功回执。
 */

import { apiBaseUrl } from '@/lib/request'
import { injectHeaders } from '@/lib/request-headers'
import type {
  SupportEventsResponse,
  SupportFeedbackRequest,
  SupportHandoffRequest,
  SupportHumanRatingValue,
  SupportSupplementRequest,
  SupportTicketListQuery,
  SupportTicketReplyRequest,
} from '@/interfaces/support'
import * as api from '@/services/support'
import { supportMock } from './mock/support-mock'

/** dev 构建且显式开启才用 mock；生产构建里这个分支会被 tree-shake 掉 */
export const SUPPORT_MOCK_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_SUPPORT_MOCK === 'on'

if (SUPPORT_MOCK_ENABLED) {
  // 与 __mg_nav / __mg_login 同风格的 dev 出口：切换转异步降级、重置种子数据
  ;(window as unknown as { __mg_support?: unknown }).__mg_support = {
    forceAsync: (value: boolean) => supportMock.setForceAsync(value),
    reset: () => supportMock.reset(),
  }
  console.info('[support] mock 已启用（VITE_SUPPORT_MOCK=on）。window.__mg_support.forceAsync(true) 可切到转异步降级路径')
}

export const supportGateway = {
  listTickets: (query: SupportTicketListQuery) =>
    SUPPORT_MOCK_ENABLED ? supportMock.listTickets(query) : api.listSupportTickets(query),

  getTicket: (ticketId: string) =>
    SUPPORT_MOCK_ENABLED ? supportMock.getTicket(ticketId) : api.getSupportTicket(ticketId),

  submitFeedback: (body: SupportFeedbackRequest) =>
    SUPPORT_MOCK_ENABLED ? supportMock.submitFeedback(body) : api.submitSupportFeedback(body),

  uploadAttachment: (file: File) =>
    SUPPORT_MOCK_ENABLED ? supportMock.uploadAttachment(file) : api.uploadSupportAttachment(file),

  startHandoff: (body: SupportHandoffRequest) =>
    SUPPORT_MOCK_ENABLED ? supportMock.startHandoff(body) : api.startSupportHandoff(body),

  cancelHandoff: (ticketId: string) =>
    SUPPORT_MOCK_ENABLED ? supportMock.cancelHandoff(ticketId) : api.cancelSupportHandoff(ticketId),

  endHandoff: (ticketId: string) =>
    SUPPORT_MOCK_ENABLED ? supportMock.endHandoff(ticketId) : api.endSupportHandoff(ticketId),

  reply: (ticketId: string, body: SupportTicketReplyRequest) =>
    SUPPORT_MOCK_ENABLED ? supportMock.reply(ticketId, body) : api.replySupportTicket(ticketId, body),

  supplement: (ticketId: string, body: SupportSupplementRequest) =>
    SUPPORT_MOCK_ENABLED ? supportMock.supplement(ticketId, body) : api.supplementSupportTicket(ticketId, body),

  markRead: (ticketId: string, readSeq: number) =>
    SUPPORT_MOCK_ENABLED ? supportMock.markRead(ticketId, readSeq) : api.markSupportTicketRead(ticketId, readSeq),

  rate: (ticketId: string, rating: SupportHumanRatingValue) =>
    SUPPORT_MOCK_ENABLED ? supportMock.rate(ticketId, rating) : api.rateSupportTicket(ticketId, rating),

  reopen: (ticketId: string) =>
    SUPPORT_MOCK_ENABLED ? supportMock.reopen(ticketId) : api.reopenSupportTicket(ticketId),

  attachmentUrl: (attachmentId: string) =>
    SUPPORT_MOCK_ENABLED ? supportMock.attachmentUrl() : api.getSupportAttachmentUrl(attachmentId),

  initialCursor: () => (SUPPORT_MOCK_ENABLED ? supportMock.currentCursor() : 0),

  /**
   * 长轮询（技术方案 §5.3）。不走 `request.ts`：它默认 30 秒超时且会解信封，
   * 而这个请求要挂起最长 55 秒、要能被登出立即 abort、无新事件时返回 204 空体。
   */
  async pollEvents(sinceVersion: number, signal: AbortSignal, wait = 25): Promise<SupportEventsResponse> {
    if (SUPPORT_MOCK_ENABLED) return supportMock.pollEvents(sinceVersion)

    const url = `${apiBaseUrl()}/api/v1/support/events?since_version=${sinceVersion}&wait=${wait}`
    const probe = new Request(url, { method: 'GET' })
    injectHeaders(probe)
    const response = await fetch(url, {
      method: 'GET',
      headers: Object.fromEntries(probe.headers.entries()),
      credentials: 'include',
      signal,
    })
    if (response.status === 204) return { events: [] }
    if (!response.ok) throw new Error(`support events ${response.status}`)
    const json = await response.json()
    // 沿用统一信封：业务失败也是 HTTP 200，数据在 data 里
    const data = (json?.data ?? json) as SupportEventsResponse
    return { ...data, events: data.events ?? [] }
  },
}
