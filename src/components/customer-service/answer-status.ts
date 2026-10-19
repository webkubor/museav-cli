import type { SupportAnswerStatus } from '@/interfaces/support'

type AnswerStatusHintKey =
  | 'common.customerService.answerStatus.intent'
  | 'common.customerService.answerStatus.needsLogin'
  | 'common.customerService.answerStatus.insufficientEvidence'
  | 'common.customerService.answerStatus.degraded'
  | 'common.customerService.answerStatus.outOfScope'
  | 'common.customerService.answerStatus.suggestHandoff'

/**
 * 回答状态 → 气泡下方的引导文案。
 * 气泡里不再放「转人工」按钮（modelgo_prd#1388）：转人工只能在对话里表达，由后端判定放行。
 */
export function answerStatusPresentation(
  status: SupportAnswerStatus | undefined,
): { hintKey: AnswerStatusHintKey | null } {
  switch (status) {
    case 'intent':
      return { hintKey: 'common.customerService.answerStatus.intent' }
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
