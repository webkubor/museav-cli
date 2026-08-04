import { LuClapperboard, LuImage, LuMusic } from 'react-icons/lu'
import type { TFunction } from 'i18next'
import { Money } from '@/components/ui/Money'
import type { BadgeVariant } from '@/components/ui/Badge'
import type { TaskArtifactState, TaskDetail, TaskItem, TaskKind } from '@/types'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { formatDateTime } from '@/lib/format-date'

// ─── 常量 ────────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 20
export const REFRESH_INTERVAL = 10 // 列表可见倒计时刷新间隔（秒）
export const EMPTY_TASK_ITEMS: TaskItem[] = []

// 状态词以 PRD 与接口新契约为准：queued→「排队中」、running→「生成中」。
// 已过期属于 artifact_state，不再混入 status；旧字段仅保留兼容回退。
const STATUS_META: Record<string, { labelKey: string; variant: BadgeVariant; dot: boolean }> = {
  queued:    { labelKey: 'status.queued', variant: 'secondary', dot: true },
  running:   { labelKey: 'status.running', variant: 'info',      dot: true },
  succeeded: { labelKey: 'status.succeeded', variant: 'success', dot: false },
  completed: { labelKey: 'status.completed', variant: 'success', dot: false },
  failed:    { labelKey: 'status.failed', variant: 'danger',     dot: false },
}

export function statusConfig(t: TFunction<'tasks'>): Record<string, { label: string; variant: BadgeVariant; dot: boolean }> {
  return Object.fromEntries(
    Object.entries(STATUS_META).map(([status, config]) => [
      status,
      { label: t(config.labelKey), variant: config.variant, dot: config.dot },
    ]),
  )
}

// 「已过期」为客户端派生筛选值（非后端 status），不下发后端、改走本地过滤
const ARTIFACT_STATE_OPTION_KEYS: Array<{ labelKey: string; value: TaskArtifactState }> = [
  { labelKey: 'artifactState.generating', value: 'generating' },
  { labelKey: 'artifactState.available', value: 'available' },
  { labelKey: 'artifactState.expired', value: 'expired' },
  { labelKey: 'artifactState.failed', value: 'failed' },
]

export function artifactStateOptions(t: TFunction<'tasks'>): Array<{ label: string; value: TaskArtifactState }> {
  return ARTIFACT_STATE_OPTION_KEYS.map((option) => ({ label: t(option.labelKey), value: option.value }))
}

const KIND_META: Record<TaskKind, { labelKey: string; icon: React.ReactNode }> = {
  video: { labelKey: 'kind.video', icon: <LuClapperboard size={13} /> },
  image: { labelKey: 'kind.image', icon: <LuImage        size={13} /> },
  audio: { labelKey: 'kind.audio', icon: <LuMusic        size={13} /> },
}

export function kindConfig(t: TFunction<'tasks'>): Record<TaskKind, { label: string; icon: React.ReactNode }> {
  return Object.fromEntries(
    Object.entries(KIND_META).map(([kind, config]) => [
      kind,
      { label: t(config.labelKey), icon: config.icon },
    ]),
  ) as Record<TaskKind, { label: string; icon: React.ReactNode }>
}

// GET /async-tasks 只支持 preset 三档（1h/24h/7d），无 from/to 自定义区间——不做自定义日期选择器
const TIME_PRESET_OPTION_KEYS: Array<{ labelKey: string; value: string }> = [
  { labelKey: 'timePreset.all', value: 'all' },
  { labelKey: 'timePreset.last1h', value: '1h' },
  { labelKey: 'timePreset.last24h', value: '24h' },
  { labelKey: 'timePreset.last7d', value: '7d' },
]

export function timePresetOptions(t: TFunction<'tasks'>): Array<{ label: string; value: string }> {
  return TIME_PRESET_OPTION_KEYS.map((option) => ({ label: t(option.labelKey), value: option.value }))
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

export function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return formatDateTime(iso)
}

