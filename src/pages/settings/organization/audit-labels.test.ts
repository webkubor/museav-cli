import { beforeAll, describe, expect, it } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { auditActionLabel } from './audit-labels'

// qa#411：api_key.revealed/issued 之前漏在 VERB_LABEL 词表外，未命中兜底直接吐原始 key
// （生产 Audit Logs 里裸露成 "api_key.revealed"）。这里用真实 i18n 实例（不是 mock）
// 断言译文，避免"key 存在即通过"这种测不出裸 key 回归的假绿。
// enterprise 是懒加载 namespace（不在 i18n.ts 的 coreLocaleNamespaces 里），真实页面靠
// withLocaleNamespaces 包装器加载；测试里没有那层包装，得手动 loadLocaleNamespaces。
describe('auditActionLabel', () => {
  beforeAll(async () => {
    await loadLocaleNamespaces(['enterprise'], 'en')
    await loadLocaleNamespaces(['enterprise'], 'zh')
  })

  it('api_key 域四个动词都有专属英文措辞，不吐原始 key', async () => {
    await i18n.changeLanguage('en')
    expect(auditActionLabel('api_key.issued', i18n.t.bind(i18n))).toBe('Created API Key')
    expect(auditActionLabel('api_key.updated', i18n.t.bind(i18n))).toBe('Updated API Key')
    expect(auditActionLabel('api_key.revoked', i18n.t.bind(i18n))).toBe('Revoked API Key')
    expect(auditActionLabel('api_key.revealed', i18n.t.bind(i18n))).toBe('Revealed API Key')
  })

  it('api_key 域四个动词都有专属中文措辞', async () => {
    await i18n.changeLanguage('zh')
    expect(auditActionLabel('api_key.issued', i18n.t.bind(i18n))).toBe('创建 API Key')
    expect(auditActionLabel('api_key.revealed', i18n.t.bind(i18n))).toBe('查看 API Key')
  })

  it('未知 <域>.<动作> 枚举 key 退到通用兜底文案，不直接吐原始 key', async () => {
    await i18n.changeLanguage('en')
    const label = auditActionLabel('some_new_domain.some_new_verb', i18n.t.bind(i18n))
    expect(label).not.toBe('some_new_domain.some_new_verb')
    expect(label).toBe('Other action')
  })

  it('域已知但动词未知，同样退到通用兜底而非拼出半截原始动词', async () => {
    await i18n.changeLanguage('en')
    const label = auditActionLabel('tenant.some_unmapped_verb', i18n.t.bind(i18n))
    expect(label).toBe('Other action')
    expect(label).not.toContain('some_unmapped_verb')
  })

  it('域+动作都已知时正常组合', async () => {
    await i18n.changeLanguage('en')
    expect(auditActionLabel('guardrail.created', i18n.t.bind(i18n))).toBe('Created guardrail')
  })

  it('空 action 返回占位符', () => {
    expect(auditActionLabel('', i18n.t.bind(i18n))).toBe('—')
  })
})
