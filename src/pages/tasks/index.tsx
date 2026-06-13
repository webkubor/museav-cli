import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LuSearch,
  LuClapperboard,
  LuImage,
  LuMusic,
  LuX,
  LuDownload,
  LuRefreshCw,
} from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCopy } from '@/hooks/use-copy'
import { appToast } from '@/lib/app-toast'
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
import type { TaskItem, TaskStatus, TaskKind } from '@/types'
import { VideoThumbnail } from './VideoThumbnail'
import { VideoPreviewModal } from './VideoPreviewModal'
import { downloadVideo } from './download-video'

// ─── 常量 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

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

function fmtCost(item: TaskItem) {
  if (item.status === 'queued' || item.status === 'running') return '—'
  if (item.actual_cost == null) return '—'
  const symbol = item.line === 'domestic' ? '¥' : '$'
  return `${symbol}${item.actual_cost.toFixed(2)}`
}

function costHint(item: TaskItem): string | null {
  if (item.status === 'failed' && item.actual_cost != null && item.actual_cost > 0)
    return '调用成功但生成失败，已消耗算力、按实际计费'
  if (item.status === 'failed' && !item.actual_cost)
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
  // 视频产物：成功态直接用网关 content 端点（凭 gateway_request_id，302 转 OSS）
  const videoUrl = kind === 'video' && isTaskDone(task.status) ? videoContentUrl(taskId) : null

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
              value={task.status === 'cancelled' || (task.status === 'failed' && !task.actual_cost)
                ? '无费用'
                : fmtCost(task)}
              hint={costHint(task)}
            />
          </div>

          {/* 产物预览：视频任务成功态，直接用网关 content 端点播放 */}
          {videoUrl && (
            <div className="rounded-xl border border-mg-border bg-card-bg p-3">
              <p className="text-[11px] font-bold text-mg-text-2 mb-2 uppercase tracking-wide">产物预览</p>
              <video
                key={videoUrl}
                src={videoUrl}
                controls
                preload="metadata"
                playsInline
                className="w-full rounded-lg bg-black max-h-72"
              />
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
            {isTaskDone(task.status) && videoUrl && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { void downloadVideo(videoUrl, taskId) }}
              >
                <LuDownload size={14} />
                下载产物
              </Button>
            )}
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
  const { copy } = useCopy()

  const handleCopyVideoLink = async (url: string) => {
    const ok = await copy(url)
    appToast[ok ? 'success' : 'error'](ok ? '视频链接已复制' : '复制失败')
  }

  const [search, setSearch]         = useState('')
  const [statusFilter, setStatus]   = useState('all')
  const [kindFilter, setKind]       = useState('all')
  const [offset, setOffset]         = useState(0)
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

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
    refetchInterval: 5000,
  })

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
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <LuRefreshCw size={13} className={cn(isFetching && 'animate-spin')} />
            刷新
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
              <TableHead className="w-20 text-center">预览</TableHead>
              <TableHead className="text-center">提交时间</TableHead>
              <TableHead className="text-center">类型</TableHead>
              <TableHead className="text-center">模型 / 供应商</TableHead>
              <TableHead className="text-center">状态</TableHead>
              <TableHead className="text-center">实际费用</TableHead>
              <TableHead className="text-center">操作</TableHead>
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
              // 仅已完成的视频任务有可播放/可抓帧的地址
              const videoUrl = kind === 'video' && isTaskDone(item.status)
                ? videoContentUrl(item.gateway_request_id)
                : null
              return (
                <TableRow
                  key={item.gateway_request_id}
                  className="cursor-pointer hover:bg-mg-fill-0/50 transition-colors"
                  onClick={() => setSelectedTask(item)}
                >
                  <TableCell className="text-center">
                    <VideoThumbnail
                      taskId={item.gateway_request_id}
                      videoUrl={videoUrl}
                      placeholder={kindCfg.icon}
                      onPreview={setPreviewUrl}
                    />
                  </TableCell>
                  <TableCell className="text-center text-[12px] text-mg-text-1">
                    {fmtDate(item.created_at)}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-mg-text-1">
                      {kindCfg.icon}
                      {kindCfg.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <p className="text-[12px] font-mono text-mg-text-0 truncate max-w-[220px] mx-auto">
                      {item.requested_model}
                    </p>
                    {item.vendor && (
                      <p className="text-[11px] text-mg-text-2 mt-0.5">{item.vendor}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <StatusBadge status={item.status} statusMap={STATUS_CONFIG} />
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      'text-[13px] font-semibold',
                      item.status === 'failed' && item.actual_cost ? 'text-[var(--mg-danger)]' : 'text-mg-text-0'
                    )}>
                      {fmtCost(item)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {item.status === 'queued' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTask(item)
                        }}
                        className="text-[11px] text-mg-text-2 hover:text-[var(--mg-danger)] font-semibold transition-colors"
                      >
                        取消
                      </button>
                    )}
                    {videoUrl && (
                      <span className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleCopyVideoLink(videoUrl)
                          }}
                          className="text-[11px] text-mg-text-2 hover:text-mg-text-0 font-semibold transition-colors"
                        >
                          复制链接
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void downloadVideo(videoUrl, item.gateway_request_id)
                          }}
                          className="text-[11px] text-brand-base hover:text-brand-deep font-semibold transition-colors"
                        >
                          下载
                        </button>
                      </span>
                    )}
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
        <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />
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
