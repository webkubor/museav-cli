import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useMarket } from '@/hooks/useMarket'
import { getCaptchaParam } from '@/lib/aliyun-captcha'
import { sendSmsCode } from '@/services/auth'
import { bindPhone } from '@/services/account'
import { appToast } from '@/lib/app-toast'
import { RequiredPhoneBindingDialog } from '@/components/auth/RequiredPhoneBindingDialog'

/**
 * 国内环境强制绑定手机号守卫（需求 #366）。
 * 手机号在国内是账号唯一性校验的必要项——微信/快捷登录进来可能没手机号，
 * 这里在已登录 + 国内环境 + account.phone 为空时弹出不可跳过的绑定弹窗，绑定成功才放行。
 * 海外环境不强制。挂在 DashboardLayout（鉴权区）内。
 */
export function PhoneBindingGuard() {
  const account = useAuthStore((s) => s.account)
  const market = useMarket()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  // 仅国内环境 + 已登录 + 无手机号 → 强制补绑
  const open = market === 'domestic' && !!account && !account.phone

  async function handleSendCode() {
    try {
      const captchaParam = await getCaptchaParam()
      const resp = await sendSmsCode(phone, captchaParam)
      return resp.expires_in
    } catch (err) {
      appToast.requestError(err, '验证码发送失败')
      throw err // 抛出让发码按钮不启动倒计时
    }
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      await bindPhone(phone, code)
      // 本地回填手机号 → open 变 false，弹窗自动关闭放行（无需重拉 session）
      if (account) useAuthStore.setState({ account: { ...account, phone } })
      appToast.success('手机号绑定成功')
    } catch (err) {
      appToast.requestError(err, '绑定失败')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <RequiredPhoneBindingDialog
      open={open}
      phone={phone}
      code={code}
      loading={loading}
      onPhoneChange={setPhone}
      onCodeChange={setCode}
      onSendCode={handleSendCode}
      onSubmit={handleSubmit}
    />
  )
}