/** 解析任务实际费用：后端返回 final_amount（decimal 字符串）；非数值返回 null */
export function taskCost(item: TaskItem): number | null {
  if (item.final_amount == null) return null
  const n = Number.parseFloat(item.final_amount)
  return Number.isFinite(n) ? n : null
}

/** 渲染任务费用：失败已计费用 danger 色（语义：异常扣费），其余默认。
 *  排队/运行中或无费用返回「—」，不计费场景返回「无费用」。 */
export function fmtCost(item: TaskItem): React.ReactNode {
  if (item.status === 'queued' || item.status === 'running') return '—'
  const amount = taskCost(item)
  if (amount == null) return '—'
  const tone = item.status === 'failed' && amount > 0 ? 'danger' : 'default'
  return <Money amount={amount} currency={item.currency} size="sm" tone={tone} />
}

export function costHint(item: TaskItem, t: TFunction<'tasks'>): string | null {
  const amount = taskCost(item)
  if (item.status === 'failed' && amount != null && amount > 0)
    return t('cost.failedWithCharge')
  if (item.status === 'failed' && !amount)
    return t('cost.failedNoCharge')
  if (item.status === 'cancelled')
    return t('cost.queuedCancelled')
  return null
}

export function resolveKind(item: TaskItem): TaskKind {
  if (item.kind) return item.kind
  const p = item.platform?.toLowerCase() ?? ''
  if (p.includes('image')) return 'image'
  if (p.includes('audio') || p.includes('music')) return 'audio'
  return 'video'
}

/** 任务是否处于成功完成态（后端实际返回 succeeded，旧枚举里写的是 completed，两者都兼容） */
export function isTaskDone(status: string) {
  return status === 'succeeded' || status === 'completed'
}

/** 视频产物是否已过期（result_meta.result_expires_at 早于当前时间）。
 *  列表项(TaskItem)与详情(TaskDetail)均带同形 result_meta，可能为空时安全读取。 */
export function isVideoExpired(item: TaskItem | TaskDetail | null | undefined): boolean {
  const expires = item?.result_meta?.result_expires_at
  if (!expires) return false
  return new Date(expires).getTime() < Date.now()
}

/** 产物有效期：基于 result_meta.result_expires_at。无 result_meta 返回 null（不展示）。 */
export function resultExpiry(
  item: TaskItem | TaskDetail | null | undefined,
  t: TFunction<'tasks'>,
): { expired: boolean; urgent: boolean; expiresAt: string; remain: string } | null {
  const expiresAt = item?.result_meta?.result_expires_at
  if (!expiresAt) return null
  const expiresTime = new Date(expiresAt).getTime()
  if (Number.isNaN(expiresTime)) return null
  const ms = expiresTime - Date.now()
  if (ms <= 0) return { expired: true, urgent: false, expiresAt, remain: '' }
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  // 剩 1 天以内 = 紧急（列表飘红）
  return {
    expired: false,
    urgent: ms <= 86_400_000,
    expiresAt,
    remain: days > 0 ? t('relativeTime.daysLeft', { count: days }) : hours > 0 ? t('relativeTime.hoursLeft', { count: hours }) : t('relativeTime.lessThanOneHour'),
  }
}

/**
 * 视频产物地址：网关内容端点，凭 gateway_request_id 即可访问，
 * 服务端 302 重定向到真实 OSS 文件。无需鉴权，直接作为 <video src>。
 * 端点形如 https://api.test.modelgo.com/v1/videos/{id}/content
 */
export function videoContentUrl(requestId: string) {
  const base = GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''
  return `${base}/videos/${encodeURIComponent(requestId)}/content`
}

/** 读取后端产物状态；旧环境缺字段时才回退到本地兼容推导。 */
export function getArtifactState(task: TaskItem, expired: boolean): TaskArtifactState | null {
  if (task.artifact_state) return task.artifact_state
  if (task.status === 'queued' || task.status === 'running') return 'generating'
  if (task.status === 'failed') return 'failed'
  if (expired) return 'expired'
  if (isTaskDone(task.status) && task.artifact_count === 0) return 'generating'
  if (isTaskDone(task.status)) return 'available'
  return null
}
