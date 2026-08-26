/**
 * 模型广场本地筛选逻辑单测（shared/modelgo_prd#872）。
 * 覆盖：selected 解析、组内 OR/组间 AND、输入类型按 input_modalities 严格匹配、
 * 上下文含边界下限、free 只认显式限免标记、输出模态维度与其余维度的拆分。
 */
import { describe, expect, it } from 'vitest'
import type { CatalogModelItem } from '@/types'
import {
  parseCatalogFilters,
  matchesCatalogFilters,
  matchesCatalogFiltersExceptOutput,
  matchesOutputModality,
  modelVendorCode,
  CONTEXT_SLIDER_STOPS,
} from './modelCatalogFilterLogic'

function model(overrides: Partial<CatalogModelItem>): CatalogModelItem {
  return {
    id: 'id-1',
    model_id: 'm-1',
    display_name: 'M1',
    modalities: ['text'],
    tags: [],
    context_length: 128_000,
    max_output_tokens: 0,
    pricing: { input_per_1m: '1', output_per_1m: '2', cache_read_per_1m: '0', currency: 'CNY' },
    released_at: '2026-01-01',
    knowledge_cutoff: '2025-12-01',
    status: 'active',
    logo_url: '',
    ...overrides,
  }
}

describe('parseCatalogFilters', () => {
  it('多选维度收集同前缀多项，单选维度取首项', () => {
    const f = parseCatalogFilters([
      'vendor:OpenAI', 'vendor:deepseek', 'input:text', 'input:file',
      'protocol:openai', 'modality:image', 'tag:reasoning', 'ctx:256000', 'price:free', 'promo:1',
    ])
    expect(f.vendors).toEqual(['openai', 'deepseek'])
    expect(f.inputs).toEqual(['text', 'file'])
    expect(f.protocols).toEqual(['openai'])
    expect(f.outputModality).toBe('image')
    expect(f.tags).toEqual(['reasoning'])
    expect(f.contextMin).toBe(256_000)
    expect(f.price).toBe('free')
    expect(f.promoOnly).toBe(true)
  })

  it('空选择 = 全部不限', () => {
    const f = parseCatalogFilters([])
    expect(f.vendors).toEqual([])
    expect(f.contextMin).toBeUndefined()
    expect(f.outputModality).toBeUndefined()
    expect(matchesCatalogFilters(model({}), f)).toBe(true)
  })

  it('ctx:all 与非法数字都按不限处理', () => {
    expect(parseCatalogFilters(['ctx:all']).contextMin).toBeUndefined()
    expect(parseCatalogFilters(['ctx:abc']).contextMin).toBeUndefined()
  })
})

