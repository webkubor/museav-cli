/**
 * 体验页空态模型卡片（需求方 shared/modelgo_prd#834）字段契约。
 *
 * 钉住三件容易在后续改动里悄悄走样的事：
 * 1. 六格的**取值口径**与模型广场同源 —— 尤其「未配价 → —」不能写成「免费」，
 *    这条在广场上是 qa#624 的原案，卡片是第三处复制该口径的地方；
 * 2. 限免（promotion.free）只认服务端标记、不看金额 —— test 上真有「标限免却留着
 *    原价」的数据，按金额判会渲染出自相矛盾的卡片；
 * 3. 媒体模型走**另一套格子**（主价格/计费单位/主要规格/可体验任务）。写死成
 *    输入/输出/上下文那套的话，图片模型整排会是「¥— / 上下文 —」。
 */

import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ExperienceModelCard } from './ExperienceModelCard'
import type { CatalogModelItem } from '@/types'

// ModelIcon → @lobehub/icons，其 es/ 目录式导入在 vitest 的 node 解析下会炸，
// 且与本用例断言的字段无关（与 ModelDetailPanel.test 同法）。
vi.mock('@/features/models/components/ModelIcon', () => ({
  ModelIcon: () => null,
}))

function makeModel(patch: Partial<CatalogModelItem> = {}): CatalogModelItem {
  return {
    id: 'glm-5.2',
    model_id: 'glm-5.2',
    display_name: 'Z.ai: GLM 5.2',
    provider: 'Z.ai',
    modalities: ['text'],
    input_modalities: ['text'],
    output_modalities: ['text'],
    tags: [],
    context_length: 1_000_000,
    max_output_tokens: 8192,
    pricing: { input_per_1m: '2', output_per_1m: '8', cache_read_per_1m: '0.4', currency: 'CNY', mode: 'token' },
    released_at: '',
    knowledge_cutoff: '',
    status: 'active',
    logo_url: '',
    description: '智谱新一代通用模型。',
    ...patch,
  } as CatalogModelItem
}

/** 取某一格（dt 文案）的值文本，把单位/划线原价一起拼进来 */
function specValue(label: string): string {
  const dt = screen.getByText(label)
  const dd = dt.parentElement?.querySelector('dd')
  return (dd?.textContent ?? '').trim()
}

beforeAll(async () => {
  await loadLocaleNamespaces(['models', 'modelsCatalog', 'modelsExperience'], 'zh')
  await i18n.changeLanguage('zh')
})

describe('体验页模型卡片 · 对话模型六格（#834）', () => {
  it('六格取值与广场同源：类型/价格/上下文/最大输出', () => {
    render(<ExperienceModelCard model={makeModel()} />)

    expect(screen.getByText('GLM 5.2')).toBeTruthy()
    // model_id 明文可复制（原型里名称下方那行）
    expect(screen.getByText('glm-5.2')).toBeTruthy()
    expect(screen.getByRole('button', { name: '复制 API ID' })).toBeTruthy()

    expect(specValue('输入类型')).toContain('文本')
    expect(specValue('输出类型')).toContain('文本')
    // 原型价格写作「¥2/M Tokens」：值与单位之间不留空格，后缀带计量词
    expect(specValue('输入价格')).toBe('¥2/M Tokens')
    expect(specValue('输出价格')).toBe('¥8/M Tokens')
    expect(specValue('上下文窗口')).toBe('1M')
    expect(specValue('最大输出')).toBe('8,192 Tokens')
  })

  it('未配价回落「—」而不是「免费」：价格为 0 但没有限免标记的仍按付费处理（qa#624 口径）', () => {
    render(<ExperienceModelCard model={makeModel({
      pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY', mode: 'token' },
      max_output_tokens: 0,
    })} />)

    expect(specValue('输入价格')).toBe('—')
    expect(specValue('输出价格')).toBe('—')
    // max_output_tokens 缺值同样给「—」，不编一个 4096 默认值糊上去
    expect(specValue('最大输出')).toBe('—')
  })

  it('限免只认服务端标记：标了 free 就写「免费」，哪怕 pricing 里还留着原价', () => {
    render(<ExperienceModelCard model={makeModel({
      promotion: { free: true },
    } as Partial<CatalogModelItem>)} />)

    expect(specValue('输入价格')).toBe('免费')
    expect(specValue('输出价格')).toBe('免费')
    expect(screen.getByText('限时特惠·免费')).toBeTruthy()
  })

  it('促销双价：原价高于现价才补划线，单位跟着一起划', () => {
    render(<ExperienceModelCard model={makeModel({
      pricing: { input_per_1m: '4.46', output_per_1m: '17.8', cache_read_per_1m: '0.9', currency: 'CNY', mode: 'token' },
      promotion: { discount_label: '限时特惠·8折', original_input_per_1m: '5.6', original_output_per_1m: '17.8' },
    } as Partial<CatalogModelItem>)} />)

    expect(specValue('输入价格')).toBe('¥4.46/M Tokens¥5.6/M Tokens')
    // 原价等于现价 → 守卫吞掉划线，只留现价（否则渲染成「¥17.8 划掉 ¥17.8」）
    expect(specValue('输出价格')).toBe('¥17.8/M Tokens')
  })
})

describe('体验页模型卡片 · 媒体模型换一套格子（#834）', () => {
  it('图片模型摆 主价格/计费单位/主要规格/可体验任务，不摆上下文与输入输出价', () => {
    render(<ExperienceModelCard model={makeModel({
      id: 'seedream-5.0',
      model_id: 'seedream-5.0',
      display_name: 'ByteDance: Seedream 5.0',
      provider: 'ByteDance',
      modalities: ['text', 'image'],
      input_modalities: ['text'],
      output_modalities: ['image'],
      context_length: 0,
      max_output_tokens: 0,
      price_unit: '张',
      pricing: { input_per_1m: '0.165', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY', mode: 'per_call', per_call_price: '0.22' },
    })} />)

    // per_call 现价取 input/per_call 中较低的正值（促销期后端把折后价写进 input_per_1m）
    expect(specValue('主价格')).toContain('¥0.165/张')
    expect(specValue('计费单位')).toBe('每张')
    expect(specValue('主要规格')).toBe('按任务规格')
    expect(specValue('可体验任务')).toBe('文生图')
    expect(screen.queryByText('上下文窗口')).toBeNull()
    expect(screen.queryByText('输入价格')).toBeNull()
  })
})
