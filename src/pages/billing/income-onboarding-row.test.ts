/**
 * 新手奖励那一行在账单入账记录里的两件事：**归哪个桶** 与 **「查看赠金」能不能定位到**。
 *
 * 两条都在测试环境上翻过车，且都不报错、只是显示不对，编译器与 eslint 一律看不见：
 *   · billing 把新手奖励拆成 canonical 来源码 `onboarding_reward`（prd#943 item-5）。
 *     前端合成回落按来源做模糊正则分类，字面里的 "reward" 让它归进 reward 桶，
 *     而服务端这笔钱记在 **gift 桶**（income-records 返回 bucket=gift）。结果是账单行写
 *     「奖励余额」，同页余额卡片上奖励余额却是 ¥0，自相矛盾。
 *   · 「查看赠金」的定位原本写死「行 id 配回执 transaction_id」，换个数据源就失配 ——
 *     跳过去了但没有任何高亮，页面不报错、控制台无线索。
 */

import { describe, expect, it } from 'vitest'
import { giftChannelCode, giftRecordType } from '@/services/billing'
import type { IncomeRecord } from '@/services/billing'
import zhBilling from '@/locales/zh/billing.json'
import { isHighlighted } from './income-highlight'

const zhChannels = zhBilling.billing.income.channels as Record<string, string>

describe('赠送来源 → 类型与渠道', () => {
  it('onboarding_reward 归 gift 桶，不被「reward」字面骗进 reward 桶', () => {
    expect(giftRecordType('onboarding_reward')).toBe('gift')
  })

  /**
   * 只断言 `giftChannelCode('onboarding_reward') === 'onboarding_reward'` 是自证：
   * 函数末尾本来就 `return source`，删掉 canonical 表这条也照样绿。真正要钉死的是
   * **产出的码必须有文案** —— 渠道列走 t(`billing.income.channels.${code}`)，
   * 没配 key 时 defaultValue 把裸码 `onboarding_reward` 直接印在账单上。
   */
  it('新手奖励产出的渠道码在 zh 文案里有对应条目，不会把裸码印到账单上', () => {
    const code = giftChannelCode('onboarding_reward', giftRecordType('onboarding_reward'))
    expect(zhChannels[code]).toBeTruthy()
    expect(zhChannels[code]).not.toBe(code)
  })

  it('来源码大小写/前后空格不同也照样命中 canonical 表', () => {
    expect(giftRecordType(' Onboarding_Reward ')).toBe('gift')
    expect(giftChannelCode(' Onboarding_Reward ', 'gift')).toBe('onboarding_reward')
  })

  it('历史模糊来源仍按关键字兜底，没被 canonical 表改掉', () => {
    expect(giftRecordType('推荐计划返佣')).toBe('reward')
    expect(giftChannelCode('推荐计划返佣', 'reward')).toBe('referral')
    expect(giftRecordType('注册活动赠送')).toBe('gift')
    expect(giftChannelCode('注册活动赠送', 'gift')).toBe('activity')
    expect(giftChannelCode('优惠码兑换', 'gift')).toBe('promo')
  })
})

function row(id: string, recordRef: string): IncomeRecord {
  return {
    id,
    type: 'gift',
    channel: 'onboarding_reward',
    record_ref: recordRef,
    balance_bucket: 'gift',
    amount: { amount: '10.00', currency: 'CNY' },
    status: 'completed',
    created_at: '2026-09-14T04:13:26Z',
  }
}

describe('「查看赠金」定位哪一行', () => {
  const receipt = { transactionId: 'txn-abc', recordRef: 'gift-1' }

  it('合成回落形态：行 id 与 record_ref 都是赠金流水 id', () => {
    expect(isHighlighted(row('gift-1', 'gift-1'), receipt)).toBe(true)
  })

  it('真接口形态：行 record_ref 是展示编号 redm_，靠 id 对上', () => {
    expect(isHighlighted(row('gift-1', 'redm_20260914_e4b51bfe'), receipt)).toBe(true)
  })

  it('回执只带展示编号时，靠 record_ref 对上', () => {
    const r = { transactionId: '', recordRef: 'redm_20260914_e4b51bfe' }
    expect(isHighlighted(row('gift-1', 'redm_20260914_e4b51bfe'), r)).toBe(true)
  })

  it('回执带的是流水 id、行 id 是别的记录 → 不高亮', () => {
    expect(isHighlighted(row('gift-2', 'redm_20260914_00000000'), receipt)).toBe(false)
  })

  it('空回执字段不能把空 id 的行误判成命中', () => {
    expect(isHighlighted(row('', ''), { transactionId: '', recordRef: '' })).toBe(false)
    expect(isHighlighted(row('gift-1', 'gift-1'), null)).toBe(false)
  })
})
