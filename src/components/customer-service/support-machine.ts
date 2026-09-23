/**
 * 智能助手的模式状态机（PRD §8.1，prd#996）。
 *
 * PRD 的硬约束是「**同一时间只能处于一种主模式**」，而每种模式对面板三个区域
 * （顶部状态 / 中部内容 / 底部动作）的行为都不同。
 *
 * 这里之所以用一个 discriminated union 而不是原来的两个枚举（`PanelMode` +
 * `SupportServiceMode`）相乘，是因为那样有 4×6=24 种组合、PRD 只承认 9 种，
 * 剩下 15 种没有任何机制阻止它出现。实际已经踩到两处：
 *
 *  1. **取消排队后 `agentInfo` 残留**：`cancelActiveHandoff` 清了 serviceMode /
 *     ticketId / queuePosition，**但没清 agentInfo**；而 `startHandoff` 在后端
 *     直接返回 agent 信息时是会写 agentInfo 的（resp.agent_name 那一支）。
 *     于是「排队时已分配客服 → 用户取消 → 回到智能问答」之后，agentInfo 仍挂着
 *     上一位客服，下一次进入 ended 生成评价卡时会带上**错误的客服姓名/工号**。
 *  2. **转异步后 queuePosition 残留**：`service_mode === 'async'` 那一支清了
 *     serviceMode / ticketId / agentInfo，**但没清 queuePosition**，顶部还可能
 *     显示「前方 N 人」。
 *
 * 两个 bug 同一个成因：**「回到某个模式」需要手动清 4~5 个变量，漏一个就残留**。
 * 状态机把「模式需要的数据」收进模式自己，切模式即丢弃旧数据，漏不掉。
 *
 * ⚠️ 改动约束：模式迁移**只允许通过本文件的 transition()**，组件里不要直接拼
 * `{ kind: ... }` —— 那等于又把非法组合的入口开回来。
 */
import type { SupportServiceMode, SupportTicketDetail } from '@/interfaces/support'

/** 9 种主模式，与 PRD §8.1 的模式表一一对应。数据随模式携带，切模式即失效。 */
export type SupportMode =
  /** 初始空态：品牌欢迎语 + 四个常见问题 */
  | { kind: 'empty' }
  /** 智能问答：用户与助手的消息流 */
  | { kind: 'chat' }
  /** 反馈表单：中部换表单，**不显示聊天输入**，不响应转人工 */
  | { kind: 'feedback' }
  /** 排队中：右上角「取消排队」，输入禁用 */
  | { kind: 'queuing'; ticketId: string; ahead?: number; statusLabel?: string }
  /** 正在连接：右上角「取消转接」，输入禁用 */
  | { kind: 'connecting'; ticketId: string }
  /** 人工服务：顶部客服姓名+工号、可结束服务；输入走人工通道 */
  | { kind: 'human'; ticketId: string; agentName?: string; agentNo?: string }
  /** 人工结束：结束提示 + 五星评价卡；恢复问答与反馈入口 */
  | { kind: 'humanEnded'; ticketId: string }
  /** 服务记录列表 */
  | { kind: 'tickets' }
  /** 工单详情 */
  | { kind: 'ticketDetail'; ticketId: string; detail?: SupportTicketDetail | null }

export type SupportModeKind = SupportMode['kind']

/** 仅当前活动且未取消的工单可以应用迟到轮询快照。 */
export function canApplyHandoffSnapshot(
  ticketId: string,
  activeTicketId: string | null,
  suppressedTicketIds: ReadonlySet<string>,
): boolean {
  return activeTicketId === ticketId && !suppressedTicketIds.has(ticketId)
}

/**
 * 允许的迁移。列成表而不是散在各处的 setState，是为了让「哪些跳转是合法的」
 * 可被一眼读完、也可被测试钉住。
 *
 * 读法：from → 允许到达的 to 集合。
 */
