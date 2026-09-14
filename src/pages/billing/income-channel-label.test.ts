/**
 * 入账记录「渠道」列的文案表。
 *
 * 渲染是 `t(\`billing.income.channels.${code}\`, { defaultValue: code })` —— 缺 key 不抛错、
 * 不报警，直接把后端的英文码原样摆进表格。实测就这么露过一次：后端把新手奖励拆成独立
 * 渠道 onboarding_reward 之后，账单里那一行显示的是「onboarding_reward」而不是中文。
 * 编译器和 eslint 都看不见这种缺失，只能靠这条钉住「码 → 文案」。
 */

import { describe, expect, it } from 'vitest'
import zhBilling from '@/locales/zh/billing.json'
import enBilling from '@/locales/en/billing.json'

const zhChannels: Record<string, string> = zhBilling.billing.income.channels
const enChannels: Record<string, string> = enBilling.billing.income.channels

/** 后端 income-records 会回的渠道码（支付渠道 + billing 的赠金来源） */
const CHANNEL_CODES = ['alipay', 'admin', 'promo', 'activity', 'referral', 'onboarding_reward']

describe('入账记录渠道文案', () => {
  it.each(CHANNEL_CODES)('%s 中英都有文案，不会把英文码原样显示', (code) => {
    expect(zhChannels[code]).toBeTruthy()
    expect(enChannels[code]).toBeTruthy()
    expect(zhChannels[code]).not.toBe(code)
    expect(enChannels[code]).not.toBe(code)
  })

  it('中英 key 集合一致，不会单边补文案', () => {
    expect(Object.keys(zhChannels).sort()).toEqual(Object.keys(enChannels).sort())
  })

  it('新手奖励渠道按验收口径固定展示「新手任务奖励」（prd#943 item-5）', () => {
    expect(zhChannels.onboarding_reward).toBe('新手任务奖励')
  })
})
