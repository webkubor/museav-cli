import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/lib/toast'

export interface VerificationCodeButtonHandle {
  /** 以编程方式触发发送（等价于用户点击），用于人机验证通过后自动发码；disabled/倒计时/发送中时空操作。 */
  trigger: () => void
}

interface Props {
  onSend: () => Promise<number | void>
  disabled?: boolean
}

export const VerificationCodeButton = forwardRef<VerificationCodeButtonHandle, Props>(function VerificationCodeButton({ onSend, disabled }, ref) {
  const { t } = useTranslation('account')
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const startCountdown = (seconds: number) => {
    setCountdown(seconds)
    timerRef.current = setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return n - 1
      })
    }, 1000)
  }

  const handleClick = async () => {
    if (loading || countdown > 0) return
    setLoading(true)
    try {
      // 倒计时固定 60s（需求方#592）：onSend 返回的 expires_in=300 是验证码有效期，
      // 不是重发间隔，直接拿来当倒计时会让用户干等 5 分钟才能重发。
      await onSend()
      startCountdown(60)
    } catch (e) {
      // ModelGoApiError.message 已是后端细分中文文案（发送过频/含倒计时秒数、手机号无效等）；
      // 前端护栏抛出的普通 Error（限流/校验）也在此原样展示。
      const msg = e instanceof Error ? e.message : t('account.auth.verificationCode.sendFailed')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useImperativeHandle(ref, () => ({
    trigger: () => { if (disabled) return; void handleClick() },
  }))

  const isCounting = countdown > 0

  return (
    <button
      type="button"
      className="auth-code-link-btn flex items-center justify-center gap-1.5"
      disabled={disabled || isCounting || loading}
      onClick={handleClick}
    >
      {loading && (
        <svg className="animate-spin h-3 w-3 text-current shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      <span>
        {loading
          ? t('account.auth.verificationCode.sending')
          : isCounting
            ? t('account.auth.verificationCode.sentCountdown', { seconds: countdown })
            : t('account.auth.verificationCode.send')}
      </span>
    </button>
  )
})
