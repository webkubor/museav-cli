/**
 * 返佣档位名的界面语言映射（国际站翻译适配 prd#1098）。
 *
 * 锚点：英文站 Referral Program 的「Commission Tiers」整列打中文（普通/核心/战略伙伴）——
 * 档位名是后端 DB 配置、接口只给中文 name，前端此前直接渲染原值。
 * 本文件钉住三件事：英文站翻译、中文站不变、未收录档位原样透出（不许变空）。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import i18n, { loadLocaleNamespaces } from '@/i18n'
import { tierDisplayName } from './tier-label'

afterAll(async () => { await i18n.changeLanguage('zh') })

describe('tierDisplayName', () => {
  beforeEach(async () => {
    await loadLocaleNamespaces(['billing'], 'zh')
    await loadLocaleNamespaces(['billing'], 'en')
  })

  it('英文界面把已知档位名翻成英文', async () => {
    await i18n.changeLanguage('en')
    expect(tierDisplayName('普通伙伴')).toBe('Standard Partner')
    expect(tierDisplayName('成长伙伴')).toBe('Growth Partner')
    expect(tierDisplayName('核心伙伴')).toBe('Core Partner')
    expect(tierDisplayName('战略伙伴')).toBe('Strategic Partner')
  })

  it('中文界面保持后端原值（语言包里的中文与接口一致）', async () => {
    await i18n.changeLanguage('zh')
    for (const name of ['普通伙伴', '成长伙伴', '核心伙伴', '战略伙伴']) {
      expect(tierDisplayName(name)).toBe(name)
    }
  })

  it('运营新配的未收录档位原样透出，不变空也不打 raw key', async () => {
    await i18n.changeLanguage('en')
    expect(tierDisplayName('至尊伙伴')).toBe('至尊伙伴')
    expect(tierDisplayName('Platinum Partner')).toBe('Platinum Partner')
  })

  it('空值 / 空白名返回空串（调用方自己决定兜底文案）', () => {
    expect(tierDisplayName(undefined)).toBe('')
    expect(tierDisplayName(null)).toBe('')
    expect(tierDisplayName('  ')).toBe('')
  })
})
