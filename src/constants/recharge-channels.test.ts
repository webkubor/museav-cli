import { describe, expect, it } from 'vitest'
import { getRechargeOrderChannelDisplayName } from './recharge-channels'

describe('getRechargeOrderChannelDisplayName', () => {
  it('uses the explicit backend label first', () => {
    expect(getRechargeOrderChannelDisplayName({
      channel: 'manual',
      source: 'reward_balance',
      channel_label: '奖励余额',
    })).toBe('奖励余额')
  })

  it('falls back to channel/source labels for manual recharge records', () => {
    expect(getRechargeOrderChannelDisplayName({ channel: 'manual', source: 'reward_balance' })).toBe('奖励余额')
    expect(getRechargeOrderChannelDisplayName({ channel: 'manual', source: 'admin_adjust' })).toBe('管理员扣减')
    expect(getRechargeOrderChannelDisplayName({ channel: 'manual', source: 'admin_credit' })).toBe('管理员充值')
  })

  it('falls back to channel labels for payment recharge records', () => {
    expect(getRechargeOrderChannelDisplayName({ channel: 'alipay' })).toBe('支付宝')
    expect(getRechargeOrderChannelDisplayName({ channel: 'wechat' })).toBe('微信')
    expect(getRechargeOrderChannelDisplayName({ channel: 'stripe' })).toBe('Stripe')
  })
})
