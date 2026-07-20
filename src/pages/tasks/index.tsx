import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LuSearch,
  LuClapperboard,
  LuImage,
  LuMusic,
  LuRefreshCw,
  LuVideoOff,
  LuDownload,
  LuLink,
  LuTriangleAlert,
  LuChevronDown,
  LuActivity,
  LuReceiptText,
  LuPackage,
} from 'react-icons/lu'
import { CopyButton } from '@/components/ui/CopyButton'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import { SideSheet } from '@/components/ui/SideSheet'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table'
import type { BadgeVariant } from '@/components/ui/Badge'
import { useAuthStore } from '@/store/auth'
import { listTasks, getTask } from '@/services/tasks'
import { listWorkspaces } from '@/services/workspaces'
import { listTenantMembers } from '@/services/tenants'
import { listApiKeys } from '@/services/api-keys'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { formatDateTime } from '@/lib/format-date'
import { trackEvent } from '@/lib/track'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import type { TaskItem, TaskDetail, TaskKind } from '@/types'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { Money } from '@/components/ui/Money'
import { VideoThumbnail } from './VideoThumbnail'
import { VideoPreviewModal } from './VideoPreviewModal'

// ─── 常量 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const REFRESH_INTERVAL = 10 // 列表可见倒计时刷新间隔（秒）
const EMPTY_TASK_ITEMS: TaskItem[] = []

// 状态词以 PRD 为准：running→「生成中」；去 cancelled（异步任务不支持取消）。
// 「已过期」不是后端状态，是产物 result_meta 过期派生的客户端筛选态（见 EXPIRED_FILTER）。
const STATUS_CONFIG: Record<string, { label: string; variant: BadgeVariant; dot: boolean }> = {
  queued:    { label: '排队中', variant: 'secondary', dot: true },
  running:   { label: '生成中', variant: 'info',      dot: true },
  succeeded: { label: '已完成', variant: 'success',   dot: false },
  completed: { label: '已完成', variant: 'success',   dot: false },
  failed:    { label: '失败',   variant: 'danger',    dot: false },
}

// 「已过期」为客户端派生筛选值（非后端 status），不下发后端、改走本地过滤
const EXPIRED_FILTER = 'expired'

const KIND_CONFIG: Record<TaskKind, { label: string; icon: React.ReactNode }> = {
  video: { label: '视频生成', icon: <LuClapperboard size={13} /> },
  image: { label: '图片生成', icon: <LuImage        size={13} /> },
  audio: { label: '音乐生成', icon: <LuMusic        size={13} /> },
}

// GET /async-tasks 只支持 preset 三档（1h/24h/7d），无 from/to 自定义区间——不做自定义日期选择器
const TIME_PRESET_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '不限时间', value: 'all' },
  { label: '近 1 小时', value: '1h' },
  { label: '近 24 小时', value: '24h' },
  { label: '近 7 天', value: '7d' },
]

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return formatDateTime(iso)
}

function fmtDuration(start: string | undefined, end: string | undefined) {
  if (!start || !end) return '—'
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  return `${secs} 秒`
}

/** 解析任务实际费用：后端返回 final_amount（decimal 字符串）；非数值返回 null */
function taskCost(item: TaskItem): number | null {
  if (item.final_amount == null) return null
  const n = Number.parseFloat(item.final_amount)
  return Number.isFinite(n) ? n : null
}

/** 渲染任务费用：失败已计费用 danger 色（语义：异常扣费），其余默认。
 *  排队/运行中或无费用返回「—」，不计费场景返回「无费用」。 */
function fmtCost(item: TaskItem): React.ReactNode {
  if (item.status === 'queued' || item.status === 'running') return '—'
  const amount = taskCost(item)
  if (amount == null) return '—'
  const tone = item.status === 'failed' && amount > 0 ? 'danger' : 'default'
  return <Money amount={amount} currency={item.currency} size="sm" tone={tone} />
}

function costHint(item: TaskItem): string | null {
  const amount = taskCost(item)
  if (item.status === 'failed' && amount != null && amount > 0)
    return '调用成功但生成失败，已消耗算力、按实际计费'
  if (item.status === 'failed' && !amount)
    return '上游调用失败，未进入生成、不计费'
  if (item.status === 'cancelled')
    return '排队中取消，未进入生成、不计费'
  return null
}

function resolveKind(item: TaskItem): TaskKind {
  if (item.kind) return item.kind
  const p = item.platform?.toLowerCase() ?? ''
  if (p.includes('image')) return 'image'
  if (p.includes('audio') || p.includes('music')) return 'audio'
  return 'video'
}

/** 任务是否处于成功完成态（后端实际返回 succeeded，旧枚举里写的是 completed，两者都兼容） */
function isTaskDone(status: string) {
  return status === 'succeeded' || status === 'completed'
}

/** 视频产物是否已过期（result_meta.result_expires_at 早于当前时间）。
 *  列表项(TaskItem)与详情(TaskDetail)均带同形 result_meta，可能为空时安全读取。 */
