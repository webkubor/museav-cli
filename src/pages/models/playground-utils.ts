import type { ExperienceAttachment } from '@/services/experience-sessions'
import type { ExperienceMessage } from './model-experience-data'

/** 新会话的初始消息列表（空数组占位） */
export const INITIAL_MESSAGES: ExperienceMessage[] = []

/** 会话统计重置值（§3.7，settings 弹窗展示用） */
export const RESET_SESSION_STATS = { requestCount: 0, tokens: 0, cost: 0 }

/** 上传中/已上传的待发送附件（§7.5，每轮最多一个） */
export interface PlaygroundPendingAttachment {
  file: File
  previewUrl: string
  uploaded: ExperienceAttachment
}

/** 历史会话年龄分桶（§10.3 playground_history_action.history_age_bucket），边界为工程经验值 */
export function historyAgeBucket(updatedAt: string): string {
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const days = ageMs / (24 * 3600 * 1000)
  if (days < 1) return '<1d'
  if (days < 7) return '1-7d'
  if (days < 30) return '7-30d'
  return '>30d'
}
