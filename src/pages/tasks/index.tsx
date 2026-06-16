import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LuSearch,
  LuClapperboard,
  LuImage,
  LuMusic,
  LuX,
  LuRefreshCw,
  LuVideoOff,
  LuDownload,
  LuLink,
  LuCopy,
} from 'react-icons/lu'
import { useCopy } from '@/hooks/use-copy'
import { appToast } from '@/lib/app-toast'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
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
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { post } from '@/lib/request'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import type { TaskItem, TaskDetail, TaskStatus, TaskKind } from '@/types'
import { VideoThumbnail } from './VideoThumbnail'
import { VideoPreviewModal } from './VideoPreviewModal'

// ─── 常量 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const REFRESH_INTERVAL = 10 // 列表可见倒计时刷新间隔（秒）

const STATUS_CONFIG: Record<TaskStatus, { label: string; variant: BadgeVariant; dot: boolean }> = {
  queued:    { label: '排队中', variant: 'secondary', dot: true },
  running:   { label: '执行中', variant: 'info',      dot: true },
  succeeded: { label: '已完成', variant: 'success',   dot: false },
  completed: { label: '已完成', variant: 'success',   dot: false },
  failed:    { label: '失败',   variant: 'danger',    dot: false },
  cancelled: { label: '已取消', variant: 'outline',   dot: false },
}

const KIND_CONFIG: Record<TaskKind, { label: string; icon: React.ReactNode }> = {
  video: { label: '视频生成', icon: <LuClapperboard size={13} /> },
  image: { label: '图片生成', icon: <LuImage        size={13} /> },
  audio: { label: '音乐生成', icon: <LuMusic        size={13} /> },
}

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

