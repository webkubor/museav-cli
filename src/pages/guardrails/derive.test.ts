import { describe, expect, it } from 'vitest'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import { activeMemberBudgetGuardrail, guardrailIncludesMember } from './derive'

// 契约镜像自后端护栏列表（qa#378 未交付显式 scope/kind，前端由 metadata 派生）。
// 个人护栏是「人」的预算策略：Key 详情按 Key 责任人 account_id 匹配「生效(active)」的个人护栏展示，
// 与提示词注入无关（需求方#234/#241 的回归点）。
function g(over: Partial<Record<string, unknown>>): GuardrailDetail {
  return {
    id: 'grd_x',
    name: 'g',
    status: 'active',
    is_default: false,
    metadata: {},
    assignments: [],
    budget_policies: [],
    ...over,
  } as unknown as GuardrailDetail
}

const ME = '01me'
const OTHER = '01other'

describe('guardrailIncludesMember', () => {
  it('匹配 assignments 里的 account_id', () => {
    const rec = g({ assignments: [{ subject_type: 'member', account_id: ME }] })
    expect(guardrailIncludesMember(rec, ME)).toBe(true)
    expect(guardrailIncludesMember(rec, OTHER)).toBe(false)
  })

  it('兼容旧数据 metadata.members', () => {
    const rec = g({ metadata: { members: [ME] } })
    expect(guardrailIncludesMember(rec, ME)).toBe(true)
  })

  it('空 accountId 恒 false（不误匹配未确定责任人）', () => {
    expect(guardrailIncludesMember(g({ metadata: { members: [ME] } }), '')).toBe(false)
  })
})

describe('activeMemberBudgetGuardrail', () => {
  const regular = g({ id: 'grd_reg', name: '个人护栏3', metadata: { scope: 'member', kind: 'regular', members: [ME] } })
  const boost = g({ id: 'grd_boost', name: '提额', metadata: { scope: 'member', kind: 'boost', members: [ME] } })

  it('返回该责任人绑定的 active 个人护栏', () => {
    expect(activeMemberBudgetGuardrail([regular], ME)?.name).toBe('个人护栏3')
  })

  it('提额(boost)优先于常规(regular)', () => {
    expect(activeMemberBudgetGuardrail([regular, boost], ME)?.id).toBe('grd_boost')
  })

  it('停用(inactive)的个人护栏不参与 → null（回退全局默认个人预算）', () => {
    const inactive = g({ status: 'inactive', metadata: { scope: 'member', kind: 'regular', members: [ME] } })
    expect(activeMemberBudgetGuardrail([inactive], ME)).toBeNull()
  })

  it('绑定其他成员的个人护栏不算数 → null', () => {
    expect(activeMemberBudgetGuardrail([regular], OTHER)).toBeNull()
  })

  it('非 member 作用域（全局/Key 护栏）忽略 → null', () => {
    const globalG = g({ is_default: true, metadata: { scope: 'global' } })
    const keyG = g({ metadata: { scope: 'key', kind: 'regular', api_keys: ['ak_1'] } })
    expect(activeMemberBudgetGuardrail([globalG, keyG], ME)).toBeNull()
  })
})

// prd#239 打回的「关闭护栏不参与下调校验」回归测试随本地比对函数一并移除：
// 跨护栏预算比对（含启停过滤、月度折算、槽位映射）已由后端权威校验
// （permissions assertBudgetComparisonRules + 单测），前端不再持有该逻辑。
