import { describe, expect, it } from 'vitest'
import {
  canStartHandoff,
  canTransition,
  composerDisabled,
  isHumanChannel,
  isEndedSupportTicket,
  canApplyEndedTicket,
  isSameSupportContext,
  reserveEndedTicket,
  modeFromServiceMode,
  needsEvents,
  showsComposer,
  showsFeedbackEntry,
  showsMessageThread,
  ticketIdOf,
  transition,
  type SupportMode,
} from './support-machine'

describe('support-machine · 模式迁移', () => {
  it('客服已关闭工单时识别为结束态', () => {
    expect(isEndedSupportTicket({ service_mode: 'ended', status: 'resolved' })).toBe(true)
    expect(isEndedSupportTicket({ service_mode: 'live', status: 'closed' })).toBe(true)
    expect(isEndedSupportTicket({ service_mode: 'live', status: 'serving' })).toBe(false)
  })

  it('同一工单的结束状态只允许应用一次', () => {
    const first = reserveEndedTicket(new Set<string>(), 'CS-1')
    const second = reserveEndedTicket(first.appliedTicketIds, 'CS-1')

    expect(first.shouldApply).toBe(true)
    expect(second.shouldApply).toBe(false)
    expect(second.appliedTicketIds).toBe(first.appliedTicketIds)
  })

  it('异步回包仅作用于仍匹配的账号和工单', () => {
    expect(isSameSupportContext('account-a', 'account-a', 'CS-1', 'CS-1')).toBe(true)
    expect(isSameSupportContext('account-b', 'account-a', 'CS-1', 'CS-1')).toBe(false)
    expect(isSameSupportContext('account-a', 'account-a', 'CS-2', 'CS-1')).toBe(false)
  })

  it('仅允许可迁移到人工结束态的当前模式应用结束工单', () => {
    expect(canApplyEndedTicket({ kind: 'human', ticketId: 'CS-1' })).toBe(true)
    expect(canApplyEndedTicket({ kind: 'queuing', ticketId: 'CS-1' })).toBe(false)
    expect(canApplyEndedTicket({ kind: 'ticketDetail', ticketId: 'CS-1' })).toBe(false)
  })

  it('PRD §8.5：反馈表单里不响应转人工，只能回问答', () => {
    expect(canTransition('feedback', 'chat')).toBe(true)
    expect(canTransition('feedback', 'queuing')).toBe(false)
    expect(canTransition('feedback', 'human')).toBe(false)
  })

  it('PRD §8.6：排队/连接中不允许重复发起转接', () => {
    expect(canStartHandoff({ kind: 'queuing', ticketId: 'T1' })).toBe(false)
    expect(canStartHandoff({ kind: 'connecting', ticketId: 'T1' })).toBe(false)
    expect(canStartHandoff({ kind: 'human', ticketId: 'T1' })).toBe(false)
    expect(canStartHandoff({ kind: 'chat' })).toBe(true)
    expect(canStartHandoff({ kind: 'empty' })).toBe(true)
    expect(canStartHandoff({ kind: 'humanEnded', ticketId: 'T1' })).toBe(true)
  })

  it('非法迁移被拦下且不改变当前模式（不静默生效）', () => {
    const cur: SupportMode = { kind: 'feedback' }
    expect(transition(cur, { kind: 'queuing', ticketId: 'T1' })).toBe(cur)
    // 合法的照常通过
    expect(transition(cur, { kind: 'chat' })).toEqual({ kind: 'chat' })
  })

  it('同模式内换数据总是允许（排队人数变化）', () => {
    const a: SupportMode = { kind: 'queuing', ticketId: 'T1', ahead: 5 }
    const b: SupportMode = { kind: 'queuing', ticketId: 'T1', ahead: 2 }
    expect(transition(a, b)).toEqual(b)
  })
})

describe('support-machine · 回归：散装状态导致的两个残留 bug', () => {
  // 旧实现 cancelActiveHandoff 清了 serviceMode/ticketId/queuePosition，**没清 agentInfo**，
  // 而 startHandoff 在后端直接返回客服信息时会写 agentInfo ⇒ 取消排队后残留上一位客服，
  // 下次生成评价卡会带错误姓名/工号。
  it('取消排队回到 chat 后，不可能再读到 agent 信息', () => {
    const queuing: SupportMode = { kind: 'queuing', ticketId: 'T1', ahead: 3 }
    const back = transition(queuing, { kind: 'chat' })
    expect(back).toEqual({ kind: 'chat' })
    // chat 模式的类型里根本没有 agentName/agentNo/ahead 字段 —— 残留在类型层面就不可能
    expect('agentName' in back).toBe(false)
    expect('ahead' in back).toBe(false)
    expect(ticketIdOf(back)).toBeNull()
  })

  // 旧实现 service_mode==='async' 那一支清了 serviceMode/ticketId/agentInfo，**没清 queuePosition**，
  // 顶部还可能显示「前方 N 人」。
  it('转异步映射回 chat，排队人数不可能残留', () => {
    const m = modeFromServiceMode('async', 'T1', { ahead: 7 })
    expect(m).toEqual({ kind: 'chat' })
    expect('ahead' in m).toBe(false)
  })
})

