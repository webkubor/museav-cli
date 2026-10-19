import { describe, expect, it } from 'vitest'
import { answerStatusPresentation } from './answer-status'

describe('answerStatusPresentation', () => {
  it.each([
    ['answered', null],
    ['answered_tool', null],
    // intent = 已识别转人工/反馈，正文已说明下一步，不再叠提示（modelgo_prd#1388）
    ['intent', null],
    ['needs_login', 'common.customerService.answerStatus.needsLogin'],
    ['insufficient_evidence', 'common.customerService.answerStatus.insufficientEvidence'],
    ['degraded', 'common.customerService.answerStatus.degraded'],
    ['out_of_scope', 'common.customerService.answerStatus.outOfScope'],
    ['human_handoff', 'common.customerService.answerStatus.suggestHandoff'],
    ['suggest_handoff', 'common.customerService.answerStatus.suggestHandoff'],
    // 被拦下的转人工：回答正文自己说明怎么做，不再叠加提示（modelgo_prd#1388）
    ['handoff_needs_question', null],
    ['handoff_pending', null],
  ] as const)('maps %s to its product guidance', (status, hintKey) => {
    expect(answerStatusPresentation(status)).toEqual({ hintKey })
  })
})
