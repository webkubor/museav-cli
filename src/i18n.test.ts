/**
 * 国际化文档语言属性测试
 * 路由：全局
 * API：无
 */

import { afterAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'

afterAll(async () => {
  await i18n.changeLanguage('zh')
})

describe('i18n document language', () => {
  it('中文界面同步 html lang=zh-CN', async () => {
    await i18n.changeLanguage('zh')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('英文界面同步 html lang=en', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
