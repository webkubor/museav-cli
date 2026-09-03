/**
 * 智能助手面板的显式状态机（智能客服 PRD §7.1、技术方案 §7.1）。
 *
 * 技术方案对本期的两条硬规则，这个文件就是为它们存在的：
 *   1. 所有渲染分支从 `mode` 派生，**禁止**用「有没有客服名字」「消息里有没有评价卡」
 *      这类隐式条件反推面板形态。
 *   2. 模式切换只由服务端事件与用户操作触发，前端计时器不得自行改变形态
 *      （尤其不得靠等待时长自造转异步，见 §6.8）。
 *
 * 与文档 9 行模式表的对应关系：
 *   · 文档把「初始空态 / 智能问答」拆成两行，但两者的顶部、底部与可用操作完全相同，
 *     差别只是消息流是否为空 —— 那是**内容**差异，不是形态差异，故合并为 `chat`。
 *   · 「人工结束」同理：底部恢复问答输入、顶部恢复服务记录入口，与 `chat` 一致；
 *     结束提示与五星卡片是消息流里的两条消息（§7.7 每个已结束会话只生成一张）。
 * 所以持久互斥形态是下面 7 个，仍然满足「渲染分支从 mode 派生」——组件查表，不写 if 链。
 */

import type { SupportTicketCapabilities } from '@/interfaces/support'

export type SupportMode =
  /** 初始空态 + 智能问答 + 人工结束后（由消息流内容区分，形态相同） */
  | 'chat'
  /** 结构化问题反馈表单 */
  | 'feedback'
  /** 转人工排队中：前方 N 人 */
  | 'queueing'
  /** 已分配未接通 */
  | 'connecting'
  /** 人工服务中 */
  | 'live'
  /** 服务记录列表 */
  | 'records'
  /** 工单详情 */
  | 'ticket'

/** 顶部右侧那一个操作位。§7.8：历史入口与人工操作共用同一位置且互斥 */
export type HeaderAction = 'records' | 'cancel-queue' | 'cancel-connect' | 'end-live' | 'back'

/** 底部区域形态。§7.1 模式表的「底部区域」列 */
export type FooterKind =
  /** 问题反馈按钮 + 消息输入 */
  | 'chat'
  /** 反馈表单的提交/取消，不显示聊天输入 */
  | 'feedback-actions'
  /** 输入禁用且不显示问题反馈（排队中 / 连接中） */
  | 'input-disabled'
  /** 人工咨询输入，不显示问题反馈 */
  | 'live-input'
  /** 不显示输入（服务记录列表） */
  | 'none'
  /** 按工单能力位渲染回复 / 补充 / 重开 / 再次反馈 */
  | 'ticket-actions'

export interface ModeSpec {
  headerAction: HeaderAction
  footer: FooterKind
  /** 顶部中段是否显示「在线」状态点；人工流程期间改显示客服身份或排队进度 */
  showsOnlineStatus: boolean
  /** 该模式下是否允许发起转人工（§7.1：排队或连接中不允许重复发起） */
  canStartHandoff: boolean
  /** 该模式下是否允许进入问题反馈（§7.1：人工流程期间不显示问题反馈） */
  canOpenFeedback: boolean
}

/**
 * 模式 → 形态表。组件只查这张表，不在 JSX 里写 mode 的 if 链，
 * 新增模式时漏配一处会被 TS 的 Record 完整性检查拦下。
 */
export const MODE_SPEC: Record<SupportMode, ModeSpec> = {
  chat: {
    headerAction: 'records',
    footer: 'chat',
    showsOnlineStatus: true,
    canStartHandoff: true,
    canOpenFeedback: true,
  },
  feedback: {
    headerAction: 'records',
    footer: 'feedback-actions',
    showsOnlineStatus: true,
    // §7.1：反馈表单中不响应聊天发送和转人工
    canStartHandoff: false,
    canOpenFeedback: false,
  },
  queueing: {
    headerAction: 'cancel-queue',
    footer: 'input-disabled',
    showsOnlineStatus: false,
    canStartHandoff: false,
    canOpenFeedback: false,
  },
  connecting: {
    headerAction: 'cancel-connect',
    footer: 'input-disabled',
    showsOnlineStatus: false,
    canStartHandoff: false,
    canOpenFeedback: false,
  },
  live: {
    headerAction: 'end-live',
    footer: 'live-input',
    showsOnlineStatus: false,
    canStartHandoff: false,
    canOpenFeedback: false,
  },
  records: {
    headerAction: 'back',
    footer: 'none',
    showsOnlineStatus: true,
    canStartHandoff: false,
    canOpenFeedback: false,
  },
  ticket: {
    headerAction: 'back',
    footer: 'ticket-actions',
    showsOnlineStatus: true,
    canStartHandoff: false,
    canOpenFeedback: false,
  },
}

/** 人工流程进行中（§7.8：这三态不显示服务记录入口，但当前服务单仍在服务记录里） */
export function isHumanFlow(mode: SupportMode) {
  return mode === 'queueing' || mode === 'connecting' || mode === 'live'
}

/** 服务记录相关模式，返回键要回到列表还是回到对话 */
export function isRecordsFlow(mode: SupportMode) {
  return mode === 'records' || mode === 'ticket'
}

/**
 * 服务端事件驱动的模式转移（§6.8 / §6.9）。
 * 只处理「事件改变面板形态」这一件事，工单数据的合并在 use-support-events 里做。
 *
 * 三条不变量：
 *   · 转异步事件从任意人工态回到 chat（卡片插进对话，恢复普通问答）。
 *   · 领取成功（status → processing）只把 connecting 推进到 live，不影响其它模式。
 *   · 用户已经切到服务记录 / 反馈表单时，人工态的推进不抢占当前视图 ——
 *     形态只在人工流程模式内推进，避免把用户从正在看的工单里弹走。
 */
export function nextModeForEvent(
  mode: SupportMode,
  event: { type: string; status?: string },
): SupportMode {
  if (event.type === 'ticket.async_converted') {
    return isHumanFlow(mode) ? 'chat' : mode
  }
  if (event.type === 'ticket.cancelled') {
    return isHumanFlow(mode) ? 'chat' : mode
  }
  if (event.type === 'ticket.status_changed' && event.status === 'processing') {
    return mode === 'queueing' || mode === 'connecting' ? 'live' : mode
  }
  return mode
}

/** 工单详情底部按哪种写入口渲染。能力位由服务端下发，前端不按状态字符串推（§4.6） */
export function ticketWriteAffordance(capabilities: SupportTicketCapabilities) {
  if (capabilities.can_reply) return 'reply' as const
  if (capabilities.can_supplement) return 'supplement' as const
  if (capabilities.can_reopen || capabilities.can_create_followup) return 'closed-actions' as const
  return 'none' as const
}
