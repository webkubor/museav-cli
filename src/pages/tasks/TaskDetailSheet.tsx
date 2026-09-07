import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  LuActivity,
  LuReceiptText,
  LuPackage,
  LuDownload,
  LuLink,
  LuTriangleAlert,
  LuVideoOff,
} from 'react-icons/lu'
import { CopyButton } from '@/components/ui/CopyButton'
import { Badge } from '@/components/ui/Badge'
import { SideSheet } from '@/components/ui/SideSheet'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuthStore } from '@/store/auth'
import { getTask } from '@/services/tasks'
import { listWorkspaces } from '@/services/workspaces'
import { listTenantMembers } from '@/services/tenants'
import { listApiKeys } from '@/services/api-keys'
import { trackEvent } from '@/lib/track'
import { cn } from '@/lib/utils'
import type { TaskItem, TaskStatusTimestamps } from '@/types'
import { getSnapshotLifecycleEvents } from './lifecycle'
import { artifactSummary } from './artifact-summary'
import { statusConfig, kindConfig, fmtDate, taskCost, fmtCost, costHint, resolveKind, isTaskDone, isVideoExpired, resultExpiry, videoContentUrl, getArtifactState } from './task-list-utils'

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

/** 产物状态展示：优先使用接口 artifact_state，兼容旧接口的派生结果。 */
function artifactStatus(task: TaskItem, expired: boolean, t: TFunction<'tasks'>): { label: string; tone: SummaryTone } {
  const state = getArtifactState(task, expired)
  if (state === 'generating') return { label: t('artifactState.generating'), tone: 'brand' }
  if (state === 'failed') return { label: t('artifactState.failed'), tone: 'danger' }
  if (state === 'expired') return { label: t('artifactState.expired'), tone: 'warning' }
  if (state === 'available') return { label: t('artifactState.available'), tone: 'success' }
  return { label: '—', tone: 'brand' }
}

interface LifecycleEvent {
  time: string
  label: string
  note: string
  tone: SummaryTone
}

/** 基于后端真实时间字段生成生命周期，缺少中间态时不虚构时间。 */
function getLifecycleEvents(task: TaskItem, t: TFunction<'tasks'>, statusTimestamps?: TaskStatusTimestamps): LifecycleEvent[] {
  const snapshotEvents = getSnapshotLifecycleEvents(statusTimestamps, t)
  if (snapshotEvents.length > 0) {
    return snapshotEvents.map((event) => ({ ...event, time: fmtDate(event.time) }))
  }

  const events: LifecycleEvent[] = [{
    time: fmtDate(task.created_at),
    label: t('lifecycle.submitted'),
    note: t('lifecycle.submittedNote'),
    tone: 'brand',
  }]
  if (task.status === 'queued' || task.status === 'running') {
    events.push({
      time: fmtDate(task.updated_at),
      label: task.status === 'queued' ? t('lifecycle.queued') : t('lifecycle.running'),
      note: task.status === 'queued' ? t('lifecycle.queuedSimpleNote') : t('lifecycle.runningNote'),
      tone: 'brand',
    })
  }
  if (isTaskDone(task.status)) {
    events.push({ time: fmtDate(task.completed_at), label: t('lifecycle.completed'), note: t('lifecycle.completedNote'), tone: 'success' })
  }
  if (task.status === 'failed') {
    events.push({ time: fmtDate(task.updated_at), label: t('lifecycle.failed'), note: task.error_message || t('lifecycle.failedNote'), tone: 'danger' })
  }
  return events
}

// ─── 详情抽屉 ─────────────────────────────────────────────────────────────────

