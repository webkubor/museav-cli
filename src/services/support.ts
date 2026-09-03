/**
 * 智能客服工单接口（本期只用到问题反馈建单与附件上传）。
 *
 * 契约见《ModelGo 智能客服与工单体系技术方案（v0.1）》§5.1，**后端预计 9/7 上线**。
 * 路径不带 `api/v1` 前缀 —— `src/lib/request.ts` 会统一补齐；鉴权沿用会话 cookie + CSRF 双提交，
 * 业务失败仍是 HTTP 200，错误落在 `code`/`errors`，由 request.ts 的信封解包统一抛成 ModelGoApiError。
 */

import { post, upload } from '@/lib/request'
import type {
  SupportAttachment,
  SupportFeedbackRequest,
  SupportFeedbackResponse,
} from '@/interfaces/support'

/**
 * 上传反馈附件，换回附件 ID 用于建单（§6.6：提交分两步，先传附件再建单）。
 * 类型、大小、数量与病毒扫描由服务端校验，前端不重复实现规则（§5.1）。
 */
export function uploadSupportAttachment(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return upload<SupportAttachment>('post', 'support/attachments', formData)
}

/** 提交问题反馈建单，返回工单摘要（编号、状态与 status_label、预计响应时间） */
export function submitSupportFeedback(body: SupportFeedbackRequest) {
  return post<SupportFeedbackResponse>('support/feedback', body)
}
