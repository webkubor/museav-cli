/**
 * 账号联系方式脱敏（shared/modelgo_prd#837，对齐原型 App.tsx maskPhone / maskEmail）。
 * 基本资料页的手机号 / 邮箱字段本体只做脱敏只读展示，换绑弹窗里的「验证码将发送至 …」
 * 也用同一套口径，避免同一个号码在页面上出现两种打码格式。
 */

/** 去掉非数字与国家码前缀 86，只留 11 位大陆手机号；非 11 位原样返回给校验层判无效 */
export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '').replace(/^86(?=\d{11}$)/, '')
}

/** +86 188****2332：保留前 3 后 4，中间固定 4 个星号；位数不足 7 位时不打码原样返回 */
export function maskPhone(phone: string) {
  const digits = normalizePhone(phone)
  if (digits.length < 7) return phone
  return `+86 ${digits.slice(0, 3)}****${digits.slice(-4)}`
}

/** 1***@1.com：本地部分保留前 2 位（不足 2 位保留全部），星号至少 3 个；不是邮箱格式原样返回 */
export function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

export const PHONE_RE = /^1[3-9]\d{9}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const CODE_RE = /^\d{6}$/