const TRANSITIONS: Record<SupportModeKind, readonly SupportModeKind[]> = {
  empty: ['chat', 'feedback', 'queuing', 'tickets'],
  chat: ['feedback', 'queuing', 'tickets', 'empty'],
  // PRD §8.5：反馈表单里不响应聊天发送与转人工，只能提交或取消回问答
  feedback: ['chat'],
  // PRD §8.6：排队中不允许重复发起转接；可取消回问答、可进连接、可被后端转异步
  queuing: ['connecting', 'human', 'chat'],
  connecting: ['human', 'chat'],
  human: ['humanEnded', 'chat'],
  // 人工结束后恢复问答与反馈入口
  humanEnded: ['chat', 'feedback', 'tickets'],
  tickets: ['ticketDetail', 'chat'],
  ticketDetail: ['tickets', 'chat'],
}

/** 这个跳转合法吗（同模式内换数据总是允许，例如排队人数变化）。 */
export function canTransition(from: SupportModeKind, to: SupportModeKind): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

/**
 * 唯一的模式迁移入口。非法跳转**不静默生效**：开发期报 warn 并保持原模式，
 * 免得像旧实现那样悄悄进入 PRD 不承认的组合。
 */
export function transition(current: SupportMode, next: SupportMode): SupportMode {
  // 第二道防线：上游（如 modeFromServiceMode 遇到未知 service_mode）给出空值时
  // 停在当前模式，不让 next.kind 抛 TypeError 把整棵树带崩。
  if (!next?.kind) return current
  if (!canTransition(current.kind, next.kind)) {
    if (import.meta.env.DEV) {
      console.warn(`[support-machine] 非法模式迁移被拦下: ${current.kind} → ${next.kind}`)
    }
    return current
  }
  return next
}

/**
 * 把后端的 `service_mode` 映射成模式。后端只描述「人工服务这条线走到哪」，
 * 面板模式还要考虑非人工的那几种，所以映射只覆盖人工相关的取值。
 *
 * `async`（转异步）**回到 chat**：PRD §8.6 说转异步后走异步回执，不再占用面板主态；
 * 这也是旧实现里 queuePosition 残留的那一支。
 */
export function modeFromServiceMode(
  serviceMode: SupportServiceMode,
  ticketId: string,
  extra?: { ahead?: number; agentName?: string; agentNo?: string; status?: string; statusLabel?: string },
): SupportMode {
  const status = extra?.status
  switch (serviceMode) {
    case 'queueing':
      return { kind: 'queuing', ticketId, ahead: extra?.ahead, statusLabel: extra?.statusLabel }
    case 'connecting':
      return { kind: 'connecting', ticketId }
    case 'connected':
      return { kind: 'human', ticketId, agentName: extra?.agentName, agentNo: extra?.agentNo }
    case 'ended':
      return { kind: 'humanEnded', ticketId }
    case 'async':
      return { kind: 'chat' }
    // 后端实测返回的是 live（实时人工这条线），排队到哪一步看 status：
    // pending = 还在排队，其余按已接通渲染。
    case 'live':
      return status === 'pending'
        ? { kind: 'queuing', ticketId, ahead: extra?.ahead, statusLabel: extra?.statusLabel }
        : { kind: 'human', ticketId, agentName: extra?.agentName, agentNo: extra?.agentNo }
    default:
      // 🔴 兜底不可省：这个函数的返回值直接进 transition(cur, next)，
      // 返回 undefined 会在 next.kind 上抛 TypeError，整棵 React 树白屏
      // ——2026-09-14 就是这么白的（后端加了 PRD 里没有的 live）。
      // 后端再加新取值时，最差是停在问答模式，不是白屏。
      return { kind: 'chat' }
  }
}

/**
 * 反向映射：当前模式对应后端的哪个 `service_mode`（非人工模式返回 undefined）。
 * 只用于和长轮询事件比对「后端说的状态变了没」，不参与渲染。
 */
export function serviceModeOf(mode: SupportMode): SupportServiceMode | undefined {
  switch (mode.kind) {
    case 'queuing': return 'queueing'
    case 'connecting': return 'connecting'
    case 'human': return 'connected'
    case 'humanEnded': return 'ended'
    default: return undefined
  }
}