describe('matchesCatalogFiltersExceptOutput', () => {
  it('输入类型组内 OR：命中任一选中输入模态即通过', () => {
    const f = parseCatalogFilters(['input:audio', 'input:file'])
    expect(matchesCatalogFiltersExceptOutput(model({ input_modalities: ['text', 'file'] }), f)).toBe(true)
    expect(matchesCatalogFiltersExceptOutput(model({ input_modalities: ['text', 'image'] }), f)).toBe(false)
  })

  it('输入类型严格按 input_modalities，不看 output_modalities', () => {
    const f = parseCatalogFilters(['input:image'])
    // 文生图模型：输出 image 但输入只有 text，不能命中「图片」输入类型
    const t2i = model({ input_modalities: ['text'], output_modalities: ['image'] })
    expect(matchesCatalogFiltersExceptOutput(t2i, f)).toBe(false)
  })

  it('厂商多选 OR 且大小写不敏感（后端混发 minimax/MiniMax）', () => {
    const f = parseCatalogFilters(['vendor:minimax', 'vendor:deepseek'])
    expect(matchesCatalogFiltersExceptOutput(model({ provider: 'MiniMax' }), f)).toBe(true)
    expect(matchesCatalogFiltersExceptOutput(model({ provider: 'DeepSeek' }), f)).toBe(true)
    expect(matchesCatalogFiltersExceptOutput(model({ provider: 'OpenAI' }), f)).toBe(false)
  })

  it('组间 AND：厂商命中但协议不命中则整体不命中', () => {
    const f = parseCatalogFilters(['vendor:openai', 'protocol:anthropic'])
    const m = model({ provider: 'OpenAI', protocols: ['openai'] })
    expect(matchesCatalogFiltersExceptOutput(m, f)).toBe(false)
  })

  it('上下文下限含边界（≥ 语义，与旧 context_min 一致）', () => {
    const f = parseCatalogFilters(['ctx:128000'])
    expect(matchesCatalogFiltersExceptOutput(model({ context_length: 128_000 }), f)).toBe(true)
    expect(matchesCatalogFiltersExceptOutput(model({ context_length: 127_999 }), f)).toBe(false)
  })

  it('free 只认显式限免标记，价格为 0 不算免费（qa#624 口径）', () => {
    const f = parseCatalogFilters(['price:free'])
    const zeroPrice = model({ pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY' } })
    expect(matchesCatalogFiltersExceptOutput(zeroPrice, f)).toBe(false)
    const freeModel = model({ promotion: { free: true } })
    expect(matchesCatalogFiltersExceptOutput(freeModel, f)).toBe(true)
    expect(matchesCatalogFiltersExceptOutput(freeModel, parseCatalogFilters(['price:paid']))).toBe(false)
  })

  it('能力标签 AND 语义（与服务端 capability_tag 一致）', () => {
    const f = parseCatalogFilters(['tag:reasoning', 'tag:vision'])
    expect(matchesCatalogFiltersExceptOutput(model({ tags: ['reasoning', 'vision', 'code'] }), f)).toBe(true)
    expect(matchesCatalogFiltersExceptOutput(model({ tags: ['reasoning'] }), f)).toBe(false)
  })

  it('promo:1 只看存在生效促销（promotion 存在即生效）', () => {
    const f = parseCatalogFilters(['promo:1'])
    expect(matchesCatalogFiltersExceptOutput(model({ promotion: { free: false, discount_label: '7折' } }), f)).toBe(true)
    expect(matchesCatalogFiltersExceptOutput(model({}), f)).toBe(false)
  })
})

describe('matchesOutputModality / matchesCatalogFilters', () => {
  it('输出模态维度独立于其余维度（分类栏计数要排除本维度自身条件）', () => {
    const f = parseCatalogFilters(['modality:image', 'vendor:openai'])
    const textOut = model({ provider: 'OpenAI', output_modalities: ['text'] })
    expect(matchesCatalogFiltersExceptOutput(textOut, f)).toBe(true)
    expect(matchesOutputModality(textOut, f.outputModality)).toBe(false)
    expect(matchesCatalogFilters(textOut, f)).toBe(false)
    const imageOut = model({ provider: 'OpenAI', output_modalities: ['image'] })
    expect(matchesCatalogFilters(imageOut, f)).toBe(true)
  })

  it('老数据没拆输入/输出时回退合并 modalities', () => {
    const legacy = model({ modalities: ['text', 'image'], input_modalities: undefined, output_modalities: undefined })
    expect(matchesOutputModality(legacy, 'image')).toBe(true)
    expect(matchesCatalogFilters(legacy, parseCatalogFilters(['input:image']))).toBe(true)
  })
})

describe('CONTEXT_SLIDER_STOPS', () => {
  it('八档：任意 + 4K/16K/32K/64K/128K/256K/1M（#872 需求点 8）', () => {
    expect(CONTEXT_SLIDER_STOPS.map((s) => s.code)).toEqual([
      'all', '4000', '16000', '32000', '64000', '128000', '256000', '1000000',
    ])
    expect(CONTEXT_SLIDER_STOPS.map((s) => s.label).slice(1)).toEqual([
      '4K', '16K', '32K', '64K', '128K', '256K', '1M',
    ])
  })
})

describe('modelVendorCode', () => {
  it('provider 优先、vendor 兜底、小写归一', () => {
    expect(modelVendorCode(model({ provider: 'MoonshotAI', vendor: 'internal-x' }))).toBe('moonshotai')
    expect(modelVendorCode(model({ provider: undefined, vendor: 'Kling' }))).toBe('kling')
  })
})
