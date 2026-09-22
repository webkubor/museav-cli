import { describe, expect, it } from 'vitest'
import { answerStatusPresentation } from './answer-status'

describe('answerStatusPresentation', () => {
  it.each([
    ['answered', null, false],
    ['answered_tool', null, false],
    ['intent', 'common.customerService.answerStatus.intent', false],
    ['needs_login', 'common.customerService.answerStatus.needsLogin', false],
    ['insufficient_evidence', 'common.customerService.answerStatus.insufficientEvidence', false],
    ['degraded', 'common.customerService.answerStatus.degraded', false],
    ['out_of_scope', 'common.customerService.answerStatus.outOfScope', false],
    ['human_handoff', 'common.customerService.answerStatus.suggestHandoff', true],
    ['suggest_handoff', 'common.customerService.answerStatus.suggestHandoff', true],
  ] as const)('maps %s to its product guidance', (status, hintKey, showHandoffCta) => {
    expect(answerStatusPresentation(status)).toEqual({ hintKey, showHandoffCta })
  })

  it('honors the API suggest_handoff flag independently of the answer status', () => {
    expect(answerStatusPresentation('insufficient_evidence', true)).toEqual({
      hintKey: 'common.customerService.answerStatus.insufficientEvidence',
      showHandoffCta: true,
    })
  })
})
