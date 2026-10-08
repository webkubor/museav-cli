/**
 * 服务记录状态徽标文案（prd46#1199）：列表/详情/回执一律显示 PRD §7.6.1 规范状态名，
 * 不能透传后端在 pending 态下发的描述文案（「等待客服受理」/「排队中 · 前方 N 人」）。
 * 「已结束」只是筛选页签名，终态规范名是已解决/已取消（PRD §7.9）。
 */
import { describe, expect, it } from 'vitest'
import zh from '@/locales/zh/common.json'
import en from '@/locales/en/common.json'
import { supportStatusKeyOf, ticketStatusTextOf } from '@/interfaces/support'

const resolve = (bundle: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], bundle)

const makeT = (bundle: unknown) => (key: string) => {
  const value = resolve(bundle, key)
  return typeof value === 'string' ? value : key
}
const zhT = makeT(zh)
const enT = makeT(en)

describe('ticketStatusTextOf', () => {
  it.each([
    ['pending', '待处理', 'Pending'],
    ['processing', '处理中', 'Processing'],
    ['resolved', '已解决', 'Resolved'],
    ['cancelled', '已取消', 'Cancelled'],
  ] as const)('%s → 规范名', (status, zhText, enText) => {
    expect(ticketStatusTextOf({ status, status_label: '等待客服受理' }, zhT)).toBe(zhText)
    expect(ticketStatusTextOf({ status, status_label: '等待客服受理' }, enT)).toBe(enText)
  })

  it('pending 不透传后端描述文案', () => {
    expect(ticketStatusTextOf({ status: 'pending', status_label: '排队中 · 前方 0 人' }, zhT)).toBe('待处理')
    expect(ticketStatusTextOf({ status: 'pending', status_label: '待客服联系' }, zhT)).toBe('待处理')
  })

  it('机器码未识别时才回退 status_label', () => {
    expect(ticketStatusTextOf({ status: 'weird', status_label: '自定义' }, zhT)).toBe('自定义')
    expect(ticketStatusTextOf({ status: '', status_label: '' }, zhT)).toBe('')
  })
})

describe('supportStatusKeyOf', () => {
  it('只认四个规范机器码', () => {
    expect(supportStatusKeyOf('pending')).toBe('pending')
    expect(supportStatusKeyOf('resolved')).toBe('resolved')
    expect(supportStatusKeyOf('weird')).toBeUndefined()
    expect(supportStatusKeyOf(undefined)).toBeUndefined()
  })
})
