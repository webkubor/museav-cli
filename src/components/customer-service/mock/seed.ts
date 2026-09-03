/**
 * dev-only 工单种子数据。
 *
 * 来源是 PRD 原型 `modelgo_prd/src/customerSupportHistoryDomain.ts` 的 `mockSeeds`
 * 与三张 mock 表（feedbackMetas / resolutions / handlingEvents），**照搬不新编**，
 * 只做一件事：把原型的中文状态与驼峰字段换成技术方案 §4.1/§4.5 的 wire 形状
 * （英文 `status` 枚举 + 服务端下发的 `status_label` + 下划线字段名）。
 *
 * 覆盖面刻意保持原型那 12 条：三类工单 × 四态 × 有/无未读，才能把 §7.9 的状态表、
 * §7.10 的三种详情形态和未读置顶都在浏览器里走一遍。后端上线后整个 mock/ 目录删掉。
 */

import type {
  SupportHandlingEvent,
  SupportTicketDetail,
  SupportTicketMessage,
  SupportTicketStatus,
} from '@/interfaces/support'

/** §4.5 状态 → 用户侧展示文案。服务端才是权威，这里是 mock 扮演服务端下发 */
export function statusLabel(
  status: SupportTicketStatus,
  serviceMode: 'live' | 'async' | null,
  queuePosition?: number,
): string {
  if (status === 'pending') {
    if (serviceMode === 'async') return '待客服联系'
    if (serviceMode === 'live') return queuePosition === undefined ? '正在连接' : `排队中 · 前方 ${queuePosition} 人`
    return '等待客服受理'
  }
  if (status === 'processing') return '处理中'
  if (status === 'resolved') return '已解决'
  return '已取消'
}

/** §4.6 能力位表。服务端计算下发，mock 按同一张表算，前端永远只读 */
export function capabilitiesFor(
  ticketType: 'feedback' | 'human_support',
  serviceMode: 'live' | 'async' | null,
  status: SupportTicketStatus,
) {
  if (status === 'resolved') {
    return { can_reply: false, can_supplement: false, can_reopen: true, can_create_followup: true }
  }
  if (status === 'cancelled') {
    return { can_reply: false, can_supplement: false, can_reopen: false, can_create_followup: true }
  }
  if (ticketType === 'feedback') {
    return { can_reply: false, can_supplement: true, can_reopen: false, can_create_followup: false }
  }
  if (serviceMode === 'async') {
    return { can_reply: true, can_supplement: false, can_reopen: false, can_create_followup: false }
  }
  // 人工服务 live 进行中：会话在主面板，服务记录里只做事后回看，两个写入口都关
  return { can_reply: false, can_supplement: false, can_reopen: false, can_create_followup: false }
}

type Seed = {
  id: string
  displayType: '问题反馈' | '人工服务' | '人工服务 · 转异步'
  status: SupportTicketStatus
  title: string
  unread: number
}

const SEEDS: Seed[] = [
  { id: 'CS-20260819-6001', displayType: '人工服务 · 转异步', status: 'pending', title: '人工咨询转异步跟进', unread: 0 },
  { id: 'FB-20260818-1402', displayType: '问题反馈', status: 'processing', title: '调用日志筛选后数据不一致', unread: 1 },
  { id: 'CS-20260817-3812', displayType: '人工服务', status: 'resolved', title: 'API Key 创建后无法调用', unread: 0 },
  { id: 'FB-20260816-4408', displayType: '问题反馈', status: 'processing', title: '账单金额需要协助核对', unread: 0 },
  { id: 'CS-20260815-2260', displayType: '人工服务 · 转异步', status: 'pending', title: '模型请求持续超时', unread: 0 },
  { id: 'CS-20260814-5521', displayType: '人工服务', status: 'cancelled', title: '工作空间权限咨询', unread: 0 },
  { id: 'FB-20260813-0918', displayType: '问题反馈', status: 'resolved', title: '模型列表加载缓慢', unread: 0 },
  { id: 'CS-20260812-7602', displayType: '人工服务 · 转异步', status: 'processing', title: '护栏误拦截排查', unread: 1 },
  { id: 'FB-20260811-3317', displayType: '问题反馈', status: 'resolved', title: '发票抬头修改咨询', unread: 0 },
  { id: 'CS-20260810-1846', displayType: '人工服务', status: 'resolved', title: '充值到账时间咨询', unread: 0 },
  { id: 'FB-20260809-6083', displayType: '问题反馈', status: 'resolved', title: '成员邀请链接失效', unread: 0 },
  { id: 'CS-20260808-4105', displayType: '人工服务 · 转异步', status: 'resolved', title: '视频任务下载失败', unread: 0 },
]

