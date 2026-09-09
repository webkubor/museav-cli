import { describe, expect, it } from 'vitest'
import { maskEmail, maskPhone, normalizePhone } from './contact-mask'

describe('contact-mask（#837 脱敏口径对齐原型）', () => {
  it('手机号保留前 3 后 4，中间 4 个星号，带 +86 前缀', () => {
    expect(maskPhone('18812342332')).toBe('+86 188****2332')
    expect(maskPhone('+86 18812342332')).toBe('+86 188****2332')
    expect(maskPhone('8618812342332')).toBe('+86 188****2332')
  })

  it('位数不足 7 位不打码，原样返回给校验层', () => {
    expect(maskPhone('123')).toBe('123')
  })

  it('normalizePhone 只在剩余恰好 11 位时剥 86 前缀，避免把 86 开头的号码剥坏', () => {
    expect(normalizePhone('+86 188-1234-2332')).toBe('18812342332')
    expect(normalizePhone('18812342332')).toBe('18812342332')
  })

  it('邮箱本地部分保留前 2 位、星号至少 3 个', () => {
    expect(maskEmail('1@1.com')).toBe('1***@1.com')
    expect(maskEmail('louie@paylinker.com')).toBe('lo***@paylinker.com')
    expect(maskEmail('abcdefgh@x.io')).toBe('ab******@x.io')
  })

  it('不是邮箱格式原样返回', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email')
  })
})
