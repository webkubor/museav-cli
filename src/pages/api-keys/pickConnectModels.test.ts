import { describe, expect, it } from 'vitest'
import { pickConnectModels } from './connect-models'

describe('pickConnectModels', () => {
  // 目录 model_id 带厂商前缀，但网关认裸名 → 必须剥前缀，否则钉进接入参数仍 403（需求方 #257）
  it('剥掉厂商前缀，返回网关认的裸模型名', () => {
    const { claudeModel } = pickConnectModels([
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-opus-4.6',
      'pytest-223-free/20337960',
    ])
    expect(claudeModel).toBe('claude-opus-4.6')
  })

  it('opus 优先于 sonnet，haiku 不当主模型', () => {
    const { claudeModel } = pickConnectModels(['claude-sonnet-4.6', 'claude-opus-4.6', 'claude-haiku-4.5'])
    expect(claudeModel).toBe('claude-opus-4.6')
  })

  it('codex 选非 mini 的 gpt，没有 gpt 时退回 Claude 模型', () => {
    expect(pickConnectModels(['gpt-5.5', 'gpt-5-mini', 'claude-opus-4.6']).codexModel).toBe('gpt-5.5')
    expect(pickConnectModels(['claude-opus-4.6']).codexModel).toBe('claude-opus-4.6')
  })

  it('目录里没有可用模型时优雅降级为 undefined', () => {
    expect(pickConnectModels([])).toEqual({ claudeModel: undefined, codexModel: undefined })
  })
})
