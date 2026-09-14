import type { SupportAnswerStatus } from '@/interfaces/support'

type AnswerStatusHintKey =
  | 'common.customerService.answerStatus.intent'
  | 'common.customerService.answerStatus.needsLogin'
  | 'common.customerService.answerStatus.insufficientEvidence'
  | 'common.customerService.answerStatus.degraded'
  | 'common.customerService.answerStatus.outOfScope'
  | 'common.customerService.answerStatus.suggestHandoff'

export function answerStatusPresentation(
  status: SupportAnswerStatus | undefined,
  suggestHandoff = false,
): { hintKey: AnswerStatusHintKey | null; showHandoffCta: boolean } {
  const showHandoffCta = suggestHandoff || status === 'human_handoff' || status === 'suggest_handoff'

  switch (status) {
    case 'intent':
      return { hintKey: 'common.customerService.answerStatus.intent', showHandoffCta }
    case 'needs_login':
      return { hintKey: 'common.customerService.answerStatus.needsLogin', showHandoffCta }
    case 'insufficient_evidence':
      return { hintKey: 'common.customerService.answerStatus.insufficientEvidence', showHandoffCta }
    case 'degraded':
      return { hintKey: 'common.customerService.answerStatus.degraded', showHandoffCta }
    case 'out_of_scope':
      return { hintKey: 'common.customerService.answerStatus.outOfScope', showHandoffCta }
    case 'human_handoff':
    case 'suggest_handoff':
      return { hintKey: 'common.customerService.answerStatus.suggestHandoff', showHandoffCta }
    default:
      return { hintKey: null, showHandoffCta }
  }
}
