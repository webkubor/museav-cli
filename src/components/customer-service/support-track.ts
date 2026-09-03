/**
 * 智能客服埋点（PRD §10 埋点设计与指标观测）。
 *
 * 所有事件收口在这里，业务组件只调具名函数 —— 技术方案 §7.1 的原话是「埋点统一收口到一个
 * track() 封装，业务代码只传事件名与业务属性，从源头避免把用户原文、Request ID、附件名
 * 写进埋点」。公共属性（site / 登录状态 / 页面 / 角色 / 租户）由 `@model-go/track` SDK
 * 与 `useTrackContext()` 注入，这里不重复拼。
 *
 * 两条硬口径（§9 / §10.1）：
 *   · **不记录**完整用户输入、Request ID 原值、附件名、知识正文、日志正文。
 *     问题长度只上报**区间**，Request ID 与附件只上报**有无**。
 *   · 拿不到的字段直接不带这个 key，不写 'unknown' 假值（与 `use-track-context.ts` 同口径）。
 *
 * 事件名用 PRD §10.2 给的下划线原名（`support_assistant_open` 等），**不套仓库的
 * `xxx:yyy` 冒号约定** —— 那批名字是 §10.3 核心指标的分子分母依据，数据侧按它建表，
 * 改名会让指标对不上。track.ts 里冒号约定写的是「建议」，这里以 PRD 为准。
 *
 * §10.2 里有三个事件**不在前端**：`support_intent_classified`、`support_kb_retrieval_result`、
 * `support_tool_query_result` —— 意图识别、知识检索、只读工具查询都发生在 agent 侧
 * （技术方案 §6.2/§6.4/§6.5），前端拿不到置信度、命中数与工具耗时，由后端上报。
 */

import { trackEvent } from '@/lib/track'
import type { SupportAnswerRatingValue, SupportTicketDetail, SupportTicketSummary } from '@/interfaces/support'

/** 问题长度只上报区间，不上报原文（§10.1） */
function lengthBucket(text: string): string {
  const length = text.trim().length
  if (length <= 20) return '0-20'
  if (length <= 50) return '21-50'
  if (length <= 200) return '51-200'
  return '200+'
}

/** Request ID 在用户输入里出现过没有 —— 只上报布尔，不上报值本身 */
const REQUEST_ID_HINT = /\breq[-_][a-z0-9]{6,}\b/i

export const supportTrack = {
  /** §10.2 展开助手 */
  assistantOpen(props: { loggedIn: boolean }) {
    trackEvent('support_assistant_open', { logged_in: props.loggedIn })
  },

  /** §10.2 提交问题：只带长度区间与是否含 Request ID */
  questionSubmit(question: string, props: { entry: 'composer' | 'quick_question' }) {
    trackEvent('support_question_submit', {
      question_length_bucket: lengthBucket(question),
      has_request_id: REQUEST_ID_HINT.test(question),
      entry: props.entry,
    })
  },

  /**
   * §10.2 展示智能回答。
   * 「证据类型」由 agent 决定、当前 chat 事件信封里没有下发（技术方案 §5.3 的 AgentEvent
   * 只有 start/delta/done/error），所以这里只上报前端能测准的回答状态与端到端耗时；
   * 待后端在 done 帧补 `answer_status` / `evidence_type` 后一并带上。
   */
  answerRender(props: { status: 'ok' | 'empty' | 'error' | 'stopped'; durationMs: number }) {
    trackEvent('support_answer_render', {
      answer_status: props.status,
      duration_ms: Math.round(props.durationMs),
    })
  },

  /** §10.2 点赞点踩。取消评价时 rating 传 'cleared' */
  answerRating(rating: SupportAnswerRatingValue | undefined) {
    trackEvent('support_answer_rating', { rating: rating ?? 'cleared' })
  },

  /** §10.2 反馈提交成功：问题类型 + 是否含 Request ID/附件 */
  feedbackSubmit(props: { issueType: string; hasRequestId: boolean; hasAttachment: boolean }) {
    trackEvent('support_feedback_submit', {
      issue_type: props.issueType,
      has_request_id: props.hasRequestId,
      has_attachment: props.hasAttachment,
    }, { result: 'success' })
  },

  /**
   * §10.2 发起人工转接：触发方式 + 此前未解决次数。
   * 「未解决次数」的权威判定在 agent 侧（§6.4 低置信度/无证据兜底才算未解决），前端只能数
   * 本次会话里的助手回答轮数作为近似，所以这里传的是 `assistant_turns` 而不是假装成
   * `unresolved_count` —— 名字不同，避免数据侧误当成权威口径。
   */
  handoffStart(props: { trigger: 'intent' | 'button'; assistantTurns: number }) {
    trackEvent('support_handoff_start', {
      trigger: props.trigger,
      assistant_turns: props.assistantTurns,
    })
  },

  /** §10.2 人工连接成功：排队耗时 */
  handoffConnected(props: { queueMs: number }) {
    trackEvent('support_handoff_connected', { queue_ms: Math.round(props.queueMs) })
  },

  /** §10.2 人工服务结束：服务时长 + 结束方式 */
  handoffEnd(props: { durationMs: number; endedBy: 'user' | 'async_converted' | 'cancelled' }) {
    trackEvent('support_handoff_end', {
      duration_ms: Math.round(props.durationMs),
      ended_by: props.endedBy,
    })
  },

  /** §10.2 提交或跳过五星评价 */
  humanRating(props: { rating?: number; skipped: boolean }) {
    trackEvent('support_human_rating', {
      ...(props.rating ? { rating: props.rating } : {}),
      skipped: props.skipped,
    })
  },

  /** §10.2 打开服务记录列表：入口位置 + 未读工单数 */
  recordsOpen(props: { unreadTickets: number }) {
    trackEvent('support_records_open', {
      entry: 'panel_header',
      unread_tickets: props.unreadTickets,
    })
  },

  /** §10.2 切换筛选或执行搜索：筛选项 + 是否有关键词 + 结果条数（不带关键词本身） */
  recordsFilter(props: { filter: string; hasQuery: boolean; total: number }) {
    trackEvent('support_records_filter', {
      filter: props.filter,
      has_query: props.hasQuery,
      result_count: props.total,
    })
  },

  /** §10.2 打开工单详情：类型 + 状态 + 是否有未读 + 是否置顶 */
  ticketOpen(ticket: SupportTicketSummary, props: { pinned: boolean }) {
    trackEvent('support_ticket_open', {
      ticket_type: ticket.ticket_type,
      ...(ticket.service_mode ? { service_mode: ticket.service_mode } : {}),
      status: ticket.status,
      has_unread: (ticket.unread_count ?? 0) > 0,
      pinned: props.pinned,
    })
  },

  /** §10.2 提交补充问题描述：类型 + 是否含附件 + 提交结果 */
  ticketSupplementSubmit(ticket: SupportTicketDetail, props: { hasAttachment: boolean; ok: boolean }) {
    trackEvent('support_ticket_supplement_submit', {
      ticket_type: ticket.ticket_type,
      has_attachment: props.hasAttachment,
    }, { result: props.ok ? 'success' : 'fail' })
  },

  /** §10.2 下载工单附件：类型 + 附件来源（原始提交 / 补充） */
  ticketAttachmentDownload(props: { ticketType: string; source: 'original' | 'supplement' }) {
    trackEvent('support_ticket_attachment_download', {
      ticket_type: props.ticketType,
      attachment_source: props.source,
    })
  },
}