describe('support-machine · 三区行为由模式单向推导', () => {
  const cases: Array<[SupportMode, { composer: boolean; disabled: boolean; feedback: boolean; human: boolean; events: boolean; thread: boolean }]> = [
    [{ kind: 'empty' }, { composer: true, disabled: false, feedback: true, human: false, events: false, thread: true }],
    [{ kind: 'chat' }, { composer: true, disabled: false, feedback: true, human: false, events: false, thread: true }],
    // PRD §8.1：反馈表单「不显示聊天输入」
    [{ kind: 'feedback' }, { composer: false, disabled: false, feedback: false, human: false, events: false, thread: false }],
    // 排队/连接：输入禁用、不显示反馈入口、长轮询开；中部仍要留对话流
    [{ kind: 'queuing', ticketId: 'T1' }, { composer: false, disabled: true, feedback: false, human: false, events: true, thread: true }],
    [{ kind: 'connecting', ticketId: 'T1' }, { composer: false, disabled: true, feedback: false, human: false, events: true, thread: true }],
    // 人工服务：输入走人工通道、不显示反馈入口；中部必须渲染消息，否则 hi 发出去气泡不出现
    [{ kind: 'human', ticketId: 'T1' }, { composer: true, disabled: false, feedback: false, human: true, events: true, thread: true }],
    // 人工结束：恢复问答与反馈入口、轮询关
    [{ kind: 'humanEnded', ticketId: 'T1' }, { composer: true, disabled: false, feedback: true, human: false, events: false, thread: true }],
    [{ kind: 'tickets' }, { composer: false, disabled: false, feedback: false, human: false, events: false, thread: false }],
    [{ kind: 'ticketDetail', ticketId: 'T1' }, { composer: false, disabled: false, feedback: false, human: false, events: false, thread: false }],
  ]

  it.each(cases)('%j 的三区行为与 PRD §8.1 模式表一致', (mode, want) => {
    expect(showsComposer(mode)).toBe(want.composer)
    expect(composerDisabled(mode)).toBe(want.disabled)
    expect(showsFeedbackEntry(mode)).toBe(want.feedback)
    expect(isHumanChannel(mode)).toBe(want.human)
    expect(needsEvents(mode)).toBe(want.events)
    expect(showsMessageThread(mode)).toBe(want.thread)
  })

  it('排队与连接中，输入框存在但禁用 —— 不是「不显示」', () => {
    // 这两条容易写反：PRD §8.1 底部列写的是「输入禁用」，不是隐藏
    expect(composerDisabled({ kind: 'queuing', ticketId: 'T1' })).toBe(true)
    expect(composerDisabled({ kind: 'connecting', ticketId: 'T1' })).toBe(true)
  })
})

describe('support-machine · service_mode 映射', () => {
  it('五种后端取值各自落到对的模式', () => {
    expect(modeFromServiceMode('queueing', 'T1', { ahead: 4 })).toEqual({ kind: 'queuing', ticketId: 'T1', ahead: 4 })
    expect(modeFromServiceMode('connecting', 'T1')).toEqual({ kind: 'connecting', ticketId: 'T1' })
    expect(modeFromServiceMode('connected', 'T1', { agentName: '小沐', agentNo: 'A01' }))
      .toEqual({ kind: 'human', ticketId: 'T1', agentName: '小沐', agentNo: 'A01' })
    expect(modeFromServiceMode('ended', 'T1')).toEqual({ kind: 'humanEnded', ticketId: 'T1' })
    expect(modeFromServiceMode('async', 'T1')).toEqual({ kind: 'chat' })
  })

  // 2026-09-14 生产级白屏的回归：后端 handoff 实际回 service_mode:"live"（PRD 里没有），
  // switch 不认它 → 返回 undefined → transition 读 next.kind 抛 TypeError → 整棵 React 树白屏。
  it('live 按 status 分排队/已接通，未知取值兜底到 chat（绝不返回 undefined）', () => {
    expect(modeFromServiceMode('live', 'CS-1', { status: 'pending' }))
      .toEqual({ kind: 'queuing', ticketId: 'CS-1', ahead: undefined })
    expect(modeFromServiceMode('live', 'CS-1', { status: 'serving', agentName: '小沐' }))
      .toEqual({ kind: 'human', ticketId: 'CS-1', agentName: '小沐', agentNo: undefined })
    // 后端将来再加新取值：最差停在问答模式，不许是 undefined
    const unknown = modeFromServiceMode('brand_new_mode' as never, 'CS-1')
    expect(unknown).toBeDefined()
    expect(unknown).toEqual({ kind: 'chat' })
  })

  it('transition 收到空值时停在当前模式，不抛错（白屏第二道防线）', () => {
    const cur = { kind: 'chat' } as const
    expect(transition(cur, undefined as never)).toEqual(cur)
    expect(transition(cur, null as never)).toEqual(cur)
  })

  it('ticketIdOf 只在带工单的模式返回工单号', () => {
    expect(ticketIdOf({ kind: 'chat' })).toBeNull()
    expect(ticketIdOf({ kind: 'empty' })).toBeNull()
    expect(ticketIdOf({ kind: 'feedback' })).toBeNull()
    expect(ticketIdOf({ kind: 'tickets' })).toBeNull()
    expect(ticketIdOf({ kind: 'queuing', ticketId: 'T1' })).toBe('T1')
    expect(ticketIdOf({ kind: 'human', ticketId: 'T2' })).toBe('T2')
    expect(ticketIdOf({ kind: 'ticketDetail', ticketId: 'T3' })).toBe('T3')
  })
})