function isVideoExpired(item: TaskItem | TaskDetail | null | undefined): boolean {
  const expires = item?.result_meta?.result_expires_at
  if (!expires) return false
  return new Date(expires).getTime() < Date.now()
}

/** 产物有效期：基于 result_meta.result_expires_at。无 result_meta 返回 null（不展示）。 */
function resultExpiry(
  item: TaskItem | TaskDetail | null | undefined,
): { expired: boolean; urgent: boolean; expiresAt: string; remain: string } | null {
  const expiresAt = item?.result_meta?.result_expires_at
  if (!expiresAt) return null
  const t = new Date(expiresAt).getTime()
  if (Number.isNaN(t)) return null
  const ms = t - Date.now()
  if (ms <= 0) return { expired: true, urgent: false, expiresAt, remain: '' }
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  // 剩 1 天以内 = 紧急（列表飘红）
  return {
    expired: false,
    urgent: ms <= 86_400_000,
    expiresAt,
    remain: days > 0 ? `剩 ${days} 天` : hours > 0 ? `剩 ${hours} 小时` : '剩 <1 小时',
  }
}

/**
 * 视频产物地址：网关内容端点，凭 gateway_request_id 即可访问，
 * 服务端 302 重定向到真实 OSS 文件。无需鉴权，直接作为 <video src>。
 * 端点形如 https://api.test.modelgo.com/v1/videos/{id}/content
 */
function videoContentUrl(requestId: string) {
  const base = GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''
  return `${base}/videos/${encodeURIComponent(requestId)}/content`
}

// ─── 详情面板字段行 ───────────────────────────────────────────────────────────

