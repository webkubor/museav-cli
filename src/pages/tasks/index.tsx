import { useState, useMemo, useEffect } from 'react'
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
  LuTriangleAlert,
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
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { post } from '@/lib/request'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import type { TaskItem, TaskDetail, TaskStatus, TaskKind } from '@/types'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { Money } from '@/components/ui/Money'
import { VideoThumbnail } from './VideoThumbnail'
import { VideoPreviewModal } from './VideoPreviewModal'

// ─── 常量 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const REFRESH_INTERVAL = 10 // 列表可见倒计时刷新间隔（秒）
const EMPTY_TASK_ITEMS: TaskItem[] = []

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

// ─── 详情抽屉 ─────────────────────────────────────────────────────────────────

function TaskDetailSheet({ task: listTask, onClose }: { task: TaskItem; onClose: () => void }) {
  const qc = useQueryClient()
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
  const isVideoTask = kind === 'video' && isTaskDone(task.status)
  // 无 result_meta 字段（空）= 按已过期算（与列表一致）
  const noMeta = isVideoTask && !data?.result_meta?.result_expires_at && !task.result_meta?.result_expires_at
  // 视频产物：成功态直接用网关 content 端点（凭 gateway_request_id，302 转 OSS）；过期/无字段则不展示
  const videoUrl = isVideoTask && !expired && !noMeta ? videoContentUrl(taskId) : null
  // 运行时兜底：result_meta 在有效期内但视频实际已被清理（404）→ 当作不可用
  const [videoUnavailable, setVideoUnavailable] = useState(false)
  const showVideo = !!videoUrl && !videoUnavailable
  const gone = (isVideoTask && (expired || noMeta)) || videoUnavailable

  return (
    <SideSheet open onClose={onClose} width={460} title="任务详情">
        <div className="space-y-5 px-[var(--mg-space-1)] py-[var(--mg-control-py-sm)] mg-text-body">
          {/* 头部徽章 */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} statusMap={STATUS_CONFIG} />
            <Badge variant="secondary" className="flex items-center gap-1">
              {kindCfg.icon}{kindCfg.label}
            </Badge>
            {task.from_image && <Badge variant="info">图生视频</Badge>}
          </div>

          {/* 字段列表 */}
          <div className="rounded-md border border-mg-border bg-card-bg px-[var(--mg-panel-padding-md)]">
            <DetailRow label="任务 ID"   value={task.gateway_request_id} mono />
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
            {task.vendor && <DetailRow label="供应商" value={task.vendor} />}
            <DetailRow label="提交时间" value={fmtDate(task.created_at)} />
            <DetailRow label="结束时间" value={fmtDate(task.completed_at)} />
            <DetailRow label="耗时"     value={fmtDuration(task.created_at, task.completed_at)} />
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

          {/* 产物预览：视频任务成功态，直接用网关 content 端点播放 */}
          {showVideo && (
            <div className="rounded-md border border-mg-border bg-card-bg mg-panel-tight">
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

          {/* 产物链接 + 下载 */}
          {showVideo && (
            <div className="rounded-md border border-mg-border bg-card-bg mg-panel space-y-2.5">
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
            <div className="rounded-md border border-mg-border bg-card-bg mg-panel-relaxed flex flex-col items-center gap-2 text-mg-text-4">
              <LuVideoOff size={32} />
              <p className="mg-text-body font-semibold">产物已过期</p>
              <p className="mg-text-caption text-mg-text-3">视频文件已自动清理，不支持预览与下载</p>
            </div>
          )}

          {/* Prompt */}
          {task.prompt && (
            <div className="rounded-md border border-mg-border bg-card-bg mg-panel">
              <p className="mg-text-label text-mg-text-3 mb-2">Prompt</p>
              <p className="mg-text-body text-mg-text-2">{task.prompt}</p>
            </div>
          )}

          {/* 失败原因 */}
          {task.status === 'failed' && task.error_message && (
            <div className="rounded-md border border-[var(--mg-danger)]/20 bg-[var(--mg-danger)]/5 mg-panel">
              <p className="mg-text-label text-[var(--mg-danger)] mb-1.5">失败原因</p>
              <p className="mg-text-caption text-mg-text-2">{task.error_message}</p>
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

/**
 * 异步任务面板（#361）：从原「任务历史」页抽出，内嵌到「调用日志」页的「异步任务」记录类型下。
 * 视图范围沿用调用日志：mine=按当前账号裁剪；enterprise/space=租户/空间范围（服务端权威裁剪）。
 */
export function AsyncTasksPanel({ view, currentAccountId }: { view: 'enterprise' | 'mine'; currentAccountId?: string }) {
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
    // 「我的视图」按当前账号裁剪；企业/空间视图交服务端按角色/负责空间裁剪（见 #357 后端口径）
    account_id: view === 'mine' ? currentAccountId || undefined : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: search || undefined,
    limit: PAGE_SIZE,
    offset,
  }), [statusFilter, search, offset, view, currentAccountId])

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

  const items  = data?.items ?? EMPTY_TASK_ITEMS
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
      {/* 筛选栏（记录类型=异步任务：首屏筛选 搜索/类型/状态 + 右侧倒计时刷新） */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative">
          <LuSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mg-text-3 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索任务 ID / 模型"
            className="mg-control-md w-60 rounded-lg border border-mg-border bg-mg-fill-0 pl-8 pr-3 mg-text-body focus:border-brand-base focus:outline-none focus:ring-1 focus:ring-brand-glow/30 text-mg-text-1 placeholder:text-mg-text-3"
          />
        </div>

        <Select value={kindFilter} onChange={handleKind} className="mg-control-md w-32 mg-text-body">
          <Select.Option value="all">全部类型</Select.Option>
          <Select.Option value="video">视频生成</Select.Option>
          <Select.Option value="image">图片生成</Select.Option>
          <Select.Option value="audio">音乐生成</Select.Option>
        </Select>

        <Select value={statusFilter} onChange={handleStatus} className="mg-control-md w-32 mg-text-body">
          <Select.Option value="all">全部状态</Select.Option>
          <Select.Option value="queued">排队中</Select.Option>
          <Select.Option value="running">执行中</Select.Option>
          <Select.Option value="completed">已完成</Select.Option>
          <Select.Option value="failed">失败</Select.Option>
          <Select.Option value="cancelled">已取消</Select.Option>
        </Select>

        <div className="ml-auto flex items-center gap-3">
          {total > 0 && (
            <span className="mg-text-caption text-mg-text-3">共 {total} 条</span>
          )}
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
        </div>
      </div>

      {/* 提示条：只放唯一注意事项（有效期/保存），不与页头描述重复 */}
      <p className="flex items-start gap-1.5 mg-text-caption text-[var(--mg-warning)] mb-4 px-1">
        <LuTriangleAlert size={13} className="shrink-0 mt-0.5" />
        <span>视频产物有有效期（见各任务「产物有效期」），过期后平台不再保留，请及时下载保存到本地。</span>
      </p>

      {/* 表格 */}
      <div className="rounded-md border border-mg-border overflow-hidden">
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
                  onClick={() => setSelectedTask(item)}
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
                    {item.vendor && (
                      <p className="mg-text-caption text-mg-text-3 mt-0.5">{item.vendor}</p>
                    )}
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedTask(item)
                      }}
                      className="mg-text-caption text-mg-text-3 hover:text-mg-text-1 font-semibold transition-colors"
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
        <div className="flex items-center justify-between mt-4 mg-text-caption text-mg-text-3">
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
