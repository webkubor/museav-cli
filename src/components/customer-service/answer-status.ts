import type { SupportAnswerStatus } from '@/interfaces/support'

type AnswerStatusHintKey =
  | 'common.customerService.answerStatus.needsLogin'
  | 'common.customerService.answerStatus.insufficientEvidence'
  | 'common.customerService.answerStatus.degraded'
  | 'common.customerService.answerStatus.outOfScope'
  | 'common.customerService.answerStatus.suggestHandoff'

/**
 * 回答状态 → 气泡下方的引导文案。
 * 气泡里不再放「转人工」按钮（modelgo_prd#1388）：转人工只能在对话里表达，由后端判定放行。
 * `intent` 只用于「已识别转人工 / 反馈」，回答正文已说明下一步，不再叠加「请补充工作空间…」提示
 * （排队回复下挂这句是 #1388 测试环境验收发现的）。
 */
export function answerStatusPresentation(
  status: SupportAnswerStatus | undefined,
): { hintKey: AnswerStatusHintKey | null } {
  switch (status) {
    case 'needs_login':
      return { hintKey: 'common.customerService.answerStatus.needsLogin' }
    case 'insufficient_evidence':
      return { hintKey: 'common.customerService.answerStatus.insufficientEvidence' }
    case 'degraded':
      return { hintKey: 'common.customerService.answerStatus.degraded' }
    case 'out_of_scope':
      return { hintKey: 'common.customerService.answerStatus.outOfScope' }
    case 'human_handoff':
    case 'suggest_handoff':
      return { hintKey: 'common.customerService.answerStatus.suggestHandoff' }
    default:
      return { hintKey: null }
  }
}
