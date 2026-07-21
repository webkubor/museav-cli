import { describe, expect, it } from 'vitest'

import { artifactSummary } from './artifact-summary'

describe('artifactSummary', () => {
  it('uses the display-safe prompt summary instead of artifact technical metadata', () => {
    expect(artifactSummary({
      prompt: '品牌启动页短视频，含 3 个镜头和中文字幕。',
      redaction_state: 'captured',
    })).toBe('品牌启动页短视频，含 3 个镜头和中文字幕。')
  })

  it('hides a prompt that was not captured', () => {
    expect(artifactSummary({
      prompt: '不应展示的原始输入',
      redaction_state: 'not_captured',
    })).toBeNull()
  })
})
