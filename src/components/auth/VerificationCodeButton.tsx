import { useState, useEffect, useRef } from 'react'
import { Button } from '@douyinfe/semi-ui'
import { toast } from '@/lib/toast'

interface Props {
  onSend: () => Promise<number | void>
  disabled?: boolean
}

export function VerificationCodeButton({ onSend, disabled }: Props) {
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
    setLoading(true)
    try {
      const expiresIn = await onSend()
      startCountdown(typeof expiresIn === 'number' ? expiresIn : 60)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '发送失败，请稍后重试'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const isCounting = countdown > 0

  return (
    <Button
      loading={loading}
      disabled={disabled || isCounting}
      onClick={handleClick}
      style={{
        flexShrink: 0,
        height: '40px',
        borderRadius: '8px',
        fontSize: '13px',
        whiteSpace: 'nowrap',
        minWidth: '96px',
      }}
    >
      {isCounting ? `${countdown}s 后重试` : '发送验证码'}
    </Button>
  )
}