const FEEDBACK_SNAPSHOTS: Record<string, { category: string; description: string; occurred_at?: string; request_id?: string; attachment?: string }> = {
  'FB-20260818-1402': {
    category: '调用问题',
    description: '调用日志筛选后数据不一致，选择时间段后展示数量与实际请求不符，且补充最近一次请求的 Request ID 后仍复现。',
    occurred_at: '2026-08-18T09:10:00+08:00',
    request_id: 'req-a1b2c3d4e5f6',
  },
  'FB-20260816-4408': {
    category: '账单问题',
    description: '账单金额需要协助核对，本月账单显示费用与实际用量不匹配，怀疑存在计费错误。',
    occurred_at: '2026-08-16T09:00:00+08:00',
    attachment: 'screenshot-billing.png',
  },
  'FB-20260813-0918': {
    category: '功能异常',
    description: '模型列表加载缓慢，每次打开模型广场需要等待 5-10 秒才能显示，其他页面正常。',
    occurred_at: '2026-08-13T08:50:00+08:00',
  },
  'FB-20260811-3317': {
    category: '其他',
    description: '发票抬头修改咨询，需要将发票抬头从个人修改为企业名称，请问如何操作？',
    occurred_at: '2026-08-11T09:15:00+08:00',
  },
  'FB-20260809-6083': {
    category: '功能异常',
    description: '成员邀请链接失效，发送给新成员的邀请链接点击后提示「链接已过期」，已重新生成多次仍无效。',
    occurred_at: '2026-08-09T14:30:00+08:00',
  },
}

const RESOLUTIONS: Record<string, string> = {
  'CS-20260817-3812': '新建 API Key 需要约 1 分钟同步到调用网关，期间调用会返回 401。已确认你的 Key 现在可正常调用，无需重新创建。',
  'FB-20260813-0918': '模型广场的列表接口缺少缓存，已在 8 月 14 日发版修复，首屏加载从 6 秒降至 800 毫秒。',
  'CS-20260810-1846': '支付宝充值实时到账，银行对公转账需 1-2 个工作日。你 8 月 10 日的转账已于次日到账，余额已更新。',
  'FB-20260809-6083': '邀请链接有效期为 24 小时，超时需重新生成。已确认你新生成的链接可正常加入，问题不再复现。',
  'FB-20260811-3317': '发票抬头可在账号设置 > 发票管理中自行修改，修改后次月账单生效。已确认你的抬头已更新为企业名称。',
  'CS-20260808-4105': '视频任务下载链接有效期为 2 小时，过期需在任务详情重新生成。已确认你重新生成的链接可正常下载。',
}

const CONTACT_NOTES: Record<string, string> = {
  'FB-20260818-1402': '已确认问题可稳定复现',
  'FB-20260816-4408': '已告知账单流水对应关系',
  'FB-20260813-0918': '已同步修复版本上线时间',
  'FB-20260809-6083': '已说明邀请链接有效期规则',
  'CS-20260812-7602': '已收集护栏命中规则与请求样本',
  'CS-20260808-4105': '已说明下载链接有效期规则',
}

const AGENTS = ['吴津瑶', 'Lin', '周予安']

/**
 * §6.11：处理记录只下发可对用户外露的事件，且只有问题反馈与转异步展示
 * （人工服务本身就是对话，不展示处理记录）。
 */
function handlingEvents(seed: Seed, day: string, agentName: string): SupportHandlingEvent[] | undefined {
  if (seed.displayType === '人工服务') return undefined
  const at = (time: string) => `2026-08-${day}T${time}+08:00`
  const events: SupportHandlingEvent[] = [{
    id: `${seed.id}-created`,
    type: 'ticket.created',
    actor_name: '你',
    created_at: at('09:20:00'),
    summary: seed.displayType === '问题反馈' ? '用户提交问题反馈' : '转人工工单已创建',
  }]
  if (seed.status === 'pending') return events

  events.push({
    id: `${seed.id}-claimed`,
    type: 'ticket.claimed',
    actor_name: agentName,
    created_at: at('09:35:00'),
    summary: `${agentName} 领取工单`,
  })

  const note = CONTACT_NOTES[seed.id]
  if (note) {
    const byEmail = seed.displayType === '问题反馈' && seed.id.endsWith('4408')
    events.push({
      id: `${seed.id}-contact`,
      type: 'ticket.contact_recorded',
      actor_name: agentName,
      created_at: at('10:05:00'),
      summary: byEmail ? `邮件 · 已发送邮件：${note}` : `电话 · 已联系：${note}`,
    })
  }
  if (seed.status === 'resolved') {
    events.push({
      id: `${seed.id}-resolved`,
      type: 'ticket.resolved',
      actor_name: agentName,
      created_at: at('10:30:00'),
      summary: '工单已解决',
    })
  }
  return events
}

