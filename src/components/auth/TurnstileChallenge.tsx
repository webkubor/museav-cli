import { useEffect, useRef, useState } from 'react'

type TurnstileStatus = 'loading' | 'ready' | 'expired' | 'error'

interface TurnstileChallengeProps {
  siteKey: string
  onToken: (token: string) => void
}

type TurnstileRenderOptions = {
  sitekey: string
  theme?: 'auto' | 'light' | 'dark'
  callback?: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  'timeout-callback'?: () => void
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
    }
  }
}

const scriptID = 'cf-turnstile-api'
let scriptPromise: Promise<void> | null = null

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(scriptID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('turnstile load failed')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = scriptID
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('turnstile load failed'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function TurnstileChallenge({ siteKey, onToken }: TurnstileChallengeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetRef = useRef<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>('loading')

  useEffect(() => {
    if (!siteKey || !containerRef.current) return
    let disposed = false

    loadTurnstileScript()
      .then(() => {
        if (disposed || !containerRef.current || !window.turnstile) return
        widgetRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (token) => {
            setStatus('ready')
            onToken(token)
          },
          'expired-callback': () => {
            setStatus('expired')
            onToken('')
          },
          'error-callback': () => {
            setStatus('error')
            onToken('')
          },
          'timeout-callback': () => {
            setStatus('expired')
            onToken('')
          },
        })
      })
      .catch(() => {
        if (!disposed) setStatus('error')
      })

    return () => {
      disposed = true
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current)
      }
      widgetRef.current = null
    }
  }, [onToken, siteKey])

  return (
    <div className="auth-turnstile">
      <div ref={containerRef} />
      {status === 'expired' && <p className="auth-error-message">验证已过期，请重新完成验证</p>}
      {status === 'error' && <p className="auth-error-message">验证加载失败，请稍后重试</p>}
    </div>
  )
}
