/**
 * 智能助手的悬浮入口（智能客服 PRD v0.1 §7.2）。
 *
 * PRD 要的是「右下角 ModelGo 圆形入口 + 在线状态点」。这里用 ai-orb 实现 ——
 * 它本身就是一颗会表态的状态球，六个状态正好覆盖 PRD 的服务模式，比一个三色
 * 小圆点能表达的多：
 *
 *   idle     在线（初始空态 / 智能问答）
 *   thinking 知识检索或工具查询中（§7.4「处理中状态」）
 *   working  人工排队 / 连接中（§7.6）
 *   asking   助手问了话，卡在用户这边
 *   done     有未读，配 unseen 角标（§7.9 未读标记）
 *   error    系统失败（§8 降级）
 *
 * 配色不用 ai-orb 的内置主题（0.1.0 也还没有 theme 选项），而是用 CSS 变量从
 * --brand-base 派生五个色阶。这样国内站 / 海外站的品牌色差异、明暗主题切换，
 * orb 都自动跟着走，不需要在这里维护第二份色值。
 */
import { useEffect, useRef } from 'react'
import { AgentOrb, type OrbState } from 'ai-orb'

export type { OrbState }

interface AssistantOrbProps {
  state: OrbState
  /** 未读数，仅 state='done' 且 >0 时显示角标 */
  unseen?: number
  size?: number
  /** 无障碍文案，按 PRD §7.2「入口必须具备可访问名称」提供中文 */
  labels?: Partial<Record<OrbState, string>>
}

export function AssistantOrb({ state, unseen = 0, size = 40, labels }: AssistantOrbProps) {
  const hostRef = useRef<HTMLSpanElement>(null)
  const orbRef = useRef<AgentOrb | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    // 不接 onClick：orb 渲染的是 button，点击会正常冒泡到外层可拖拽容器，
    // 由那里统一判断「这是点击还是拖拽」。在这里再接一次会触发两遍。
    const orb = new AgentOrb(host, { size, labels })
    orbRef.current = orb
    return () => {
      orb.destroy()
      orbRef.current = null
    }
    // 只在挂载时建实例；state / unseen 的变化走下面的实例属性赋值，不重建 DOM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    orbRef.current?.set(state, unseen)
  }, [state, unseen])

  return <span className="mg-assistant-orb" ref={hostRef} />
}
