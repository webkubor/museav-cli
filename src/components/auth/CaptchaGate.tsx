/**
 * 登录/注册表单里的可见安全验证条（图形认证 alicaptcha 专用）。
 * 放在输入区与提交按钮之间：未验证时点击调起弹窗挑战；通过后展示已验证态并把
 * 四元组 JSON 通过 onChange 交给表单（作为 captcha_verify_param 提交）。
 *
 * 降级即隐身：配置未启用 / provider 非 alicaptcha / ct4.js 不可用 → 组件不渲染
 * 且 onChange(null)、onAvailability(false)，表单照常提交（后端 fail-open）。
 */
import { useEffect, useRef, useState } from 'react'
import { LuRotateCw, LuShieldCheck } from 'react-icons/lu'
import { createAlicaptchaSession, type AlicaptchaSession } from '@/lib/alicaptcha'
import { getMarketDefaultLang } from '@/lib/market'
import { useLangStore } from '@/store/use-brand-store'

export interface CaptchaGateHandle {
  /** 表单提交时若尚未验证，调起弹窗。 */
  open: () => void
  /** 提交失败（如 40025）后重置为未验证态。 */
  reset: () => void
}

interface CaptchaGateProps {
  /** 验证通过 → 四元组 JSON；重置/不可用 → null。 */
  onChange: (param: string | null) => void
  /** 验证条是否生效（生效=提交前必须先通过；不生效=按未启用放行）。 */
  onAvailability?: (active: boolean) => void
  /** 由父组件持有以便在提交路径上调起/重置。 */
  handleRef?: (handle: CaptchaGateHandle | null) => void
}

export function CaptchaGate({ onChange, onAvailability, handleRef }: CaptchaGateProps) {
  const market = useLangStore((s) => s.market)
  const [state, setState] = useState<'hidden' | 'idle' | 'verified'>('hidden')
  const sessionRef = useRef<AlicaptchaSession | null>(null)

  useEffect(() => {
    let disposed = false
    const lang = getMarketDefaultLang(market) === 'zh' ? 'zh' : 'en'
    void createAlicaptchaSession(lang, {
      onVerified: (param) => {
        if (disposed) return
        setState('verified')
        onChange(param)
      },
      onUnavailable: () => {
        if (disposed) return
        setState('hidden')
        onChange(null)
        onAvailability?.(false)
      },
    }).then((session) => {
      if (disposed) {
        session?.destroy()
        return
      }
      sessionRef.current = session
      if (session) {
        setState('idle')
        onAvailability?.(true)
        handleRef?.({
          open: () => session.show(),
          reset: () => {
            session.reset()
            setState('idle')
            onChange(null)
          },
        })
      } else {
        onAvailability?.(false)
      }
    })
    return () => {
      disposed = true
      handleRef?.(null)
      sessionRef.current?.destroy()
      sessionRef.current = null
    }
    // market 切换语言时重建会话；onChange 等回调由父组件保证引用稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market])

  if (state === 'hidden') return null

  if (state === 'verified') {
    return (
      <div className="auth-captcha-gate is-verified" role="status">
        <LuShieldCheck size={16} aria-hidden />
        <span>已完成安全验证</span>
        <button
          type="button"
          className="auth-captcha-gate-reset"
          onClick={() => {
            sessionRef.current?.reset()
            setState('idle')
            onChange(null)
          }}
          aria-label="重新验证"
        >
          <LuRotateCw size={13} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="auth-captcha-gate"
      onClick={() => sessionRef.current?.show()}
    >
      <LuShieldCheck size={16} aria-hidden />
      <span>点击完成安全验证</span>
    </button>
  )
}
