/**
 * 创建成功弹窗的提示文案，必须和「后续还能不能复制」这个真实能力一致。
 *
 * prd#1071：线上那句写着「关闭后将无法再查看完整密钥」，而 ApiKeyDetailDrawer
 * 早就有 copyFullKey（走 revealApiKey 取回明文），列表里能复制完整 Key ——
 * 文案没跟上功能，在吓唬用户。这类错不报错、不崩溃，只让人以为必须立刻存下来，
 * 甚至为了「保险」把密钥抄到不安全的地方。
 *
 * 只有两种情况确实复制不了，两条文案都已存在、各自说明了原因：
 *   · copyUnavailableLegacy —— 创建于「支持复制」功能上线之前的旧密钥
 *   · copyUnavailableInactive —— 已撤销或过期
 * 这两种都**不是**刚创建的新密钥，所以创建弹窗不该说「无法再查看」。
 */
import { describe, it, expect } from 'vitest'
import zh from '@/locales/zh/apiKeys.json'
import en from '@/locales/en/apiKeys.json'

describe('createdModal.desc 与复制能力的一致性（prd#1071）', () => {
  it('中文不再说「无法再查看」——列表里能复制完整 Key', () => {
    const desc = zh.apiKeys.createdModal.desc
    expect(desc).not.toMatch(/无法再查看|不可找回|仅显示一次|只显示一次/)
  })

  it('英文同理', () => {
    const desc = en.apiKeys.createdModal.desc
    expect(desc.toLowerCase()).not.toMatch(/cannot view|only once|won't be able|will not be able/)
  })

  it('中英都要告诉用户「稍后还能复制」，否则等于没修', () => {
    // 只删掉吓人的那半句不够 —— 用户仍然不知道后面还能不能拿到，
    // 默认假设会是「拿不到」，行为和改之前一样。
    expect(zh.apiKeys.createdModal.desc).toMatch(/再次复制|仍可复制|稍后/)
    expect(en.apiKeys.createdModal.desc.toLowerCase()).toMatch(/again later|later from|copy it again/)
  })

  it('“确实不能复制”的两种情况仍各自有文案 —— 它们才是该说无法找回的地方', () => {
    expect(zh.apiKeys.table.copyUnavailableLegacy).toMatch(/不可找回/)
    expect(zh.apiKeys.table.copyUnavailableInactive).toMatch(/无法复制/)
  })
})
