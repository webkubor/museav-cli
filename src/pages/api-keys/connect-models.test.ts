import { describe, expect, it } from 'vitest'
import { buildConnectModelOptions } from './connect-models'
import type { CatalogModelItem } from '@/types'

function fixtureModel(overrides: Partial<CatalogModelItem>): CatalogModelItem {
  return {
    id: overrides.model_id ?? 'm',
    model_id: 'vendor/model',
    display_name: 'Model',
    modalities: ['text'],
    tags: [],
    context_length: 0,
    max_output_tokens: 0,
    pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY' },
    released_at: '',
    knowledge_cutoff: '',
    status: 'available',
    logo_url: '',
    coding_tools: [],
    ...overrides,
  }
}

describe('buildConnectModelOptions', () => {
  // QA 的 FakeLLM 夹具 coding_tools 恒为空，靠这一点排除，不再靠 protocol/output_modalities 近似判断（qa#583）
  it('coding_tools 为空的模型（QA 夹具）不进下拉，即便协议和出文本都对得上', () => {
    const options = buildConnectModelOptions(
      [
        fixtureModel({ model_id: 'fakellm/qa-text-pro', output_modalities: ['text'], coding_tools: [] }),
        fixtureModel({ model_id: 'anthropic/claude-opus-4.6', output_modalities: ['text'], coding_tools: ['claude-code', 'codex'] }),
      ],
      'claude-code'
    )
    expect(options).toEqual(['claude-opus-4.6'])
  })

  it('只按 tool 是否在 coding_tools 里命中，同一模型在两个 tab 各自判断', () => {
    const items = [
      fixtureModel({ model_id: 'anthropic/claude-opus-4.6', coding_tools: ['claude-code'] }),
      fixtureModel({ model_id: 'openai/gpt-5.5', coding_tools: ['codex'] }),
    ]
    expect(buildConnectModelOptions(items, 'claude-code')).toEqual(['claude-opus-4.6'])
    expect(buildConnectModelOptions(items, 'codex')).toEqual(['gpt-5.5'])
  })

  it('status 非 available 的模型不进下拉', () => {
    const options = buildConnectModelOptions(
      [fixtureModel({ model_id: 'anthropic/claude-opus-4.6', status: 'deprecated', coding_tools: ['claude-code'] })],
      'claude-code'
    )
    expect(options).toEqual([])
  })
})
