/**
 * 体验页空态模型卡片（需求方 shared/modelgo_prd#834）字段契约。
 *
 * 对齐真源 PRD 原型 `modelgo_prd/src/App.tsx:20965 PlaygroundModelWelcomeCard`，
 * 钉住四件容易在后续改动里悄悄走样的事：
 * 1. 输入/输出类型**按当前 task 推导**，不是读 modalities 并集 —— 选了「文生图」
 *    就该是「文本 → 图片」，读并集会把「图生图」也算进来；
 * 2. 六格的取值口径与模型广场同源，尤其「未配价 → —」不能写成「免费」（qa#624）；
 * 3. 限免只认服务端 promotion.free、不看金额 —— test 上真有「标限免却留着原价」的数据；
 * 4. 最大输出缺值给原型的兜底词「按接口约定」，不编默认值、也不写「—」。
 */

import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ExperienceModelCard } from './ExperienceModelCard'
import type { ExperienceTaskType } from './model-experience-data'
import type { CatalogModelItem } from '@/types'

// ModelIcon → @lobehub/icons，其 es/ 目录式导入在 vitest 的 node 解析下会炸，
// 且与本用例断言的字段无关。
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

function renderCard(model: CatalogModelItem, task: ExperienceTaskType = 'text_to_text') {
  return render(<ExperienceModelCard model={model} task={task} />)
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

describe('体验页模型卡片 · 六格取值（#834）', () => {
  it('对话模型：身份 + 六格与原型逐格对齐', () => {
    renderCard(makeModel())

    expect(screen.getByText('GLM 5.2')).toBeTruthy()
    // model_id 明文可复制（原型里名称下方那行）
    expect(screen.getByText('glm-5.2')).toBeTruthy()
    expect(screen.getByRole('button', { name: '复制 API ID' })).toBeTruthy()

    expect(specValue('输入类型')).toBe('文本')
    expect(specValue('输出类型')).toBe('文本')
    // 原型价格写作「¥2/M Tokens」：值与单位之间不留空格，后缀带计量词
    expect(specValue('输入价格')).toBe('¥2/M Tokens')
    expect(specValue('输出价格')).toBe('¥8/M Tokens')
    expect(specValue('上下文窗口')).toBe('1M')
    expect(specValue('最大输出')).toBe('8,192 Tokens')
  })

  it('未配价回落「—」而不是「免费」；最大输出缺值给「按接口约定」', () => {
    renderCard(makeModel({
      pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY', mode: 'token' },
      max_output_tokens: 0,
    }))

    expect(specValue('输入价格')).toBe('—')
    expect(specValue('输出价格')).toBe('—')
    expect(specValue('最大输出')).toBe('按接口约定')
  })

  it('限免只认服务端标记：标了 free 就写「免费」，哪怕 pricing 里还留着原价', () => {
    renderCard(makeModel({ promotion: { free: true } } as Partial<CatalogModelItem>))

    expect(specValue('输入价格')).toBe('免费')
    expect(specValue('输出价格')).toBe('免费')
    expect(screen.getByText('限时特惠·免费')).toBeTruthy()
  })

  it('促销双价：原价高于现价才补划线，单位跟着一起划', () => {
    renderCard(makeModel({
      pricing: { input_per_1m: '4.46', output_per_1m: '17.8', cache_read_per_1m: '0.9', currency: 'CNY', mode: 'token' },
      promotion: { discount_label: '限时特惠·8折', original_input_per_1m: '5.6', original_output_per_1m: '17.8' },
    } as Partial<CatalogModelItem>))

    expect(specValue('输入价格')).toBe('¥4.46/M Tokens¥5.6/M Tokens')
    // 原价等于现价 → 守卫吞掉划线，只留现价（否则渲染成「¥17.8 划掉 ¥17.8」）
    expect(specValue('输出价格')).toBe('¥17.8/M Tokens')
  })
})

describe('体验页模型卡片 · 类型两格跟着 task 走（#834）', () => {
  it('对话模型显示模型支持的全部输入模态，输出恒为文本', () => {
    renderCard(makeModel({
      modalities: ['text', 'image', 'video'],
      input_modalities: ['text', 'image', 'video'],
      output_modalities: ['text'],
    }), 'image_to_text')

    expect(specValue('输入类型')).toBe('文本图片视频')
    expect(specValue('输出类型')).toBe('文本')
  })

  it('媒体模型只显示当前任务的那一对：文生图 = 文本 → 图片', () => {
    const seedream = makeModel({
      id: 'seedream-5.0',
      model_id: 'seedream-5.0',
      display_name: 'ByteDance: Seedream 5.0',
      provider: 'ByteDance',
      modalities: ['text', 'image'],
      input_modalities: ['text', 'image'],
      output_modalities: ['image'],
      context_length: 0,
      max_output_tokens: 0,
      price_unit: '张',
      pricing: { input_per_1m: '0.165', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY', mode: 'per_call', per_call_price: '0.22' },
    })

    renderCard(seedream, 'text_to_image')
    expect(specValue('输入类型')).toBe('文本')
    expect(specValue('输出类型')).toBe('图片')
    // per_call 的每张价镜像在 input_per_1m（#851 契约）；输出侧没有 token 价 → 「—」，
    // 原型对媒体模型也是同一对格子，不另开一套版式
    expect(specValue('输入价格')).toBe('¥0.165/张')
    expect(specValue('输出价格')).toBe('—')
  })

  it('同一个媒体模型换成图生图，输入类型跟着变成图片', () => {
    renderCard(makeModel({
      modalities: ['text', 'image'],
      input_modalities: ['text', 'image'],
      output_modalities: ['image'],
      price_unit: '张',
      pricing: { input_per_1m: '0.165', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY', mode: 'per_call' },
    }), 'image_to_image')

    expect(specValue('输入类型')).toBe('图片')
    expect(specValue('输出类型')).toBe('图片')
  })
})