// ── 三区行为：由模式单向推导，组件不再各自判断 ────────────────────────────

/** 底部是否显示聊天输入框（PRD §8.1 模式表「底部区域」列）。 */
export function showsComposer(mode: SupportMode): boolean {
  return mode.kind === 'empty' || mode.kind === 'chat' || mode.kind === 'human' || mode.kind === 'humanEnded'
}

/** 中部是否显示对话流。人工接通、排队、连接中都要留着，否则输入发出去了气泡却不渲染。 */
export function showsMessageThread(mode: SupportMode): boolean {
  switch (mode.kind) {
    case 'empty':
    case 'chat':
    case 'human':
    case 'humanEnded':
    case 'queuing':
    case 'connecting':
      return true
    default:
      return false
  }
}

/** 输入框是否禁用：排队与连接中禁用（PRD §8.1「输入禁用」）。 */
export function composerDisabled(mode: SupportMode): boolean {
  return mode.kind === 'queuing' || mode.kind === 'connecting'
}

/** 底部是否显示「问题反馈」入口：人工流程中不显示（PRD §8.1）。 */
export function showsFeedbackEntry(mode: SupportMode): boolean {
  return mode.kind === 'empty' || mode.kind === 'chat' || mode.kind === 'humanEnded'
}

/** 输入是否走人工通道（而非 /support/ask）。 */
export function isHumanChannel(mode: SupportMode): boolean {
  return mode.kind === 'human'
}

/** 长轮询是否该开：只在人工线进行中开（省掉空轮询）。 */
export function needsEvents(mode: SupportMode): boolean {
  return mode.kind === 'queuing' || mode.kind === 'connecting' || mode.kind === 'human'
}

/** 当前模式关联的工单号（没有就是 null）—— 取代原先那个全局 ticketId。 */
export function ticketIdOf(mode: SupportMode): string | null {
  switch (mode.kind) {
    case 'queuing':
    case 'connecting':
    case 'human':
    case 'humanEnded':
    case 'ticketDetail':
      return mode.ticketId
    default:
      return null
  }
}

/** 工单详情明确表示人工服务已结束时，禁止继续走用户回复接口。 */
export function isEndedSupportTicket(ticket: Pick<SupportTicketDetail, 'service_mode' | 'status'>): boolean {
  const status = ticket.status.trim().toLowerCase()
  return ticket.service_mode === 'ended' || status === 'closed' || status === 'resolved'
}

/** 幂等预留结束态工单，避免长轮询与失败回复的详情回包重复追加评价卡。 */
export function reserveEndedTicket(
  appliedTicketIds: ReadonlySet<string>,
  ticketId: string,
): { appliedTicketIds: ReadonlySet<string>; shouldApply: boolean } {
  if (appliedTicketIds.has(ticketId)) return { appliedTicketIds, shouldApply: false }
  const nextAppliedTicketIds = new Set(appliedTicketIds)
  nextAppliedTicketIds.add(ticketId)
  return { appliedTicketIds: nextAppliedTicketIds, shouldApply: true }
}

/** 校验异步工单响应仍属于当前账号与当前面板工单。 */
export function isSameSupportContext(
  activeAccountId: string | null,
  expectedAccountId: string | null,
  activeTicketId: string | null,
  expectedTicketId: string,
): boolean {
  return activeAccountId === expectedAccountId && activeTicketId === expectedTicketId
}

/** 结束态回包只允许从当前状态机认可的模式落地。 */
export function canApplyEndedTicket(mode: SupportMode): boolean {
  return canTransition(mode.kind, 'humanEnded')
}

/** 能否发起转人工：只有空态/问答里可以，其余模式（尤其排队中）不允许重复发起。 */
export function canStartHandoff(mode: SupportMode): boolean {
  return mode.kind === 'empty' || mode.kind === 'chat' || mode.kind === 'humanEnded'
}
