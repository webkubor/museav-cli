/**
 * 问题反馈表单的纯领域逻辑（智能客服 PRD v0.1 §7.5）。
 *
 * 真源：
 *   · 字段与校验 —— PRD §7.5 字段表 + 原型 `modelgo_prd/src/customerSupportDomain.ts`
 *     的 `validateFeedbackDraft`。
 *   · 提交契约 —— 《ModelGo 智能客服与工单体系技术方案（v0.1）》§5.1 `POST /support/feedback`、
 *     §6.6 建单流程。**后端预计 9/7 上线**，接口类型见 `src/interfaces/support.ts`。
 *
 * 与原型的两处刻意不同：
 *   1. 原型把「功能异常」这类中文标签当枚举值存，本仓 UI 侧用稳定 code，中英展示走 i18n。
 *   2. 原型本地拼 `FB-YYYYMMDD-0000` 单号并写死「预计 2 小时内响应」——本仓不这么做：
 *      编号、状态文案与预计响应时间**全部取服务端返回**（技术方案 §6.6 编号由服务端按天序列
 *      分配，§13 明确响应时效是配置项而非硬编码文案）。
 */

import type { SupportFeedbackRequest, SupportFeedbackResponse, SupportTicketStatus } from '@/interfaces/support'

export const feedbackIssueTypes = [
  'functionality',
  'apiCall',
  'billing',
  'suggestion',
  'other',
] as const

export type FeedbackIssueType = (typeof feedbackIssueTypes)[number]

/**
 * 建单时写进 `category` 的值。
 *
 * ⚠️ 技术方案 §4.1 里 `category` 是自由文本（`TEXT`，无 CHECK 枚举），没有给 code 表；
 * PRD §7.5 给的是这五个中文类型名。故按 PRD 的中文类型名上行，**不自造英文枚举值**。
 * 若后端联调时要求 code，改这一张表即可（UI 侧一直用 code，不受影响）。
 */
export const FEEDBACK_CATEGORY_WIRE_VALUE: Record<FeedbackIssueType, string> = {
  functionality: '功能异常',
  apiCall: '调用问题',
  billing: '账单问题',
  suggestion: '产品建议',
  other: '其他',
}

export interface FeedbackDraft {
  issueType: '' | FeedbackIssueType
  /** 问题描述，去首尾空格后不可为空（PRD §7.5） */
  description: string
  /** `<input type="datetime-local">` 的本地时间字符串，默认当前时间，可改 */
  occurredAt: string
  /** 关联调用日志用，选填 */
  requestId: string
  /** 已上传附件的服务端 ID（技术方案 §6.6：先传附件换 ID，再带 ID 建单） */
  attachmentId: string
  /** 已选附件文件名，仅用于表单回显 */
  attachmentName: string
}

/** 校验只产出错误 code，展示文案由调用方过 i18n，避免领域层写死中文 */
export type FeedbackErrorCode = 'issueTypeRequired' | 'descriptionRequired'
export type FeedbackErrors = Partial<Record<'issueType' | 'description', FeedbackErrorCode>>

/** 对话流里那张「反馈已提交」卡片的数据：编号/状态文案/预计响应时间全部来自服务端 */
export interface FeedbackReceipt {
  /** 服务端返回的工单编号（形如 FB-YYYYMMDD-NNNN，由服务端按天序列分配） */
  ticketId: string
  /** 英文状态枚举，判断逻辑只认它 */
  status: SupportTicketStatus
  /** 服务端下发的展示文案（如「等待客服受理」），展示只认它 */
  statusLabel: string
  /** 预计响应时间文案；服务端没返回就不展示这一行，绝不前端兜底编一个 */
  expectedResponseLabel?: string
  issueType: FeedbackIssueType
  summary: string
}

/** 回执卡片上的描述摘要长度，与原型一致 */
export const FEEDBACK_SUMMARY_MAX = 48

function twoDigits(value: number) {
  return String(value).padStart(2, '0')
}

/** 生成 `<input type="datetime-local">` 需要的本地时间字符串（不能用 toISOString，那是 UTC） */
export function formatLocalDateTime(date: Date) {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`
}

export function createEmptyFeedbackDraft(now = new Date()): FeedbackDraft {
  return {
    issueType: '',
    description: '',
    occurredAt: formatLocalDateTime(now),
    requestId: '',
    attachmentId: '',
    attachmentName: '',
  }
}

/** PRD §7.5：问题类型与问题描述必填，描述去首尾空格后不可为空 */
export function validateFeedbackDraft(draft: FeedbackDraft): FeedbackErrors {
  const errors: FeedbackErrors = {}
  if (!draft.issueType) errors.issueType = 'issueTypeRequired'
  if (!draft.description.trim()) errors.description = 'descriptionRequired'
  return errors
}

export interface FeedbackPageContext {
  /** 幂等键：同一次提交重试要复用，成功或取消后才换新（技术方案 §6.6） */
  clientSubmissionId: string
  /** 页面上下文（PRD §7.5：当前页面上下文随反馈记录） */
  pageName?: string
  pagePath?: string
  /** 关联本次问答会话 */
  conversationId?: string | null
}

/** 把表单草稿映射成 `POST /support/feedback` 的入参 */
export function buildFeedbackRequest(draft: FeedbackDraft, context: FeedbackPageContext): SupportFeedbackRequest {
  if (!draft.issueType) throw new Error('Feedback issue type is required')
  // datetime-local 是无时区的本地时间串，交给 Date 解析成本地时刻后再转 ISO（带时区信息）
  const occurredAt = draft.occurredAt ? new Date(draft.occurredAt) : null
  return {
    client_submission_id: context.clientSubmissionId,
    category: FEEDBACK_CATEGORY_WIRE_VALUE[draft.issueType],
    description: draft.description.trim(),
    ...(occurredAt && !Number.isNaN(occurredAt.getTime()) ? { occurred_at: occurredAt.toISOString() } : {}),
    ...(draft.requestId.trim() ? { request_id: draft.requestId.trim() } : {}),
    ...(draft.attachmentId ? { attachment_ids: [draft.attachmentId] } : {}),
    ...(context.pageName ? { page_name: context.pageName } : {}),
    ...(context.pagePath ? { page_path: context.pagePath } : {}),
    ...(context.conversationId ? { conversation_id: context.conversationId } : {}),
  }
}

/**
 * 服务端返回的工单摘要 + 用户刚填的草稿 → 对话流里的回执卡片数据。
 * 问题类型与描述取草稿（就是用户刚提交的内容），编号/状态/预计响应时间取服务端。
 */
export function buildFeedbackReceipt(response: SupportFeedbackResponse, draft: FeedbackDraft): FeedbackReceipt {
  if (!draft.issueType) throw new Error('Feedback issue type is required')
  return {
    ticketId: response.ticket_id,
    status: response.status,
    statusLabel: response.status_label,
    expectedResponseLabel: response.expected_response_label,
    issueType: draft.issueType,
    summary: draft.description.trim().slice(0, FEEDBACK_SUMMARY_MAX),
  }
}