function DetailRow({ label, value, hint, mono }: {
  label: string
  value: React.ReactNode
  hint?: string | null
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-[var(--mg-table-cell-py)] border-b border-mg-border/50 last:border-0">
      <span className="mg-text-caption font-semibold text-mg-text-3 shrink-0 w-20">{label}</span>
      <div className="flex-1 text-right">
        <span className={cn('mg-text-body text-mg-text-1', mono && 'font-mono mg-text-code')}>
          {value}
        </span>
        {hint && <p className="mg-text-caption text-mg-text-3 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

// ─── 详情：诊断指标卡（对齐同步调用详情 DiagnosticCard 视觉，需求方#165/#166） ──────────

type SummaryTone = 'brand' | 'success' | 'warning' | 'danger'
const SUMMARY_TONE: Record<SummaryTone, string> = {
  brand: 'bg-brand-base/10 text-brand-base',
  success: 'bg-mg-success/10 text-mg-success',
  warning: 'bg-mg-warning/10 text-mg-warning',
  danger: 'bg-mg-danger/10 text-mg-danger',
}

function SummaryCard({ icon, label, value, hint, tone = 'brand' }: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  hint?: string | null
  tone?: SummaryTone
}) {
  return (
    <article className="min-w-0 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-sm)]">
      <span className="flex items-center gap-1.5 mg-text-label text-mg-text-3">
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md [&_svg]:size-3', SUMMARY_TONE[tone])}>{icon}</span>
        {label}
      </span>
      <strong className="mt-1.5 block truncate mg-text-value font-bold text-mg-text-1">{value}</strong>
      {hint && <small className="mt-0.5 block truncate mg-text-caption text-mg-text-3">{hint}</small>}
    </article>
  )
}

/** 产物状态派生：可下载 / 生成中 / 生成失败 / 已过期 / —（对齐 PRD 异步任务详情）。 */
function artifactStatus(task: TaskItem, expired: boolean): { label: string; tone: SummaryTone } {
  if (task.status === 'queued' || task.status === 'running') return { label: '生成中', tone: 'brand' }
  if (task.status === 'failed') return { label: '生成失败', tone: 'danger' }
  if (expired) return { label: '已过期', tone: 'warning' }
  if (isTaskDone(task.status)) return { label: '可下载', tone: 'success' }
  return { label: '—', tone: 'brand' }
}

// ─── 详情抽屉 ─────────────────────────────────────────────────────────────────

function TaskDetailSheet({ task: listTask, onClose }: { task: TaskItem; onClose: () => void }) {
  const taskId = listTask.gateway_request_id
  const { data } = useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: () => getTask(taskId),
    enabled: !!taskId,
    refetchInterval: (q) => {
      const s = q.state.data?.task.status
      return s === 'queued' || s === 'running' ? 3000 : false
    },
  })

  // 归属名称解析：任务接口只返回 id，这里查工作空间/成员/Key 列表映射为名称；取不到回落到 id（静默降级）
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const wsId = listTask.workspace_id
  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => listWorkspaces().then((r) => r.items ?? []),
    staleTime: 60_000,
  })
  const { data: memberPage } = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
  })
  const { data: keyPage } = useQuery({
    queryKey: ['api-keys', wsId],
    queryFn: () => listApiKeys(wsId),
    enabled: !!wsId,
    staleTime: 60_000,
  })

  // 详情接口能成功就用详情数据，否则用列表项兜底——视频预览本就不依赖详情接口
  const task = data?.task ?? listTask
  const workspaceName = workspaces?.find((w) => w.workspace_id === task.workspace_id)?.name || task.workspace_id || '—'
  const apiKeyName = keyPage?.items.find((k) => k.api_key_id === task.api_key_id)?.name || task.api_key_id || '—'
  const memberName = memberPage?.items.find((m) => m.account.account_id === task.account_id)?.account.display_name || task.account_id || '—'
  const kind = resolveKind(task)
  const kindCfg = KIND_CONFIG[kind]
  const expired = isVideoExpired(task) || isVideoExpired(data)
  // 产物有效期：详情接口优先（result_meta 可能比列表项新），回落到列表项
  const expiry = resultExpiry(data) ?? resultExpiry(task)
  const isVideoTask = kind === 'video' && isTaskDone(task.status)
  // 无 result_meta 字段（空）= 按已过期算（与列表一致）
  const noMeta = isVideoTask && !data?.result_meta?.result_expires_at && !task.result_meta?.result_expires_at
  // 视频产物：成功态直接用网关 content 端点（凭 gateway_request_id，302 转 OSS）；过期/无字段则不展示
  const videoUrl = isVideoTask && !expired && !noMeta ? videoContentUrl(taskId) : null
  // 运行时兜底：result_meta 在有效期内但视频实际已被清理（404）→ 当作不可用
  const [videoUnavailable, setVideoUnavailable] = useState(false)
  const showVideo = !!videoUrl && !videoUnavailable
  const gone = (isVideoTask && (expired || noMeta)) || videoUnavailable

  // 产物元信息（#446）：后端未交付前统一占位「—」；有值才展示真实内容
  const rm = data?.result_meta ?? task.result_meta
  const artifactMeta = {
    filename: rm?.result_filename || '—',
    format: rm?.result_format || '—',
    resolution: rm?.result_resolution || '—',
    duration: rm?.result_duration_seconds ? `${rm.result_duration_seconds} 秒` : '—',
  }

  return (
    <SideSheet open onClose={onClose} width={560} title="异步任务详情">
        <div className="space-y-5 px-[var(--mg-space-1)] py-[var(--mg-control-py-sm)] mg-text-body">
          {(() => {
            // 派生：概览/摘要/任务信息用到的状态与文案（对齐 PRD 异步任务详情 §7.4.2）
            const statusLabel = STATUS_CONFIG[task.status]?.label ?? task.status
            const statusTone: SummaryTone = isTaskDone(task.status) ? 'success' : task.status === 'failed' ? 'danger' : 'brand'
            const art = artifactStatus(task, expired)
            const billing = task.billing_status
              ? (({ settled: '已结算', pending: '待结算', partial: '部分计费', unbilled: '未计费', none: '未计费' } as Record<string, string>)[task.billing_status] ?? task.billing_status)
              : '—'
            const costPending = task.status === 'queued' || task.status === 'running'
            return (
              <>
          {/* 头部 chips：任务类型、模型、状态（对齐 PRD，不展示供应商） */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-1">
              {kindCfg.icon}{kindCfg.label}
            </Badge>
            <Badge variant="outline" className="max-w-full truncate">{task.requested_model}</Badge>
            <StatusBadge status={task.status} statusMap={STATUS_CONFIG} />
            {task.from_image && <Badge variant="info">图生视频</Badge>}
          </div>

          {/* 诊断指标（Summary）：任务状态 / 实际费用 / 产物状态（对齐同步调用详情，需求方#165） */}
          <div className="grid grid-cols-3 gap-2">
            <SummaryCard
              icon={<LuActivity />}
              label="任务状态"
              value={statusLabel}
              hint={fmtDate(task.created_at)}
              tone={statusTone}
            />
            <SummaryCard
              icon={<LuReceiptText />}
              label="实际费用"
              value={costPending ? '待结算' : (task.status === 'failed' && !taskCost(task) ? '无费用' : fmtCost(task))}
              hint={billing}
              tone={costPending ? 'warning' : 'success'}
            />
            <SummaryCard
              icon={<LuPackage />}
              label="产物"
              value={art.label}
              hint={expiry && !expiry.expired ? expiry.remain : undefined}
              tone={art.tone}
            />
          </div>

          {/* 概览：模型、工作空间、API Key 名称、成员（顺序与同步调用一致，需求方#165） */}
          <div>
            <p className="mg-text-label text-mg-text-3 mb-2">概览</p>
            <div className="rounded-md border border-mg-border bg-mg-bg-0 px-[var(--mg-panel-padding-md)]">
              <DetailRow
                label="模型"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <ModelIcon
                      model={{ display_name: task.requested_model, vendor: task.vendor ?? undefined }}
                      size={18}
                      rounded="rounded-md"
                    />
                    <span className="font-mono">{task.requested_model}</span>
                  </span>
                }
              />
              <DetailRow label="工作空间" value={workspaceName} />
              <DetailRow label="API Key 名称" value={apiKeyName} />
              <DetailRow label="成员" value={memberName} />
              {(task.input_tokens != null || task.output_tokens != null) && (
                <DetailRow
                  label="Token 用量"
                  value={
                    <span className="mg-text-caption text-mg-text-2">
                      输入 <strong className="text-mg-text-1">{(task.input_tokens ?? 0).toLocaleString()}</strong>
                      {' · '}
                      输出 <strong className="text-mg-text-1">{(task.output_tokens ?? 0).toLocaleString()}</strong>
                    </span>
                  }
                />
              )}
            </div>
          </div>

          {/* 任务信息：任务 ID、提交时间、任务状态、产物状态、计费状态、实际费用、产物有效期 */}
          <div>
            <p className="mg-text-label text-mg-text-3 mb-2">任务信息</p>
            <div className="rounded-md border border-mg-border bg-mg-bg-0 px-[var(--mg-panel-padding-md)]">
              <DetailRow label="任务 ID" value={task.gateway_request_id} mono />
              <DetailRow label="提交时间" value={fmtDate(task.created_at)} />
              <DetailRow label="任务状态" value={statusLabel} />
              <DetailRow label="产物状态" value={art.label} />
              <DetailRow label="计费状态" value={billing} />
              <DetailRow
                label="实际费用"
                value={task.status === 'failed' && !taskCost(task) ? '无费用' : fmtCost(task)}
                hint={costHint(task)}
              />
              {expiry && (
                <DetailRow
                  label="产物有效期"
                  value={expiry.expired ? '已过期 · 已自动清理' : `至 ${fmtDate(expiry.expiresAt)} · ${expiry.remain}`}
                />
              )}
            </div>
          </div>
              </>
            )
          })()}

          {/* 生命周期：提交 → 结束 → 耗时 → 产物有效期 */}
          <div>
            <p className="mg-text-label text-mg-text-3 mb-2">生命周期</p>
            <div className="rounded-md border border-mg-border bg-mg-bg-0 px-[var(--mg-panel-padding-md)]">
              <DetailRow label="提交时间" value={fmtDate(task.created_at)} />
              <DetailRow label="结束时间" value={fmtDate(task.completed_at)} />
              <DetailRow label="耗时"     value={fmtDuration(task.created_at, task.completed_at)} />
              {expiry && (
                <DetailRow
                  label="产物有效期"
                  value={
                    expiry.expired ? (
                      <span className="text-mg-text-4">已过期 · 已自动清理</span>
                    ) : (
                      <span className="text-mg-text-2">
                        至 {fmtDate(expiry.expiresAt)} <span className="text-mg-text-3">· {expiry.remain}</span>
                      </span>
                    )
                  }
                  hint={expiry.expired ? undefined : '产物到期后自动清理，平台不长期存储'}
                />
              )}
            </div>
          </div>

          {/* 产物预览：视频任务成功态，直接用网关 content 端点播放 */}
          {showVideo && (
            <div className="rounded-md border border-mg-border bg-mg-bg-0 mg-panel-tight">
              <p className="mg-text-label text-mg-text-3 mb-2">产物预览</p>
              <video
                key={videoUrl}
                src={videoUrl ?? undefined}
                controls
                preload="metadata"
                playsInline
                className="w-full rounded-lg bg-black max-h-72"
                onError={() => setVideoUnavailable(true)}
              />
            </div>
          )}

          {/* 产物信息：文件名/格式/分辨率/时长 —— TODO(#446) 后端未交付，缺省占位「—」 */}
          {showVideo && (
            <div>
              <p className="mg-text-label text-mg-text-3 mb-2">产物信息</p>
              <div className="rounded-md border border-mg-border bg-mg-bg-0 px-[var(--mg-panel-padding-md)]">
                <DetailRow label="文件名" value={artifactMeta.filename} mono />
                <DetailRow label="格式" value={artifactMeta.format} />
                <DetailRow label="分辨率" value={artifactMeta.resolution} />
                <DetailRow label="时长" value={artifactMeta.duration} />
              </div>
            </div>
          )}

          {/* 产物链接 + 下载 */}
          {showVideo && (
            <div className="rounded-md border border-mg-border bg-mg-bg-0 mg-panel space-y-2.5">
              <p className="mg-text-label text-mg-text-3">产物链接</p>
              <div className="group flex w-full items-center gap-2 rounded-lg border border-mg-border bg-mg-fill-0/40 px-[var(--mg-control-px-sm)] py-[var(--mg-control-py-sm)] text-left transition-colors hover:border-brand-base/40">
                <LuLink size={13} className="shrink-0 text-mg-text-4" />
                <span className="flex-1 truncate mg-text-code text-mg-text-2" title={videoUrl}>
                  {videoUrl}
                </span>
                <CopyButton value={videoUrl} aria-label="复制链接" toast="链接已复制" className="h-5 w-5 shrink-0" />
              </div>
              <a
                href={videoUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent('logs_artifact_download', { record_type: 'async', kind, source: 'detail' })}
                className="inline-flex w-full items-center justify-center gap-1.5 mg-control-md rounded-lg bg-mg-primary text-white mg-text-body font-semibold transition-opacity hover:opacity-90"
              >
                <LuDownload size={14} />
                下载
              </a>
              <p className="flex items-start gap-1.5 mg-text-caption text-[var(--mg-warning)]">
                <LuTriangleAlert size={13} className="shrink-0 mt-0.5" />
                <span>
                  视频地址有有效期{expiry ? `（至 ${fmtDate(expiry.expiresAt)}，${expiry.remain}）` : ''}，
                  过期后平台不再保留，请尽快下载保存到本地。
                </span>
              </p>
            </div>
          )}

          {/* 产物已过期 / 已被清理 */}
          {gone && kind === 'video' && isTaskDone(task.status) && (
            <div className="rounded-md border border-mg-border bg-mg-bg-0 mg-panel-relaxed flex flex-col items-center gap-2 text-mg-text-4">
              <LuVideoOff size={32} />
              <p className="mg-text-body font-semibold">产物已过期</p>
              <p className="mg-text-caption text-mg-text-3">视频文件已自动清理，不支持预览与下载</p>
            </div>
          )}

          {/* 失败原因 */}
          {task.status === 'failed' && task.error_message && (
            <div className="rounded-md border border-[var(--mg-danger)]/20 bg-[var(--mg-danger)]/5 mg-panel">
              <p className="mg-text-label text-[var(--mg-danger)] mb-1.5">失败原因</p>
              <p className="mg-text-caption text-mg-text-2">{task.error_message}</p>
            </div>
          )}
        </div>
    </SideSheet>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

/**
 * 异步任务面板（#361）：从原「任务历史」页抽出，内嵌到「调用日志」页的「异步任务」记录类型下。
 * 视图范围沿用调用日志：mine=按当前账号裁剪；enterprise/space=租户/空间范围（服务端权威裁剪）。
 */
export function AsyncTasksPanel({ view, currentAccountId, initialTaskId, refreshRef, onFetchingChange }: {
  view: 'enterprise' | 'mine' | 'space'
  currentAccountId?: string
  initialTaskId?: string
  /** 刷新桥（#46）：把刷新动作/态提给页头，让同步/异步刷新按钮一致。 */
  refreshRef?: React.MutableRefObject<() => void>
  onFetchingChange?: (fetching: boolean) => void
}) {
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''

  // ?task_id= 下钻（#14）：初始搜索落到该任务，命中后经下方自动展开详情
  const [search, setSearch]         = useState(initialTaskId ?? '')
  const debouncedSearch             = useDebouncedValue(search.trim(), 350)
  const [statusFilter, setStatus]   = useState('all')
  const [kindFilter, setKind]       = useState('all')
  const [presetFilter, setPreset]   = useState('7d') // 默认近 7 天（对齐 PRD，去 all）
  const [workspaceFilter, setWorkspace] = useState('all')
  const [apiKeyFilter, setApiKey]   = useState('all')
  const [memberFilter, setMember]   = useState('all')
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [offset, setOffset]         = useState(0)
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  // 视频 404（无 result_meta 的老任务，产物已被清理）：列表据此显示「已过期」文案
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set())

  // 更多筛选取数：工作空间 / 成员 / API Key（API Key 归属具体空间，跟随工作空间筛选）
  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => listWorkspaces().then((r) => r.items ?? []),
    staleTime: 5 * 60_000,
  })
  const { data: memberPage } = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  })
  const apiKeyWorkspaceId = workspaceFilter === 'all' ? undefined : workspaceFilter
  const { data: keyPage } = useQuery({
    queryKey: ['api-keys', apiKeyWorkspaceId],
    queryFn: () => listApiKeys(apiKeyWorkspaceId!),
    enabled: !!apiKeyWorkspaceId,
    staleTime: 60_000,
  })

  const params = useMemo(() => ({
    // 「我的视图」锁当前账号；企业/空间视图用「成员」筛选（默认全部，服务端按角色/负责空间裁剪）
    account_id: view === 'mine' ? currentAccountId || undefined : memberFilter === 'all' ? undefined : memberFilter,
    workspace_id: workspaceFilter === 'all' ? undefined : workspaceFilter,
    api_key_id: apiKeyFilter === 'all' ? undefined : apiKeyFilter,
    // 「已过期」是客户端派生筛选，不下发后端；其余为后端真实 status
    status: statusFilter !== 'all' && statusFilter !== EXPIRED_FILTER ? statusFilter : undefined,
    preset: presetFilter !== 'all' ? (presetFilter as '1h' | '24h' | '7d') : undefined,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset,
  }), [statusFilter, presetFilter, debouncedSearch, offset, view, currentAccountId, workspaceFilter, apiKeyFilter, memberFilter])

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['tasks', tenantId, params],
    queryFn: () => listTasks(params),
    // 每 10s 后台静默自动刷新（见下方 countdown 计时器）；手动刷新走页头刷新按钮（#46）
  })

  // 后台自动刷新：每 10s 自动刷新一次（计时不再外显），手动刷新会重置倒计时
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL)
  useEffect(() => {
    // setState 全部放进 setTimeout 回调（异步），不在 effect 体内同步触发
    const id = setTimeout(() => {
      if (countdown <= 1) {
        void refetch()
        setCountdown(REFRESH_INTERVAL)
      } else {
        setCountdown(countdown - 1)
      }
    }, 1000)
    return () => clearTimeout(id)
  }, [countdown, refetch])

  const handleRefresh = useCallback(() => {
    void refetch()
    setCountdown(REFRESH_INTERVAL)
  }, [refetch])

  // 刷新桥（#46）：刷新动作与 loading 态上报给页头刷新按钮；卸载时复位。
  useEffect(() => {
    if (refreshRef) refreshRef.current = handleRefresh
  }, [refreshRef, handleRefresh])
  useEffect(() => { onFetchingChange?.(isFetching) }, [isFetching, onFetchingChange])
  useEffect(() => () => onFetchingChange?.(false), [onFetchingChange])

  const items  = data?.items ?? EMPTY_TASK_ITEMS
  const total  = data?.total ?? 0
  const pages  = Math.ceil(total / PAGE_SIZE)
  const page   = Math.floor(offset / PAGE_SIZE) + 1

  const handleSearch = (v: string) => { setSearch(v); setOffset(0); if (v.trim()) trackEvent('logs_search', { record_type: 'async' }) }
  const handleStatus = (v: string) => { setStatus(v); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'status', value: v }) }
  const handleKind   = (v: string) => { setKind(v);   setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'kind', value: v }) }
  const handlePreset = (v: string) => { setPreset(v); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'preset', value: v }) }
  const handleWorkspace = (v: string) => { setWorkspace(v); setApiKey('all'); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'workspace' }) }
  const handleApiKey = (v: string) => { setApiKey(v); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'api_key' }) }
  const handleMember = (v: string) => { setMember(v); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'member' }) }

  const hasActiveFilters =
    !!search.trim() || statusFilter !== 'all' || kindFilter !== 'all' ||
    presetFilter !== '7d' || workspaceFilter !== 'all' || apiKeyFilter !== 'all' || memberFilter !== 'all'

  function clearFilters() {
    setSearch(''); setStatus('all'); setKind('all'); setPreset('7d')
    setWorkspace('all'); setApiKey('all'); setMember('all'); setOffset(0)
  }

  const openDetail = (item: TaskItem) => {
    setSelectedTask(item)
    trackEvent('logs_detail_view', { record_type: 'async', kind: resolveKind(item), status: item.status })
  }

  const filteredItems = useMemo(() => {
    let list = kindFilter === 'all' ? items : items.filter((t) => resolveKind(t) === kindFilter)
    // 「已过期」为客户端派生态：仅保留已过期的视频产物任务
    if (statusFilter === EXPIRED_FILTER) {
      list = list.filter((t) => {
        const done = isTaskDone(t.status) && resolveKind(t) === 'video'
        return done && (isVideoExpired(t) || !t.result_meta?.result_expires_at || expiredIds.has(t.gateway_request_id))
      })
    }
    return list
  }, [items, kindFilter, statusFilter, expiredIds])

  // ?task_id= 下钻（#14）：数据到位后按 gateway_request_id 精确匹配自动展开任务详情，一次性
  const taskAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (taskAutoOpenedRef.current || !initialTaskId) return
    const match = items.find((t) => t.gateway_request_id === initialTaskId)
    if (match) {
      taskAutoOpenedRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL 带 task_id 时数据到位后一次性打开任务详情（taskAutoOpenedRef 幂等）
      setSelectedTask(match)
      trackEvent('logs_detail_view', { record_type: 'async', kind: resolveKind(match), status: match.status, source: 'url_task_id' })
    }
  }, [items, initialTaskId])

  return (
    <div className="space-y-4">
      {/* 筛选区白卡：与同步调用一致的卡片底色/容器（需求方#166），不再让筛选裸露在页面灰底上 */}
      <section className="space-y-4 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
      {/* 筛选栏（记录类型=异步任务：首屏筛选 搜索/类型/状态 + 右侧计数；刷新按钮在页头） */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <LuSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mg-text-3 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索任务 ID / 模型"
            className="mg-control-md w-60 rounded-lg border border-mg-border bg-mg-fill-0 pl-8 pr-3 mg-text-body focus:border-brand-base focus:outline-none focus:ring-1 focus:ring-brand-glow/30 text-mg-text-1 placeholder:text-mg-text-3"
          />
        </div>

        <Select value={presetFilter} onChange={handlePreset} className="mg-control-md w-32 mg-text-body">
          {TIME_PRESET_OPTIONS.map((option) => (
            <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
          ))}
        </Select>

        <Select value={kindFilter} onChange={handleKind} className="mg-control-md w-32 mg-text-body">
          <Select.Option value="all">全部类型</Select.Option>
          <Select.Option value="video">视频生成</Select.Option>
          <Select.Option value="image">图片生成</Select.Option>
          <Select.Option value="audio">音乐生成</Select.Option>
        </Select>

        <Select value={statusFilter} onChange={handleStatus} className="mg-control-md w-32 mg-text-body">
          <Select.Option value="all">全部状态</Select.Option>
          <Select.Option value="queued">排队中</Select.Option>
          <Select.Option value="running">生成中</Select.Option>
          <Select.Option value="completed">已完成</Select.Option>
          <Select.Option value="failed">失败</Select.Option>
          <Select.Option value={EXPIRED_FILTER}>已过期</Select.Option>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMoreFilters((v) => !v)}
        >
          <LuChevronDown size={14} className={cn('transition-transform', showMoreFilters && 'rotate-180')} />
          更多筛选
        </Button>

        {/* 刷新按钮已上移到页头（#46，与同步调用一致）；此处保留计数，自动刷新在后台静默进行。 */}
        {total > 0 && (
          <span className="ml-auto mg-text-caption text-mg-text-3">共 {total} 条</span>
        )}
      </div>

      {/* 更多筛选：工作空间 / API Key / 成员（API Key 归属具体空间，跟随工作空间筛选）
          TODO(#446): 产物状态 / 计费状态筛选依赖后端 #446 交付后补入 */}
      {showMoreFilters && (
        <div className="flex items-end gap-3 flex-wrap border-t border-mg-border pt-4">
          <label className="flex flex-col gap-1.5">
            <span className="mg-text-label text-mg-text-3">工作空间</span>
            <Select value={workspaceFilter} onChange={handleWorkspace} className="mg-control-md w-44 mg-text-body">
              <Select.Option value="all">全部工作空间</Select.Option>
              {(workspacesData ?? []).map((w) => (
                <Select.Option key={w.workspace_id} value={w.workspace_id}>{w.name}</Select.Option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="mg-text-label text-mg-text-3">API Key</span>
            <Select value={apiKeyFilter} disabled={!apiKeyWorkspaceId} onChange={handleApiKey} className="mg-control-md w-44 mg-text-body">
              <Select.Option value="all">{apiKeyWorkspaceId ? '全部 API Key' : '先选择工作空间'}</Select.Option>
              {(keyPage?.items ?? []).map((k) => (
                <Select.Option key={k.api_key_id} value={k.api_key_id}>{k.name}</Select.Option>
              ))}
            </Select>
          </label>
          {view !== 'mine' && (
            <label className="flex flex-col gap-1.5">
              <span className="mg-text-label text-mg-text-3">成员</span>
              <Select value={memberFilter} onChange={handleMember} className="mg-control-md w-44 mg-text-body">
                <Select.Option value="all">全部成员</Select.Option>
                {(memberPage?.items ?? []).map((m) => (
                  <Select.Option key={m.account.account_id} value={m.account.account_id}>
                    {m.account.display_name || m.account.email}
                  </Select.Option>
                ))}
              </Select>
            </label>
          )}
        </div>
      )}
      </section>

      {/* 提示条：只放唯一注意事项（有效期/保存），不与页头描述重复 */}
      <p className="flex items-start gap-1.5 mg-text-caption text-[var(--mg-warning)] px-1">
        <LuTriangleAlert size={13} className="shrink-0 mt-0.5" />
        <span>视频产物有有效期（见各任务「产物有效期」），过期后平台不再保留，请及时下载保存到本地。</span>
      </p>

      {/* 表格 */}
      <div className="rounded-md border border-mg-border bg-mg-bg-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead align="center" className="w-20">预览</TableHead>
              <TableHead align="center">提交时间</TableHead>
              <TableHead align="center">类型</TableHead>
              <TableHead align="center">模型</TableHead>
              <TableHead align="center">状态</TableHead>
              <TableHead align="center">实际费用</TableHead>
              <TableHead align="center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <EmptyState colSpan={7} title="加载中…" />
            )}
            {/* 接口失败不降级空态：明确报错 + 重试入口 */}
            {isError && !isLoading && (
              <EmptyState
                colSpan={7}
                icon={<LuTriangleAlert />}
                title="加载失败"
                description="任务列表拉取出错，请检查网络后重试。"
                action={
                  <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <LuRefreshCw size={13} className={cn(isFetching && 'animate-spin')} />
                    重试
                  </Button>
                }
              />
            )}
            {/* 空态分型：有筛选=筛选无结果（给清除入口）；无筛选=真正暂无任务 */}
            {!isLoading && !isError && filteredItems.length === 0 && (
              hasActiveFilters ? (
                <EmptyState
                  colSpan={7}
                  title="没有符合条件的任务"
                  description="当前筛选条件下没有任务，试试放宽或清除筛选。"
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>清除筛选</Button>
                  }
                />
              ) : (
                <EmptyState
                  colSpan={7}
                  icon={<LuClapperboard />}
                  title="暂无异步任务"
                  description="发起视频、图片或音乐等异步生成任务后，会在这里显示状态、费用和产物。"
                />
              )
            )}
            {filteredItems.map((item) => {
              const kind    = resolveKind(item)
              const kindCfg = KIND_CONFIG[kind]
              const expiry  = resultExpiry(item)
              const isVideoTask = kind === 'video' && isTaskDone(item.status)
              // 过期 = 元数据已过期 ∪ 无 result_meta 字段（空＝按已过期算）∪ 运行时 404
              const isExpired =
                isVideoExpired(item) ||
                (isVideoTask && !item.result_meta?.result_expires_at) ||
                expiredIds.has(item.gateway_request_id)
              // 仅未过期的已完成视频任务有可播放/可抓帧的地址
              const videoUrl = isVideoTask && !isExpired
                ? videoContentUrl(item.gateway_request_id)
                : null
              return (
                <TableRow
                  key={item.gateway_request_id}
                  className="cursor-pointer hover:bg-mg-fill-0/50 transition-colors"
                  onClick={() => openDetail(item)}
                >
                  <TableCell align="center">
                    {isExpired ? (
                      <div className="h-[var(--mg-preview-thumb-size)] w-[var(--mg-preview-thumb-size)] shrink-0 rounded-lg mx-auto flex items-center justify-center bg-mg-fill-1 text-mg-text-4" title="产物已过期">
                        <LuVideoOff size={20} />
                      </div>
                    ) : (
                      <VideoThumbnail
                        taskId={item.gateway_request_id}
                        videoUrl={videoUrl}
                        placeholder={kindCfg.icon}
                        onPreview={setPreviewUrl}
                        onExpired={() =>
                          setExpiredIds((prev) =>
                            prev.has(item.gateway_request_id) ? prev : new Set(prev).add(item.gateway_request_id),
                          )
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell align="center" className="mg-text-caption text-mg-text-2">
                    {fmtDate(item.created_at)}
                    {(expiry || isExpired) && (
                      <p
                        className={cn(
                          'mg-text-caption mt-0.5',
                          isExpired
                            ? 'text-[var(--mg-warning)]'        // 已过期 → 黄
                            : expiry?.urgent
                              ? 'text-[var(--mg-danger)]'        // 剩 ≤1 天 → 红
                              : 'text-mg-text-3',
                        )}
                      >
                        {isExpired ? '产物已过期' : `产物有效 ${expiry?.remain}`}
                      </p>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <span className="inline-flex items-center gap-1.5 mg-text-caption text-mg-text-2">
                      {kindCfg.icon}
                      {kindCfg.label}
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <span className="inline-flex items-center gap-1.5 max-w-[220px] mx-auto truncate">
                      <ModelIcon
                        model={{ display_name: item.requested_model, vendor: item.vendor ?? undefined }}
                        size={18}
                        rounded="rounded-md"
                        className="shrink-0"
                      />
                      <p className="mg-text-code text-mg-text-1 truncate">
                        {item.requested_model}
                      </p>
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge status={item.status} statusMap={STATUS_CONFIG} />
                  </TableCell>
                  <TableCell align="center">
                    <span className="mg-text-body font-semibold inline-flex items-center">
                      {fmtCost(item)}
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <div className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openDetail(item)
                        }}
                        className="mg-text-caption text-mg-text-3 hover:text-mg-text-1 font-semibold transition-colors"
                      >
                        详情
                      </button>
                      {/* 下载：仅未过期的已完成视频产物可用；未完成/生成中/失败/过期置灰（TODO(#446) 图片/音乐产物地址待后端交付） */}
                      <button
                        type="button"
                        disabled={!videoUrl}
                        title={videoUrl ? '下载产物' : '产物不可下载（未完成 / 生成中 / 失败 / 已过期）'}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!videoUrl) return
                          const a = document.createElement('a')
                          a.href = videoUrl
                          a.download = ''
                          a.target = '_blank'
                          a.rel = 'noopener noreferrer'
                          a.click()
                          trackEvent('logs_artifact_download', { record_type: 'async', kind, source: 'list' })
                        }}
                        className={cn(
                          'inline-flex items-center gap-1 mg-text-caption font-semibold transition-colors',
                          videoUrl
                            ? 'text-brand-base hover:text-brand-deep'
                            : 'text-mg-text-4 cursor-not-allowed',
                        )}
                      >
                        <LuDownload size={13} />
                        下载
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {pages > 1 && (
        <div className="flex items-center justify-between mg-text-caption text-mg-text-3">
          <span>第 {page} / {pages} 页</span>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              上一页
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 详情抽屉 */}
      {selectedTask && (
        <TaskDetailSheet key={selectedTask.gateway_request_id} task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}

      {/* 视频预览弹窗（列表点缩略图触发） */}
      <VideoPreviewModal
        open={!!previewUrl}
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
      />
    </div>
  )
}