export function TaskDetailSheet({ task: listTask, onClose }: { task: TaskItem; onClose: () => void }) {
  const { t } = useTranslation('tasks')
  const statusMap = statusConfig(t)
  const kindMap = kindConfig(t)
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
    queryFn: () => listWorkspaces(),
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
  // `items` 由 getPage 在请求边界保证是数组；这里的 `?.` 只处理 react-query 加载中的 undefined
  const apiKeyName = keyPage?.items.find((k) => k.api_key_id === task.api_key_id)?.name || task.api_key_id || '—'
  const memberName = memberPage?.items.find((m) => m.account.account_id === task.account_id)?.account.display_name || task.account_id || '—'
  const kind = resolveKind(task)
  const kindCfg = kindMap[kind]
  const expired = isVideoExpired(task) || isVideoExpired(data)
  const artifactState = getArtifactState(task, expired)
  // 产物有效期：详情接口优先（result_meta 可能比列表项新），回落到列表项
  const expiry = resultExpiry(data, t) ?? resultExpiry(task, t)
  const isVideoTask = kind === 'video' && isTaskDone(task.status) && artifactState === 'available'
  // 视频产物：仅在服务端确认可用且未过期时访问网关内容端点。
  const videoUrl = isVideoTask && !expired ? videoContentUrl(taskId) : null
  // 运行时兜底：result_meta 在有效期内但视频实际已被清理（404）→ 当作不可用
  const [videoUnavailable, setVideoUnavailable] = useState(false)
  const showVideo = !!videoUrl && !videoUnavailable
  const gone = (isVideoTask && expired) || videoUnavailable

  // 产物元信息（#446）：后端未交付前统一占位「—」；有值才展示真实内容
  const rm = data?.result_meta ?? task.result_meta
  const artifactMeta = {
    filename: rm?.result_filename || '—',
    format: rm?.result_format || '—',
    resolution: rm?.result_resolution || '—',
    duration: rm?.result_duration_seconds ? t('duration.seconds', { count: rm.result_duration_seconds }) : '—',
  }
  const requestSummary = artifactSummary(data?.request_summary)
  const artifactTechnicalSummary = [artifactMeta.format, artifactMeta.resolution, artifactMeta.duration]
    .filter((value) => value !== '—')
    .join(' · ')
  const lifecycleEvents = getLifecycleEvents(
    task,
    t,
    data?.result_meta?.status_timestamps ?? task.result_meta?.status_timestamps,
  )

  return (
    <SideSheet open onClose={onClose} title={t('detail.title')}>
        <div className="space-y-5 px-[var(--mg-space-1)] py-[var(--mg-control-py-sm)] mg-text-body">
          {(() => {
            // 派生：概览/摘要/任务信息用到的状态与文案（对齐 PRD 异步任务详情 §7.4.2）
            const statusLabel = statusMap[task.status]?.label ?? task.status
            const statusTone: SummaryTone = isTaskDone(task.status) ? 'success' : task.status === 'failed' ? 'danger' : 'brand'
            const art = artifactStatus(task, expired, t)
            const billingState = task.billing_state ?? task.billing_status
            const billing = billingState
              ? (({
                  settled: t('billingState.settled'),
                  pending: t('billingState.pending'),
                  partial: t('billingState.partial'),
                  unbilled: t('billingState.unbilled'),
                  none: t('billingState.none'),
                  billed: t('billingState.billed'),
                } as Record<string, string>)[billingState] ?? billingState)
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
            <StatusBadge status={task.status} statusMap={statusMap} />
            {task.from_image && <Badge variant="info">{t('kind.fromImage')}</Badge>}
          </div>

          {/* 诊断指标（Summary）：任务状态 / 实际费用 / 产物状态（对齐同步调用详情，需求方#165） */}
          <div className="grid grid-cols-3 gap-2">
            <SummaryCard
              icon={<LuActivity />}
              label={t('detail.taskStatus')}
              value={statusLabel}
              hint={fmtDate(task.created_at)}
              tone={statusTone}
            />
            <SummaryCard
              icon={<LuReceiptText />}
              label={t('columns.cost')}
              value={costPending ? t('cost.pending') : (task.status === 'failed' && !taskCost(task) ? t('cost.noCharge') : fmtCost(task))}
              hint={billing}
              tone={costPending ? 'warning' : 'success'}
            />
            <SummaryCard
              icon={<LuPackage />}
              label={t('detail.artifact')}
              value={art.label}
              hint={expiry && !expiry.expired ? expiry.remain : undefined}
              tone={art.tone}
            />
          </div>

          {/* 概览：模型、工作空间、API Key 名称、成员（顺序与同步调用一致，需求方#165） */}
          <div>
            <p className="mg-text-label text-mg-text-3 mb-2">{t('detail.overview')}</p>
            <div className="rounded-md border border-mg-border bg-mg-bg-0 px-[var(--mg-panel-padding-md)]">
              {/* 需求方#181：异步任务详情模型名前不带图标（对齐同步调用详情概览） */}
              <DetailRow
                label={t('columns.model')}
                value={<span className="font-mono">{task.requested_model}</span>}
              />
              <DetailRow label={t('detail.workspace')} value={workspaceName} />
              <DetailRow label={t('detail.apiKeyName')} value={apiKeyName} />
              <DetailRow label={t('detail.member')} value={memberName} />
            </div>
          </div>

          {/* 任务信息：任务 ID、提交时间、任务状态、产物状态、计费状态、实际费用、产物有效期 */}
          <div>
            <p className="mg-text-label text-mg-text-3 mb-2">{t('detail.taskInfo')}</p>
            <div className="rounded-md border border-mg-border bg-mg-bg-0 px-[var(--mg-panel-padding-md)]">
              <DetailRow label={t('detail.taskId')} value={task.gateway_request_id} mono />
              <DetailRow label={t('columns.createdAt')} value={fmtDate(task.created_at)} />
              <DetailRow label={t('detail.taskStatus')} value={statusLabel} />
              <DetailRow label={t('detail.artifactState')} value={art.label} />
              <DetailRow label={t('detail.billingState')} value={billing} />
              <DetailRow
                label={t('columns.cost')}
                value={task.status === 'failed' && !taskCost(task) ? t('cost.noCharge') : fmtCost(task)}
                hint={costHint(task, t)}
              />
              {expiry && (
                <DetailRow
                  label={t('detail.artifactExpiry')}
                  value={expiry.expired ? t('artifact.expiredAutoCleaned') : t('artifact.expiresAt', { time: fmtDate(expiry.expiresAt), remain: expiry.remain })}
                />
              )}
            </div>
          </div>
              </>
            )
          })()}

          {/* 生命周期：只展示接口已提供的真实节点，结构对齐 PRD 时间线 */}
          <div>
            <p className="mg-text-label text-mg-text-3 mb-2">{t('detail.lifecycle')}</p>
            <div className="rounded-md border border-mg-border bg-mg-bg-0 px-[var(--mg-panel-padding-md)] py-1">
              {lifecycleEvents.map((event, index) => (
                <div key={`${event.label}-${event.time}`} className="flex gap-3 py-3">
                  <div className="flex w-4 shrink-0 flex-col items-center">
                    <span className={cn(
                      'mt-1 h-2.5 w-2.5 rounded-full',
                      event.tone === 'success' ? 'bg-mg-success' : event.tone === 'danger' ? 'bg-mg-danger' : 'bg-brand-base',
                    )} />
                    {index < lifecycleEvents.length - 1 && <span className="mt-1 w-px flex-1 bg-mg-border" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <strong className="mg-text-body text-mg-text-1">{event.label}</strong>
                      <time className="mg-text-caption text-mg-text-3">{event.time}</time>
                    </div>
                    <p className="mt-0.5 mg-text-caption text-mg-text-3">{event.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 产物：预览、元信息和下载动作合并为 PRD 单张产物卡 */}
          <div>
            <p className="mg-text-label text-mg-text-3 mb-2">{t('detail.artifact')}</p>
            <article className="overflow-hidden rounded-md border border-mg-border bg-mg-bg-0">
              {showVideo ? (
                <video
                  key={videoUrl}
                  src={videoUrl ?? undefined}
                  controls
                  preload="metadata"
                  playsInline
                  className="max-h-72 w-full bg-mg-fill-1 object-contain"
                  onError={() => setVideoUnavailable(true)}
                />
              ) : (
                <div className="flex h-36 items-center justify-center bg-mg-fill-1 text-mg-text-4">
                  <LuPackage size={28} />
                </div>
              )}
              <div className="space-y-3 p-[var(--mg-panel-padding-md)]">
                <div>
                  <strong className="block truncate mg-text-body text-mg-text-1">
                    {artifactMeta.filename === '—' ? t('artifact.file') : artifactMeta.filename}
                  </strong>
                  <span className="mg-text-caption text-mg-text-3">
                    {requestSummary || artifactTechnicalSummary || t('artifact.infoUnavailable')}
                  </span>
                </div>
                {expiry && (
                  <p className="mg-text-caption text-mg-text-3">
                    {t('artifact.resultExpiry', {
                      value: expiry.expired
                        ? t('artifact.expiredAutoCleaned')
                        : `${fmtDate(expiry.expiresAt)} · ${expiry.remain}`,
                    })}
                  </p>
                )}
                {showVideo && videoUrl && (
                  <>
                    <div className="flex items-center gap-2 rounded-md border border-mg-border bg-mg-fill-0/40 px-[var(--mg-control-pad-x-sm)] py-[var(--mg-control-py-sm)]">
                      <LuLink size={13} className="shrink-0 text-mg-text-4" />
                      <span className="flex-1 truncate mg-text-code text-mg-text-2" title={videoUrl}>{videoUrl}</span>
                      <CopyButton value={videoUrl} aria-label={t('detail.copyLink')} toast={t('detail.copySuccess')} className="h-5 w-5 shrink-0" />
                    </div>
                    <a
                      href={videoUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackEvent('logs_artifact_download', { record_type: 'async', kind, source: 'detail' })}
                      className="inline-flex w-full items-center justify-center gap-1.5 mg-control-md rounded-md bg-mg-primary text-white mg-text-body font-semibold transition-opacity hover:opacity-90"
                    >
                      <LuDownload size={14} />
                      {t('buttons.download')}
                    </a>
                  </>
                )}
                {expiry && !expiry.expired && <p className="flex items-start gap-1.5 mg-text-caption text-[var(--mg-warning)]"><LuTriangleAlert size={13} className="mt-0.5 shrink-0" /><span>{t('artifact.preservationWarning')}</span></p>}
              </div>
            </article>
          </div>

          {/* 产物已过期 / 已被清理。
              **限 kind === 'video' 是对的，不要"对齐 PRD"把它放开**：平台只清理视频产物，
              图片产物暂不清除，音频当前没有模型（2026-09-07 owner 确认）。PRD 那边这块
              不限 kind，但它是原型的通用写法，不代表图片/音频也会过期 —— 放开会让图片
              任务在完成后误显「产物已超过有效期」。 */}
          {gone && kind === 'video' && isTaskDone(task.status) && artifactState === 'expired' && (
            <div className="rounded-md border border-mg-border bg-mg-bg-0 mg-panel-relaxed flex flex-col items-center gap-2 text-mg-text-4">
              <LuVideoOff size={32} />
              <p className="mg-text-body font-semibold">{t('artifact.expired')}</p>
              {/* 措辞以 PRD 为准（App.tsx 的「过期说明」）：不再写「视频文件」——
                  异步任务还有图片与音乐，产物类型不该出现在这句通用提示里 */}
              <p className="mg-text-caption text-mg-text-3">{t('artifact.expiredNote')}</p>
            </div>
          )}

          {/* 失败原因 */}
          {artifactState === 'failed' && task.error_message && (
            <div className="rounded-md border border-[var(--mg-danger)]/20 bg-[var(--mg-danger)]/5 mg-panel">
              <p className="mg-text-label text-[var(--mg-danger)] mb-1.5">{t('detail.errorReason')}</p>
              <p className="mg-text-caption text-mg-text-2">{task.error_message}</p>
            </div>
          )}
        </div>
    </SideSheet>
  )
}
