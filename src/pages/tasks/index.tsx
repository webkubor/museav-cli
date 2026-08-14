import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  LuSearch,
  LuClapperboard,
  LuRefreshCw,
  LuTriangleAlert,
  LuChevronDown,
} from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table'
import { useAuthStore } from '@/store/auth'
import { listTasks } from '@/services/tasks'
import { listWorkspaces } from '@/services/workspaces'
import { listTenantMembers } from '@/services/tenants'
import { listApiKeys } from '@/services/api-keys'
import { trackEvent } from '@/lib/track'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import type { TaskArtifactState, TaskBillingState, TaskItem } from '@/types'
import { VideoPreviewModal } from './VideoPreviewModal'
import { PAGE_SIZE, REFRESH_INTERVAL, EMPTY_TASK_ITEMS, timePresetOptions, resolveKind, getArtifactState, isVideoExpired } from './task-list-utils'
import { TaskDetailSheet } from './TaskDetailSheet'
import { TaskRow } from './TaskRow'
import { TaskMoreFilters } from './TaskMoreFilters'

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
  const { t } = useTranslation('tasks')
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const presetOptions = timePresetOptions(t)

  // ?task_id= 下钻（#14）：初始搜索落到该任务，命中后经下方自动展开详情
  const [search, setSearch]         = useState(initialTaskId ?? '')
  const debouncedSearch             = useDebouncedValue(search.trim(), 350)
  const [statusFilter, setStatus]   = useState('all')
  const [artifactFilter, setArtifact] = useState<TaskArtifactState | 'all'>('all')
  const [billingFilter, setBilling] = useState<TaskBillingState | 'all'>('all')
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
    queryFn: () => listWorkspaces(),
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
    status: statusFilter !== 'all' ? statusFilter : undefined,
    artifact_state: artifactFilter !== 'all' ? artifactFilter : undefined,
    billing_state: billingFilter !== 'all' ? billingFilter : undefined,
    preset: presetFilter !== 'all' ? (presetFilter as '1h' | '24h' | '7d') : undefined,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset,
  }), [statusFilter, artifactFilter, billingFilter, presetFilter, debouncedSearch, offset, view, currentAccountId, workspaceFilter, apiKeyFilter, memberFilter])

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
  const handleArtifact = (v: string) => { setArtifact(v as TaskArtifactState | 'all'); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'artifact_state', value: v }) }
  const handleBilling = (v: string) => { setBilling(v as TaskBillingState | 'all'); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'billing_state', value: v }) }
  const handleKind   = (v: string) => { setKind(v);   setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'kind', value: v }) }
  const handlePreset = (v: string) => { setPreset(v); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'preset', value: v }) }
  const handleWorkspace = (v: string) => { setWorkspace(v); setApiKey('all'); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'workspace' }) }
  const handleApiKey = (v: string) => { setApiKey(v); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'api_key' }) }
  const handleMember = (v: string) => { setMember(v); setOffset(0); trackEvent('logs_filter_change', { record_type: 'async', filter: 'member' }) }

  const hasActiveFilters =
    !!search.trim() || statusFilter !== 'all' || artifactFilter !== 'all' || billingFilter !== 'all' || kindFilter !== 'all' ||
    presetFilter !== '7d' || workspaceFilter !== 'all' || apiKeyFilter !== 'all' || memberFilter !== 'all'

  function clearFilters() {
    setSearch(''); setStatus('all'); setArtifact('all'); setBilling('all'); setKind('all'); setPreset('7d')
    setWorkspace('all'); setApiKey('all'); setMember('all'); setOffset(0)
  }

  const openDetail = (item: TaskItem) => {
    setSelectedTask(item)
    trackEvent('logs_detail_view', { record_type: 'async', kind: resolveKind(item), status: item.status })
  }

  const filteredItems = useMemo(() => {
    let list = kindFilter === 'all' ? items : items.filter((t) => resolveKind(t) === kindFilter)
    if (artifactFilter !== 'all') {
      list = list.filter((task) => getArtifactState(task, isVideoExpired(task) || expiredIds.has(task.gateway_request_id)) === artifactFilter)
    }
    if (billingFilter !== 'all') {
      list = list.filter((task) => (task.billing_state ?? task.billing_status) === billingFilter)
    }
    return list
  }, [items, kindFilter, artifactFilter, billingFilter, expiredIds])

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

  const markExpired = (taskId: string) =>
    setExpiredIds((prev) => (prev.has(taskId) ? prev : new Set(prev).add(taskId)))

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
            placeholder={t('filters.searchPlaceholder')}
            className="mg-control-md w-60 rounded-lg border border-mg-border bg-mg-fill-0 pl-8 pr-3 mg-text-body focus:border-brand-base focus:outline-none focus:ring-1 focus:ring-brand-glow/30 text-mg-text-1 placeholder:text-mg-text-3"
          />
        </div>

        <Select value={presetFilter} onChange={handlePreset} className="mg-control-md w-32 mg-text-body">
          {presetOptions.map((option) => (
            <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
          ))}
        </Select>

        <Select value={kindFilter} onChange={handleKind} className="mg-control-md w-32 mg-text-body">
          <Select.Option value="all">{t('filters.allKinds')}</Select.Option>
          <Select.Option value="video">{t('kind.video')}</Select.Option>
          <Select.Option value="image">{t('kind.image')}</Select.Option>
          <Select.Option value="audio">{t('kind.audio')}</Select.Option>
        </Select>

        <Select value={statusFilter} onChange={handleStatus} className="mg-control-md w-32 mg-text-body">
          <Select.Option value="all">{t('filters.allStatuses')}</Select.Option>
          <Select.Option value="queued">{t('status.queued')}</Select.Option>
          <Select.Option value="running">{t('status.running')}</Select.Option>
          <Select.Option value="succeeded">{t('status.succeeded')}</Select.Option>
          <Select.Option value="failed">{t('status.failed')}</Select.Option>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMoreFilters((v) => !v)}
        >
          <LuChevronDown size={14} className={cn('transition-transform', showMoreFilters && 'rotate-180')} />
          {t('buttons.moreFilters')}
        </Button>

        {/* 刷新按钮已上移到页头（#46，与同步调用一致）；此处保留计数，自动刷新在后台静默进行。 */}
        {total > 0 && (
          <span className="ml-auto mg-text-caption text-mg-text-3">{t('pagination.total', { total })}</span>
        )}
      </div>

      {/* 更多筛选：工作空间 / API Key / 成员 / 产物状态 / 计费状态 */}
      {showMoreFilters && (
        <TaskMoreFilters
          view={view}
          artifactFilter={artifactFilter}
          billingFilter={billingFilter}
          workspaceFilter={workspaceFilter}
          apiKeyFilter={apiKeyFilter}
          memberFilter={memberFilter}
          apiKeyWorkspaceId={apiKeyWorkspaceId}
          workspaces={workspacesData ?? []}
          apiKeys={keyPage?.items ?? []}
          members={memberPage?.items ?? []}
          onArtifactChange={handleArtifact}
          onBillingChange={handleBilling}
          onWorkspaceChange={handleWorkspace}
          onApiKeyChange={handleApiKey}
          onMemberChange={handleMember}
        />
      )}
      </section>

      {/* 提示条：只放唯一注意事项（有效期/保存），不与页头描述重复 */}
      <p className="flex items-start gap-1.5 mg-text-caption text-[var(--mg-warning)] px-1">
        <LuTriangleAlert size={13} className="shrink-0 mt-0.5" />
        <span>{t('warning.expiry')}</span>
      </p>

      {/* 表格 */}
      <div className="rounded-md border border-mg-border bg-mg-bg-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead align="center" className="w-20">{t('columns.preview')}</TableHead>
              <TableHead align="center">{t('columns.createdAt')}</TableHead>
              <TableHead align="center">{t('columns.kind')}</TableHead>
              <TableHead align="center">{t('columns.model')}</TableHead>
              <TableHead align="center">{t('columns.status')}</TableHead>
              <TableHead align="center">{t('columns.cost')}</TableHead>
              <TableHead align="center">{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <EmptyState colSpan={7} title={t('empty.loading')} />
            )}
            {/* 接口失败不降级空态：明确报错 + 重试入口 */}
            {isError && !isLoading && (
              <EmptyState
                colSpan={7}
                icon={<LuTriangleAlert />}
                title={t('empty.loadErrorTitle')}
                description={t('empty.loadErrorDescription')}
                action={
                  <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <LuRefreshCw size={13} className={cn(isFetching && 'animate-spin')} />
                    {t('buttons.retry')}
                  </Button>
                }
              />
            )}
            {/* 空态分型：有筛选=筛选无结果（给清除入口）；无筛选=真正暂无任务 */}
            {!isLoading && !isError && filteredItems.length === 0 && (
              hasActiveFilters ? (
                <EmptyState
                  colSpan={7}
                  title={t('empty.filteredTitle')}
                  description={t('empty.filteredDescription')}
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>{t('buttons.clearFilters')}</Button>
                  }
                />
              ) : (
                <EmptyState
                  colSpan={7}
                  icon={<LuClapperboard />}
                  title={t('empty.noTasksTitle')}
                  description={t('empty.noTasksDescription')}
                />
              )
            )}
            {filteredItems.map((item) => (
              <TaskRow
                key={item.gateway_request_id}
                item={item}
                expired={expiredIds.has(item.gateway_request_id)}
                onOpen={openDetail}
                onPreview={setPreviewUrl}
                onExpired={markExpired}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {pages > 1 && (
        <div className="flex items-center justify-between mg-text-caption text-mg-text-3">
          <span>{t('pagination.page', { page, pages })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              {t('buttons.previousPage')}
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {t('buttons.nextPage')}
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
