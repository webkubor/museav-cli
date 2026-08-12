/**
 * 模型对比弹窗测试（shared/modelgo_prd#335）
 *
 * 覆盖的是「模型体验」侧接进来后新增的入参路径 —— 这条路径要登录态才能在浏览器里点到，
 * 本机没有 test 账号，所以用单测把契约钉住：多个锁定项、余额门、槽位上限、
 * onConfirmAdd 只回传新增项、以及原型的确认按钮禁用口径。
 * 模型广场侧（单锁定项 + 无余额门）已在浏览器实测，不在此重复。
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelsCompareModal } from './ModelsCompareModal'
import type { CatalogModelItem } from '@/types'

const messages: Record<string, string> = {
  'modelsCompare.title': '模型对比',
  'modelsCompare.currentModel': '当前模型',
  'modelsCompare.selectedModels': '已选模型',
  'modelsCompare.candidates': '可选候选',
  'modelsCompare.button.confirm': '确认对比',
  'modelsCompare.selectedCount': '最多可选 {{max}} 个模型进行对比，当前已选择 {{count}} / {{max}} 个',
  'modelsExperience.picker.balanceInsufficient': '余额不足',
}

// 只替换 useTranslation；initReactI18next 等仍走原模块（src/i18n.ts 会用到）。
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    // 第二个参数真实 t() 常是插值 options（如 { max, count }），不是 fallback 字符串——
    // 组件里 modelsCompare.selectedCount / empty.selectDesc 就这么调用，之前当字符串直接
    // 返回，把 options 对象原样当 children 渲染，React 直接崩（"Objects are not valid as
    // a React child"）。有插值 options 时对 messages 里的模板做最基础的 {{var}} 替换；
    // 没模板、fallback 也不是字符串时回落成 key 本身。
    t: (key: string, opts?: string | Record<string, unknown>) => {
      const template = messages[key]
      if (template === undefined) return typeof opts === 'string' ? opts : key
      if (typeof opts !== 'object' || opts === null) return template
      return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(opts[name] ?? ''))
    },
  }),
}))

// ModelIcon → @lobehub/icons，其 es/ 目录式导入在 vitest 的 node 解析下会炸，
// 且与本用例要断言的行为无关，直接替身。
vi.mock('@/features/models/components/ModelIcon', () => ({
  ModelIcon: () => null,
}))

/** 文本进 / 文本出 → 一级类别 dialogue、任务 text_to_text，彼此都是合格候选 */
function makeModel(over: Partial<CatalogModelItem> & Pick<CatalogModelItem, 'id' | 'model_id'>): CatalogModelItem {
  return {
    display_name: over.model_id,
    vendor: 'ModelGo',
    modalities: ['text'],
    input_modalities: ['text'],
    output_modalities: ['text'],
    tags: [],
    context_length: 128_000,
    max_output_tokens: 8_192,
    pricing: { input_per_1m: '1', output_per_1m: '2', cache_read_per_1m: '0', currency: 'CNY' },
    released_at: '2026-01-01',
    knowledge_cutoff: '2026-01-01',
    status: 'available',
    logo_url: '',
    compare_enabled: true,
    ...over,
  } as CatalogModelItem
}

const base = makeModel({ id: 'a', model_id: 'model-a' })
const second = makeModel({ id: 'b', model_id: 'model-b' })
const paid = makeModel({ id: 'c', model_id: 'model-c-paid' })
const free = makeModel({
  id: 'd',
  model_id: 'model-d-free',
  pricing: { input_per_1m: '0', output_per_1m: '0', cache_read_per_1m: '0', currency: 'CNY' },
})
const allModels = [base, second, paid, free]

/** 左侧候选列表里某个模型对应的行。用 data-model-id 而不是 class ——
 *  cn(tailwind-merge) 在禁用态会把 cursor-pointer 合并掉，靠 class 选会漏。 */
function candidateRow(id: string) {
  return document.querySelector(`[data-model-id="${id}"]`) as HTMLElement
}

describe('ModelsCompareModal — 模型体验侧入参（#335）', () => {
  it('多个 lockedIds 全部固定展示在「已选模型」区，且不出现在候选里', () => {
    render(
      <ModelsCompareModal
        isOpen
        onClose={vi.fn()}
        allModels={allModels}
        lockedIds={[base.id, second.id]}
        maxSelectable={3}
      />,
    )

    // 两个都锁定 → 左栏分组标题用复数文案「已选模型」，不是单数的「当前模型」
    expect(screen.getByText('已选模型')).toBeTruthy()

    // 锁定项不进候选列表；没锁的两个才在
    expect(candidateRow('a')).toBeNull()
    expect(candidateRow('b')).toBeNull()
    expect(candidateRow('c')).toBeTruthy()
    expect(candidateRow('d')).toBeTruthy()
  })

  it('零余额时付费候选禁用并标「余额不足」，点击不加入；免费候选不受影响', () => {
    render(
      <ModelsCompareModal isOpen onClose={vi.fn()} allModels={allModels} lockedIds={[base.id]} isBalanceZero />,
    )

    const paidRow = candidateRow('c')
    expect(paidRow.getAttribute('aria-disabled')).toBe('true')
    expect(within(paidRow).getByText('余额不足')).toBeTruthy()

    fireEvent.click(paidRow)
    expect(screen.getByText(/当前已选择/).textContent).toContain('1')

    const freeRow = candidateRow('d')
    expect(freeRow.getAttribute('aria-disabled')).toBe('false')
    fireEvent.click(freeRow)
    expect(screen.getByText(/当前已选择/).textContent).toContain('2')
  })

  it('maxSelectable 达上限后其余候选不可再勾选', () => {
    render(
      <ModelsCompareModal isOpen onClose={vi.fn()} allModels={allModels} lockedIds={[base.id]} maxSelectable={2} />,
    )

    fireEvent.click(candidateRow('b'))
    expect(screen.getByText(/当前已选择/).textContent).toContain('2')

    // 已达 2/2，再点第三个不生效
    fireEvent.click(candidateRow('c'))
    expect(screen.getByText(/当前已选择/).textContent).toContain('2')
  })

  it('onConfirmAdd 只回传本次新增的模型，不含锁定项', () => {
    const onConfirmAdd = vi.fn()
    render(
      <ModelsCompareModal
        isOpen
        onClose={vi.fn()}
        allModels={allModels}
        lockedIds={[base.id, second.id]}
        onConfirmAdd={onConfirmAdd}
      />,
    )

    fireEvent.click(candidateRow('c'))
    fireEvent.click(screen.getByText('确认对比'))

    expect(onConfirmAdd).toHaveBeenCalledTimes(1)
    expect(onConfirmAdd.mock.calls[0][0].map((m: CatalogModelItem) => m.id)).toEqual(['c'])
  })

  it('一个对手都没勾时「确认对比」禁用（原型 selectedIds.length === 0 口径）', () => {
    render(<ModelsCompareModal isOpen onClose={vi.fn()} allModels={allModels} lockedIds={[base.id]} />)

    const confirm = screen.getByText('确认对比') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    fireEvent.click(candidateRow('b'))
    expect(confirm.disabled).toBe(false)
  })

  it('锁定项自身余额不足时不放行（原型 !sourceAccessible 口径）', () => {
    render(
      <ModelsCompareModal isOpen onClose={vi.fn()} allModels={allModels} lockedIds={[base.id]} isBalanceZero />,
    )

    fireEvent.click(candidateRow('d'))
    expect((screen.getByText('确认对比') as HTMLButtonElement).disabled).toBe(true)
  })
})
