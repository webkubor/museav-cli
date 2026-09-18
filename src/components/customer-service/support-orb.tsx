/** ai-orb 的 React 生命周期适配；全站客服入口与状态头像共用，配色由控制台 CSS 接管。 */
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentOrb, STATES, type OrbState } from 'ai-orb'
import './support-orb-theme.css'

interface SupportOrbProps {
  state: OrbState
  unseen?: number
  expanded?: boolean
  label?: string
  onClick?: (event: MouseEvent) => void
}

/** 交互实例使用库的原生按钮；被动头像不进入键盘或读屏顺序。 */
export function SupportOrb({ state, unseen = 0, expanded, label, onClick }: SupportOrbProps) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLSpanElement>(null)
  const instanceRef = useRef<AgentOrb | null>(null)
  const clickRef = useRef(onClick)
  const interactive = Boolean(onClick)
  const labels = useMemo(() => Object.fromEntries(
    STATES.map((key) => [key, t(`common.customerService.orb.${key}`)]),
  ), [t])

  useEffect(() => { clickRef.current = onClick }, [onClick])
  useEffect(() => {
    if (!hostRef.current) return
    const orb = new AgentOrb(hostRef.current, {
      size: interactive ? 56 : 40, follow: interactive, labels,
      onClick: (event) => clickRef.current?.(event),
    })
    if (!interactive) orb.el.tabIndex = -1
    instanceRef.current = orb
    return () => { orb.destroy(); instanceRef.current = null }
  }, [interactive, labels])

  useEffect(() => {
    const orb = instanceRef.current
    if (!orb) return
    orb.set(state, unseen)
    if (label) { orb.el.setAttribute('aria-label', label); orb.el.title = label }
    if (interactive) {
      orb.el.setAttribute('aria-expanded', String(Boolean(expanded)))
      orb.el.setAttribute('aria-haspopup', 'dialog')
    }
  }, [state, unseen, label, expanded, interactive, labels])

  return <span ref={hostRef} className="cs-orb" aria-hidden={interactive ? undefined : true} inert={!interactive} />
}
