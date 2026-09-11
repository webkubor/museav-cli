/**
 * 模型详情面板「价格梯度」表测试（shared/modelgo_prd#864）
 *
 * 钉住次级分档（sub_label）的渲染契约：后端（cn 生产 release-20260826-1 起）会为
 * 同一上下文区间下发多行、用 sub_label 区分（如 glm-4.7 的「输出 <200 / 输出 ≥200」）。
 * 前端不渲染时页面出现两行同名「0–32K」价格不同，读起来像脏数据 —— 本用例用
 * 组件级断言守住「有 sub 补条件列 / 无 sub 不加列」两个方向。test 环境当前没有
 * 带 sub_label 的载体（唯一有梯度的 fakellm 模型是纯主档），浏览器只能验无 sub
 * 不回归的那半，有 sub 的那半靠这里。
 */

import { render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { ModelDetailPanel } from './ModelDetailPanel'
import type { CatalogModelDetail, CatalogPricingRule } from '@/types'

// ModelIcon → @lobehub/icons，其 es/ 目录式导入在 vitest 的 node 解析下会炸，
// 且与本用例要断言的表格无关，直接替身（与 ModelsCompareModal.test 同法）。
vi.mock('@/features/models/components/ModelIcon', () => ({
  ModelIcon: () => null,
}))

function makeDetail(pricingRules: CatalogPricingRule[]): CatalogModelDetail {
  return {
    id: 'glm-4.7',
    model_id: 'glm-4.7',
    display_name: 'GLM-4.7',
    modalities: ['text'],
    tags: [],
    context_length: 200000,
    max_output_tokens: 0,
    pricing: { input_per_1m: '2', output_per_1m: '8', cache_read_per_1m: '0.4', currency: 'CNY' },
    released_at: '',
    knowledge_cutoff: '',
    status: 'active',
    logo_url: '',
    description: '',
    variants: [],
    input_modalities: ['text'],
    output_modalities: ['text'],
    pricing_rules: pricingRules,
  }
}

/** cn 生产 glm-4.7 实际下发形状（2026-08-26 实测）：前两行同区间、靠 sub_label 区分 */
const rulesWithSub: CatalogPricingRule[] = [
  {
    dimension: 'context_length', label: '0–32K', label_en: '0–32K', min: 0, max: 31999,
    sub_dimension: 'output_length', sub_label: '输出 <200', sub_label_en: 'output <200',
    sub_min: 0, sub_max: 199,
    input_per_1m: '2', output_per_1m: '8', cache_read_per_1m: '0.4', unit: 'M',
  },
  {
    dimension: 'context_length', label: '0–32K', label_en: '0–32K', min: 0, max: 31999,
    sub_dimension: 'output_length', sub_label: '输出 ≥200', sub_label_en: 'output ≥200',
    sub_min: 200,
    input_per_1m: '3', output_per_1m: '14', cache_read_per_1m: '0.6', unit: 'M',
  },
  {
    dimension: 'context_length', label: '32K以上', label_en: '32K+', min: 32000,
    input_per_1m: '4', output_per_1m: '16', cache_read_per_1m: '0.8', unit: 'M',
  },
]

const rulesNoSub: CatalogPricingRule[] = [
  { dimension: 'context_length', label: '0–128K', min: 0, max: 128000, input_per_1m: '0.8', output_per_1m: '4.8', unit: 'M' },
  { dimension: 'context_length', label: '128K以上', min: 128001, input_per_1m: '4', output_per_1m: '24', unit: 'M' },
]

beforeAll(async () => {
  await loadLocaleNamespaces(['models', 'modelsCatalog'], 'zh')
  await i18n.changeLanguage('zh')
})

describe('价格梯度表 · 次级分档 sub_label（#864）', () => {
  it('有 sub 行 → 补「条件」列：同名区间两行靠条件区分，主档行给 —', () => {
    render(<ModelDetailPanel detail={makeDetail(rulesWithSub)} />)
    expect(screen.getByRole('columnheader', { name: '条件' })).toBeTruthy()

    const rows = screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0)
    expect(rows).toHaveLength(3)
    const cellTexts = rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))
    // 行序保持接口下发顺序；两行「0–32K」有了区分列不再像脏数据
    expect(cellTexts[0]).toEqual(['0–32K', '输出 <200', '¥2/M', '¥8/M', '¥0.4/M'])
    expect(cellTexts[1]).toEqual(['0–32K', '输出 ≥200', '¥3/M', '¥14/M', '¥0.6/M'])
    expect(cellTexts[2]).toEqual(['32K以上', '—', '¥4/M', '¥16/M', '¥0.8/M'])
  })

  it('纯主档组 → 不加「条件」列，维持原布局（防对存量模型的过修）', () => {
    render(<ModelDetailPanel detail={makeDetail(rulesNoSub)} />)
    expect(screen.queryByRole('columnheader', { name: '条件' })).toBeNull()
    const rows = screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0)
    // 3 列：区间 / 输入 / 输出。这组档位没下发缓存读取价，该列按 #1000 整列去掉
    expect(within(rows[0]).getAllByRole('cell')).toHaveLength(3)
  })
})