function fmtCost(item: TaskItem) {
  if (item.status === 'queued' || item.status === 'running') return '—'
  const amount = taskCost(item)
  if (amount == null) return '—'
  const symbol = item.currency === 'USD' ? '$' : '¥'
  return `${symbol}${amount.toFixed(2)}`
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
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-mg-border/50 last:border-0">
      <span className="text-[12px] font-semibold text-mg-text-2 shrink-0 w-20">{label}</span>
      <div className="flex-1 text-right">
        <span className={cn('text-[13px] text-mg-text-0', mono && 'font-mono text-xs')}>
          {value}
        </span>
        {hint && <p className="text-[11px] text-mg-text-2 mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

// ─── 详情抽屉 ─────────────────────────────────────────────────────────────────

function TaskDetailSheet({ task: listTask, onClose }: { task: TaskItem; onClose: () => void }) {
  const qc = useQueryClient()
  const { copy } = useCopy()
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

  const cancelMutation = useMutation({
    mutationFn: () => post<void>(`async-tasks/${encodeURIComponent(taskId)}/cancel`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['task-detail', taskId] })
    },
  })

  // 详情接口能成功就用详情数据，否则用列表项兜底——视频预览本就不依赖详情接口
  const task = data?.task ?? listTask
  const kind = resolveKind(task)
  const kindCfg = KIND_CONFIG[kind]
  const expired = isVideoExpired(task) || isVideoExpired(data)
  // 产物有效期：详情接口优先（result_meta 可能比列表项新），回落到列表项
  const expiry = resultExpiry(data) ?? resultExpiry(task)
  // 视频产物：成功态直接用网关 content 端点（凭 gateway_request_id，302 转 OSS）；过期则不展示
  const videoUrl = kind === 'video' && isTaskDone(task.status) && !expired ? videoContentUrl(taskId) : null
  // 运行时兜底：老任务无 result_meta 但视频实际已被清理（404）→ 当作不可用
  const [videoUnavailable, setVideoUnavailable] = useState(false)
  const showVideo = !!videoUrl && !videoUnavailable
  const gone = expired || videoUnavailable

  return (
    <SideSheet open onClose={onClose} width={460} title="任务详情">
        <div className="space-y-5 px-1 py-2 text-sm">
          {/* 头部徽章 */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} statusMap={STATUS_CONFIG} />
            <Badge variant="secondary" className="flex items-center gap-1">
              {kindCfg.icon}{kindCfg.label}
            </Badge>
            {task.from_image && <Badge variant="info">图生视频</Badge>}
          </div>

          {/* 字段列表 */}
          <div className="rounded-xl border border-mg-border bg-card-bg px-4">
            <DetailRow label="任务 ID"   value={task.gateway_request_id} mono />
            <DetailRow label="模型"      value={task.requested_model}    mono />
            {task.vendor && <DetailRow label="供应商" value={task.vendor} />}
            <DetailRow label="提交时间" value={fmtDate(task.created_at)} />
            <DetailRow label="结束时间" value={fmtDate(task.completed_at)} />
            <DetailRow label="耗时"     value={fmtDuration(task.created_at, task.completed_at)} />
            {(task.input_tokens != null || task.output_tokens != null) && (
              <DetailRow
                label="Token 用量"
                value={
                  <span className="text-[12px] text-mg-text-1">
                    输入 <strong className="text-mg-text-0">{(task.input_tokens ?? 0).toLocaleString()}</strong>
                    {' · '}
                    输出 <strong className="text-mg-text-0">{(task.output_tokens ?? 0).toLocaleString()}</strong>
                  </span>
                }
              />
            )}
            <DetailRow
              label="实际费用"
              value={task.status === 'cancelled' || (task.status === 'failed' && !taskCost(task))
                ? '无费用'
                : fmtCost(task)}
              hint={costHint(task)}
            />
            {expiry && (
              <DetailRow
                label="产物有效期"
                value={
                  expiry.expired ? (
                    <span className="text-mg-text-3">已过期 · 已自动清理</span>
                  ) : (
                    <span className="text-mg-text-1">
                      至 {fmtDate(expiry.expiresAt)} <span className="text-mg-text-2">· {expiry.remain}</span>
                    </span>
                  )
                }
                hint={expiry.expired ? undefined : '产物到期后自动清理，平台不长期存储'}
              />
            )}
          </div>

          {/* 产物预览：视频任务成功态，直接用网关 content 端点播放 */}
          {showVideo && (
            <div className="rounded-xl border border-mg-border bg-card-bg p-3">
              <p className="text-[11px] font-bold text-mg-text-2 mb-2 uppercase tracking-wide">产物预览</p>
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

          {/* 产物链接 + 下载 */}
          {showVideo && (
            <div className="rounded-xl border border-mg-border bg-card-bg p-4 space-y-2.5">
              <p className="text-[11px] font-bold text-mg-text-2 uppercase tracking-wide">产物链接</p>
              <button
                type="button"
                onClick={async () => {
                  const ok = await copy(videoUrl)
                  appToast[ok ? 'success' : 'error'](ok ? '链接已复制' : '复制失败')
                }}
                title="点击复制链接"
                className="group flex w-full items-center gap-2 rounded-lg border border-mg-border bg-mg-fill-0/40 px-3 py-2 text-left transition-colors hover:bg-mg-fill-0 hover:border-brand-base/40 cursor-pointer"
              >
                <LuLink size={13} className="shrink-0 text-mg-text-3" />
                <span className="flex-1 truncate text-[12px] font-mono text-mg-text-1" title={videoUrl}>
                  {videoUrl}
                </span>
                <LuCopy size={13} className="shrink-0 text-mg-text-3 group-hover:text-brand-base transition-colors" />
              </button>
              <a
                href={videoUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-1.5 h-9 rounded-lg bg-mg-primary text-white text-[13px] font-semibold transition-opacity hover:opacity-90"
              >
                <LuDownload size={14} />
                下载
              </a>
            </div>
          )}

          {/* 产物已过期 / 已被清理 */}
          {gone && kind === 'video' && isTaskDone(task.status) && (
            <div className="rounded-xl border border-mg-border bg-card-bg p-6 flex flex-col items-center gap-2 text-mg-text-3">
              <LuVideoOff size={32} />
              <p className="text-[13px] font-semibold">产物已过期</p>
              <p className="text-[11px] text-mg-text-2">视频文件已自动清理，不支持预览与下载</p>
            </div>
          )}

          {/* Prompt */}
          {task.prompt && (
            <div className="rounded-xl border border-mg-border bg-card-bg p-4">
              <p className="text-[11px] font-bold text-mg-text-2 mb-2 uppercase tracking-wide">Prompt</p>
              <p className="text-[13px] text-mg-text-1 leading-relaxed">{task.prompt}</p>
            </div>
          )}

          {/* 失败原因 */}
          {task.status === 'failed' && task.error_message && (
            <div className="rounded-xl border border-[var(--mg-danger)]/20 bg-[var(--mg-danger)]/5 p-4">
              <p className="text-[11px] font-bold text-[var(--mg-danger)] mb-1.5 uppercase tracking-wide">失败原因</p>
              <p className="text-[12px] text-mg-text-1 leading-relaxed">{task.error_message}</p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-1">
            {task.status === 'queued' && (
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                loading={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                <LuX size={14} />
                取消任务
              </Button>
            )}
          </div>
        </div>
    </SideSheet>
  )
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { t } = useTranslation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''

  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('all')
  const [kindFilter, setKind]       = useState('all')
  const [offset, setOffset]         = useState(0)
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  // 视频 404（无 result_meta 的老任务，产物已被清理）：列表据此显示「已过期」文案
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set())

  const params = useMemo(() => ({
    workspace_id: undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset,
  }), [statusFilter, search, offset])

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['tasks', tenantId, params],
    queryFn: () => listTasks(params),
    // 不再静默后台轮询；改为页头可见的 10s 倒计时刷新（见下方 countdown）
  })

  // 可见倒计时刷新：每 10s 自动刷新一次，手动刷新会重置倒计时
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

  const handleRefresh = () => {
    void refetch()
    setCountdown(REFRESH_INTERVAL)
  }

  const items  = data?.items ?? []
  const total  = data?.total ?? 0
  const pages  = Math.ceil(total / PAGE_SIZE)
  const page   = Math.floor(offset / PAGE_SIZE) + 1

  const handleSearch = (v: string) => { setSearch(v); setOffset(0) }
  const handleStatus = (v: string) => { setStatus(v); setOffset(0) }
  const handleKind   = (v: string) => { setKind(v);   setOffset(0) }

  const filteredItems = useMemo(() => {
    if (kindFilter === 'all') return items
    return items.filter((t) => resolveKind(t) === kindFilter)
  }, [items, kindFilter])

  return (
    <div>
      {/* 页头 */}
      <PageHeader
        title={t('nav.tasks')}
        description="查看异步任务的执行状态与产物（视频生成等媒体任务）。任务由 API 发起，本页用于监控与取片；排队中的任务可取消。"
        className="mb-6"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            title={`每 ${REFRESH_INTERVAL}s 自动刷新；点击立即刷新并重新计时`}
          >
            <LuRefreshCw size={13} className={cn(isFetching && 'animate-spin')} />
            {isFetching ? '刷新中' : `刷新 · ${countdown}s`}
          </Button>
        }
      />

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <LuSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mg-text-2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索任务 ID / 模型"
            className="h-9 w-60 rounded-lg border border-mg-border bg-mg-bg-1 pl-8 pr-3 text-sm focus:border-brand-base focus:outline-none focus:ring-1 focus:ring-brand-glow/30 text-mg-text-0 placeholder:text-mg-text-2"
          />
        </div>

        <Select value={kindFilter} onChange={handleKind} className="h-9 w-32 text-sm">
          <Select.Option value="all">全部类型</Select.Option>
          <Select.Option value="video">视频生成</Select.Option>
          <Select.Option value="image">图片生成</Select.Option>
          <Select.Option value="audio">音乐生成</Select.Option>
        </Select>

        <Select value={statusFilter} onChange={handleStatus} className="h-9 w-32 text-sm">
          <Select.Option value="all">全部状态</Select.Option>
          <Select.Option value="queued">排队中</Select.Option>
          <Select.Option value="running">执行中</Select.Option>
          <Select.Option value="completed">已完成</Select.Option>
          <Select.Option value="failed">失败</Select.Option>
          <Select.Option value="cancelled">已取消</Select.Option>
        </Select>

        {total > 0 && (
          <span className="ml-auto text-[12px] text-mg-text-2">
            共 {total} 条
          </span>
        )}
      </div>

      {/* 提示条 */}
      <p className="text-[11px] text-mg-text-2 mb-4 px-1">
        提示：本页为「任务」一级菜单（只读监控）。任务经 API 发起；视频生成首个落地，后续图片、音乐等媒体生成任务复用同一列表。
      </p>

      {/* 表格 */}
      <div className="rounded-xl border border-mg-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead align="center" className="w-20">预览</TableHead>
              <TableHead align="center">提交时间</TableHead>
              <TableHead align="center">类型</TableHead>
              <TableHead align="center">模型 / 供应商</TableHead>
              <TableHead align="center">状态</TableHead>
              <TableHead align="center">实际费用</TableHead>
              <TableHead align="center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <EmptyState colSpan={7} title="加载中…" />
            )}
            {isError && (
              <EmptyState colSpan={7} title="加载失败，请稍后重试" />
            )}
            {!isLoading && !isError && filteredItems.length === 0 && (
              <EmptyState
                colSpan={7}
                title={
                  search || statusFilter !== 'all' || kindFilter !== 'all'
                    ? '没有符合条件的任务'
                    : '暂无任务'
                }
              />
            )}
            {filteredItems.map((item) => {
              const kind    = resolveKind(item)
              const kindCfg = KIND_CONFIG[kind]
              const expiry  = resultExpiry(item)
              // 过期 = 元数据已过期 ∪ 运行时 404（老任务无 result_meta 但产物已清理）
              const isExpired = isVideoExpired(item) || expiredIds.has(item.gateway_request_id)
              // 仅已完成的视频任务有可播放/可抓帧的地址；过期则不展示
              const videoUrl = kind === 'video' && isTaskDone(item.status) && !isExpired
                ? videoContentUrl(item.gateway_request_id)
                : null
              return (
                <TableRow
                  key={item.gateway_request_id}
                  className="cursor-pointer hover:bg-mg-fill-0/50 transition-colors"
                  onClick={() => setSelectedTask(item)}
                >
                  <TableCell align="center">
                    {isExpired ? (
                      <div className="h-12 w-12 shrink-0 rounded-lg mx-auto flex items-center justify-center bg-mg-fill-1 text-mg-text-3" title="产物已过期">
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
                  <TableCell align="center" className="text-[12px] text-mg-text-1">
                    {fmtDate(item.created_at)}
                    {(expiry || isExpired) && (
                      <p
                        className={cn(
                          'text-[11px] mt-0.5',
                          isExpired
                            ? 'text-[var(--mg-warning)]'        // 已过期 → 黄
                            : expiry?.urgent
                              ? 'text-[var(--mg-danger)]'        // 剩 ≤1 天 → 红
                              : 'text-mg-text-2',
                        )}
                      >
                        {isExpired ? '产物已过期' : `产物有效 ${expiry?.remain}`}
                      </p>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-mg-text-1">
                      {kindCfg.icon}
                      {kindCfg.label}
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <p className="text-[12px] font-mono text-mg-text-0 truncate max-w-[220px] mx-auto">
                      {item.requested_model}
                    </p>
                    {item.vendor && (
                      <p className="text-[11px] text-mg-text-2 mt-0.5">{item.vendor}</p>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <StatusBadge status={item.status} statusMap={STATUS_CONFIG} />
                  </TableCell>
                  <TableCell align="center">
                    <span className={cn(
                      'text-[13px] font-semibold',
                      item.status === 'failed' && taskCost(item) ? 'text-[var(--mg-danger)]' : 'text-mg-text-0'
                    )}>
                      {fmtCost(item)}
                    </span>
                  </TableCell>
                  <TableCell align="center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedTask(item)
                      }}
                      className="text-[11px] text-mg-text-2 hover:text-mg-text-0 font-semibold transition-colors"
                    >
                      详情
                    </button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-[12px] text-mg-text-2">
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
