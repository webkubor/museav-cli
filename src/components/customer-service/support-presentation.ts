/**
 * 把客服流程的真实状态投影成 ai-orb 的表情。
 *
 * 业务模式仍由 support-machine 唯一控制，这里只读不写 —— orb 是表现层，
 * 不许反过来驱动状态机，否则「球显示什么」和「实际在做什么」会各说各话。
 *
 * 不用计时器伪造处理阶段：球只反映真实发生的事（在请求 / 在排队 / 出错），
 * 没有「假装想了 2 秒」这种动画。人工坐席有独立身份，不套 AI 表情。
 */
import type { OrbState } from 'ai-orb'
import type { useSupport } from './use-support'

export type SupportModel = ReturnType<typeof useSupport>

export function supportOrbState(support: SupportModel): OrbState {
  if (support.isAsking) return 'thinking'
  // 排队 / 接通中 / 正在提交反馈都算「在干活」
  if (support.feedbackSubmitting || support.mode.kind === 'queuing' || support.mode.kind === 'connecting') return 'working'
  // 人工会话中：球回到静默，别用 AI 表情去演一个真人
  if (support.mode.kind === 'human') return 'idle'
  // 没有 'error' 态：当前 useSupport 不暴露错误状态，失败一律走 appToast 弹出去、不留标记。
  // 与其按「最后一条不是 assistant」之类的间接信号猜一个错误态，不如不显示 ——
  // 球猜错比不表态更糟：用户会以为真出了事。等 useSupport 真有错误字段了再接。
  const last = support.messages.at(-1)
  if (last?.role !== 'assistant') return 'idle'
  // 这四种 answerStatus 都是「球在等你补充」，不是已经答完
  if (['intent', 'needs_login', 'insufficient_evidence', 'out_of_scope'].includes(last.answerStatus ?? '')) return 'asking'
  return 'done'
}