/**
 * 峰时倍率档的促销双价与缓存读取列（shared/modelgo_prd#1000）
 *
 * cn 生产 deepseek-v4-pro：挂「限时74折」，规格条按 #867 走折后价 ¥3.33（划掉 ¥4.5），
 * 但峰时档下发的 `input_per_1m: "9"` 是折前价 4.5 × 倍率 2 —— 梯度表比规格条贵一截
 * 又没有划线；同一张表的「缓存读取」列则因为倍率档不下发该字段，被兜底填成「×2」
 * （整档倍率，不是缓存读取价）。两处都是需求方 2026-09-11 点名的现象。
 */
describe('峰时倍率档 · 促销折后价与缓存读取列（#1000）', () => {
  /** cn 生产 deepseek-v4-pro 实际下发形状（2026-09-11 实测） */
  const peakRules: CatalogPricingRule[] = [
    {
      dimension: 'peak_time', label: '09:00–12:00', start_time: '09:00', end_time: '12:00',
      timezone: 'Asia/Shanghai', mode: 'multiplier', rate: '2',
      input_per_1m: '9', output_per_1m: '27', unit: 'M',
    },
    {
      dimension: 'peak_time', label: '14:00–18:00', start_time: '14:00', end_time: '18:00',
      timezone: 'Asia/Shanghai', mode: 'multiplier', rate: '2',
      input_per_1m: '9', output_per_1m: '27', unit: 'M',
    },
  ]

  function makePeakDetail(promotion?: CatalogModelDetail['promotion']): CatalogModelDetail {
    return {
      ...makeDetail(peakRules),
      id: 'deepseek-v4-pro',
      model_id: 'deepseek-v4-pro',
      display_name: 'DeepSeek V4 Pro',
      pricing: { input_per_1m: '3.33', output_per_1m: '9.99', cache_read_per_1m: '0.111', currency: 'CNY' },
      promotion,
    }
  }

  const promotion = {
    free: false,
    original_price: '4.5', original_input_per_1m: '4.5',
    original_output_per_1m: '13.5', original_cache_read_per_1m: '0.15',
    discount_label: '限时74折',
  }

  /** 划线折前价的 DOM 形态与规格条同源：<s class="mg-metric-strike"> */
  const strikes = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('s.mg-metric-strike')).map((s) => s.textContent)

  it('促销期：每档展示折后价 + 划线原档位价，缓存读取列整列不出现', () => {
    render(<ModelDetailPanel detail={makePeakDetail(promotion)} />)
    expect(screen.queryByRole('columnheader', { name: '缓存读取' })).toBeNull()

    const rows = screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0)
    expect(rows).toHaveLength(2)
    // 时段 / 时区 / 输入 / 输出 —— 折后价在前、折前价划线并列（与规格条同口径）
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['09:00–12:00', 'Asia/Shanghai', '¥6.66/M¥9/M', '¥19.98/M¥27/M'])
    expect(strikes(rows[0])).toEqual(['¥9/M', '¥27/M'])
  })

  it('无促销：档位价原样展示、不划线，缓存读取列同样不出现（不再打出「×2」）', () => {
    render(<ModelDetailPanel detail={makePeakDetail(undefined)} />)
    expect(screen.queryByRole('columnheader', { name: '缓存读取' })).toBeNull()
    expect(screen.queryByText('×2')).toBeNull()

    const rows = screen.getAllByRole('row').filter((r) => within(r).queryAllByRole('cell').length > 0)
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['09:00–12:00', 'Asia/Shanghai', '¥9/M', '¥27/M'])
    expect(strikes(rows[0])).toHaveLength(0)
  })
})