export function createSeedTickets(): SupportTicketDetail[] {
  return SEEDS.map((seed, index) => {
    const day = String(19 - index).padStart(2, '0')
    const createdAt = `2026-08-${day}T09:20:00+08:00`
    const updatedAt = `2026-08-${day}T10:30:00+08:00`
    const isFeedback = seed.displayType === '问题反馈'
    const ticketType = isFeedback ? ('feedback' as const) : ('human_support' as const)
    const serviceMode = isFeedback ? null : seed.displayType === '人工服务' ? ('live' as const) : ('async' as const)
    const snapshot = FEEDBACK_SNAPSHOTS[seed.id]

    // 问题反馈详情不返回任何对话气泡（§7.10），所以它的 messages 留空
    const messages: SupportTicketMessage[] = isFeedback ? [] : [
      {
        message_id: `${seed.id}-m1`,
        seq: 1,
        kind: 'message',
        sender_type: 'user',
        content: seed.title,
        created_at: createdAt,
      },
      {
        message_id: `${seed.id}-m2`,
        seq: 2,
        kind: 'system',
        sender_type: 'system',
        content: `当前处理状态：${statusLabel(seed.status, serviceMode)}`,
        created_at: updatedAt,
      },
    ]
    if (seed.displayType === '人工服务' && seed.status === 'resolved') {
      messages.push({
        message_id: `${seed.id}-m3`,
        seq: 3,
        kind: 'rating',
        sender_type: 'system',
        content: '5',
        created_at: updatedAt,
      })
    }

    const latestSeq = isFeedback ? 1 : messages.at(-1)?.seq ?? 1

    return {
      ticket_id: seed.id,
      ticket_type: ticketType,
      service_mode: serviceMode,
      display_type: seed.displayType,
      status: seed.status,
      status_label: statusLabel(seed.status, serviceMode),
      title: seed.title,
      // 评价行的 content 是星级数字，不能当「最新消息」展示 —— 取最后一条非评价消息
      latest_visible_message: isFeedback
        ? snapshot?.description ?? seed.title
        : [...messages].reverse().find((item) => item.kind !== 'rating')?.content ?? seed.title,
      created_at: createdAt,
      updated_at: updatedAt,
      // §7.9：已取消只来自用户取消排队，此时尚未分配客服，不展示客服信息
      assignee_display_name: seed.displayType === '人工服务' && seed.status !== 'cancelled' ? '小沐 · MG-0726' : null,
      version: 1,
      latest_message_seq: latestSeq,
      read_message_seq: Math.max(0, latestSeq - seed.unread),
      unread_count: seed.unread,
      source_ticket_id: null,
      capabilities: capabilitiesFor(ticketType, serviceMode, seed.status),
      messages,
      handling_events: handlingEvents(seed, day, AGENTS[index % AGENTS.length]),
      feedback: snapshot
        ? {
            category: snapshot.category,
            description: snapshot.description,
            ...(snapshot.occurred_at ? { occurred_at: snapshot.occurred_at } : {}),
            ...(snapshot.request_id ? { request_id: snapshot.request_id } : {}),
            ...(snapshot.attachment
              ? { attachments: [{ id: `${seed.id}-att`, file_name: snapshot.attachment, scan_status: 'clean' as const }] }
              : {}),
          }
        : undefined,
      supplements: [],
      ...(RESOLUTIONS[seed.id] ? { resolution: RESOLUTIONS[seed.id] } : {}),
      rating: seed.displayType === '人工服务' && seed.status === 'resolved' ? 5 : null,
    }
  })
}

export const MOCK_AGENT = { name: '小沐', employee_id: 'MG-0726' } as const
