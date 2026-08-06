import { describe, expect, it, afterEach } from 'vitest'
import i18n from '@/i18n'
import { injectHeaders } from '@/lib/request-headers'

// Accept-Language 必须跟 i18n.language（界面实际显示的语言）保持同一个真源，不能自己另外
// 探测浏览器语言——否则会出现"页面显示中文，却告诉后端 en-US"这种真实报过的回归。
describe('injectHeaders — Accept-Language', () => {
  afterEach(async () => {
    await i18n.changeLanguage('zh')
  })

  it('跟随 i18n.language=zh，不受浏览器语言影响', async () => {
    await i18n.changeLanguage('zh')
    const request = new Request('https://api.example.test/x')
    injectHeaders(request)
    expect(request.headers.get('Accept-Language')).toBe('zh-CN')
  })

  it('跟随 i18n.language=en，不受浏览器语言影响', async () => {
    await i18n.changeLanguage('en')
    const request = new Request('https://api.example.test/x')
    injectHeaders(request)
    expect(request.headers.get('Accept-Language')).toBe('en-US')
  })
})
