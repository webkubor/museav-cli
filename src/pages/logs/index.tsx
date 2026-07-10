import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import { getLogPayload, listCallLogs } from '@/services/logs'
import { listApiKeys } from '@/services/api-keys'
import { listModels } from '@/services/catalog'
import { listTenantMembers } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { trackEvent, trackPageView } from '@/lib/track'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import type { CallLogListParams } from '@/interfaces/logs'
import type { CallLogItem } from '@/types'
import { rangeToDates } from '@/pages/usage/usage-utils'
import { decodePayloadBody, formatSSESummary, reassembleSSE } from './reassemble-sse'
import {
  ActiveFilterChips,
  FilterField,
  LogsTable,
} from './components'
import {
  LogDetailSheet,
  type PayloadView,
} from './detail'
import { AsyncTasksPanel } from '@/pages/tasks'
import { LuChevronDown, LuRefreshCw, LuSearch, LuTriangleAlert } from 'react-icons/lu'

type RecordType = 'sync' | 'async'

type LogStatusFilter = 'all' | 'success' | 'guarded' | 'error'
type LogGuardrailFilter = 'all' | 'hit' | 'not_hit'
type LogView = 'enterprise' | 'mine' | 'space'

const PAGE_SIZE = 15
const DEFAULT_TIME_RANGE: DateRangeValue = { preset: '7d' }

const STATUS_OPTIONS: Array<{ label: string; value: LogStatusFilter }> = [
  { label: '全部状态', value: 'all' },
  { label: '成功', value: 'success' },
  { label: '护栏命中', value: 'guarded' },
  { label: '异常', value: 'error' },
]

const GUARDRAIL_OPTIONS: Array<{ label: string; value: LogGuardrailFilter }> = [
  { label: '全部护栏状态', value: 'all' },
  { label: '护栏命中', value: 'hit' },
  { label: '未命中护栏', value: 'not_hit' },
]

const LOG_TIME_PRESETS = [
  { key: 'today', label: '今天' },
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'thisMonth', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'custom', label: '自定义' },
]

function isDefaultTimeRange(value: DateRangeValue) {
  return value.preset === DEFAULT_TIME_RANGE.preset && !value.startDate && !value.endDate
}

/** 用量统计下钻带来的时间上下文：time_range 预设 或 range_start/range_end 自定义。 */
function initialLogsTimeRange(sp: URLSearchParams): DateRangeValue {
  const rangeStart = sp.get('range_start')
  const rangeEnd = sp.get('range_end')
  if (rangeStart && rangeEnd) return { preset: 'custom', startDate: rangeStart, endDate: rangeEnd }
  const tr = sp.get('time_range')
  const valid = ['today', '7d', '30d', 'thisMonth', 'lastMonth']
  if (tr && valid.includes(tr)) return { preset: tr }
  return DEFAULT_TIME_RANGE
}

// Request ID 精确检索判定：单个 token、无空格、长度 ≥16（区别于模型名/错误摘要等模糊关键词）。
// 命中则走独立 request_id 参数（精确匹配），否则走模糊 q。
function isLikelyRequestId(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{15,}$/.test(value)
}

function timeRangeLabel(value: DateRangeValue) {
  if (value.preset === 'today') return '今天'
  if (value.preset === '7d') return '近 7 天'
  if (value.preset === '30d') return '近 30 天'
  if (value.preset === 'thisMonth') return '本月'
  if (value.preset === 'lastMonth') return '上月'
  if (value.preset === 'custom' && value.startDate && value.endDate) {
    return `${value.startDate} 至 ${value.endDate}`
  }
  return '全部时间'
}

// 调用状态(status)与护栏命中(guardrail)是两个正交维度——一次调用可能失败但未命中护栏，
// 也可能成功但命中护栏——故这里只负责 status 这一维度，guardrail 由 GET /model-logs 的
// 独立 guardrail 参数（all|hit|not_hit）传递，不再耦合进 status。
function resolveBackendStatus(status: LogStatusFilter): CallLogListParams['status'] | undefined {
  if (status === 'guarded') return 'rejected'
  if (status === 'error') return 'failed'
  if (status === 'success') return 'succeeded'
  return undefined
}

export default function LogsPage() {
  useEffect(() => {
    trackPageView('logs')
  }, [])
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountId = useAuthStore((s) => s.account?.account_id)
  const { canManage, isEnterprise, isSpaceOwner, ownedWorkspaceIds } = useTenantRole()
  // 视图默认：企业 Owner/Admin=企业视图，空间负责人（单空间）=空间视图，其余=我的视图；
  // 手动切换后不再被角色覆盖（同总览页）
  // 从总览「查看全部」带来的上下文：?view= 初始化视图
  const [searchParams, setSearchParams] = useSearchParams()
  const viewParam = searchParams.get('view')
  const [userView, setUserView] = useState<LogView | null>(
    viewParam === 'mine' || viewParam === 'enterprise' || viewParam === 'space' ? viewParam : null,
  )
  // 「空间视图」目前只支持单空间场景（#357 多空间合并裁剪参数待确认，暂不实现），
  // 负责多个空间时不渲染该切换档，避免猜参数硬发请求。
  const canUseSpaceView = isSpaceOwner && ownedWorkspaceIds.length === 1
  const showViewToggle = isEnterprise && canManage
  const showSpaceViewToggle = !showViewToggle && canUseSpaceView
  const view = userView ?? (showViewToggle ? 'enterprise' : canUseSpaceView ? 'space' : 'mine')
  // 记录类型（#361）：同步调用（默认，现有调用日志）/ 异步任务（原任务历史）；URL record_type 同步
  const [recordType, setRecordType] = useState<RecordType>(
    searchParams.get('record_type') === 'async' ? 'async' : 'sync',
  )
  function changeRecordType(next: RecordType) {
    trackEvent('logs_record_type_switch', { record_type: next })
    setRecordType(next)
    setSelectedLog(null)
    resetPagination()
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      if (next === 'async') p.set('record_type', 'async')
      else p.delete('record_type')
      return p
    }, { replace: true })
  }
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>('all')
  // 从空间概览「调用日志」快捷入口带来的上下文：?workspace=；工作空间列表异步加载，
  // 派生（非 effect+setState）落值：只要用户还没手动切换过筛选，且该 id 已在加载到的列表里存在才采信，
  // 避免列表为空/还没到时直接选中一个不确定存在的选项
  const workspaceParam = searchParams.get('workspace')
  const [workspaceFilterRaw, setWorkspaceFilterRaw] = useState('all')
  const [workspaceFilterTouched, setWorkspaceFilterTouched] = useState(false)
  // 下钻上下文：用量统计跳来时 ?model/api_key/member/time_range 初始化对应筛选
  const [modelFilter, setModelFilter] = useState(() => searchParams.get('model') || 'all')
  const [apiKeyFilter, setApiKeyFilter] = useState(() => searchParams.get('api_key') || 'all')
  const [memberFilter, setMemberFilter] = useState(() => searchParams.get('member') || 'all')
  const [guardrailFilter, setGuardrailFilter] = useState<LogGuardrailFilter>('all')
  const [searchValue, setSearchValue] = useState('')
  // 初始时间范围同时兼容两种来源：总览「最近调用·查看全部」带 ?period=；用量统计下钻带 ?time_range/range_start/range_end
  const [timeRange, setTimeRange] = useState<DateRangeValue>(() => {
    const periodParam = searchParams.get('period')
    if (periodParam && LOG_TIME_PRESETS.some((p) => p.key === periodParam && p.key !== 'custom')) {
      return { preset: periodParam }
    }
    return initialLogsTimeRange(searchParams)
  })
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [selectedLog, setSelectedLog] = useState<CallLogItem | null>(null)
  const [payloadView, setPayloadView] = useState<PayloadView>('parsed')
  const [page, setPage] = useState(1)
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null])

  const currentCursor = cursorStack[page - 1] ?? null

  function resetPagination() {
    setPage(1)
    setCursorStack([null])
  }

  // 详情「查看同链路日志」：用关键词检索按 trace 过滤同链路，展开更多筛选、关掉详情（事件处理里 setState，非 effect）
  function viewTraceLogs(traceId: string) {
    if (!traceId) return
    setSearchValue(traceId)
    setShowMoreFilters(true)
    setSelectedLog(null)
    resetPagination()
  }

  const trackFilter = (filter: string, value?: string) =>
    trackEvent('logs_filter_change', { record_type: 'sync', filter, ...(value ? { value } : {}) })

  function clearFilters() {
    setStatusFilter('all')
    setWorkspaceFilter('all')
    setModelFilter('all')
    setApiKeyFilter('all')
    setMemberFilter('all')
    setGuardrailFilter('all')
    setSearchValue('')
    setTimeRange(DEFAULT_TIME_RANGE)
    resetPagination()
  }

  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces-for-log-filter', activeTenantId],
    queryFn: () => listWorkspaces(),
    enabled: Boolean(activeTenantId),
    staleTime: 5 * 60_000,
  })

  // 派生生效的工作空间筛选值：用户手动切换过（包括点「清除筛选」）就以其为准；
  // 否则若 URL 带 ?workspace= 且已在加载到的列表里存在，采用它；列表未加载完/id 不存在则回落 'all'。
  const workspaceFilter = !workspaceFilterTouched && workspaceParam && workspacesData?.items.some((w) => w.workspace_id === workspaceParam)
    ? workspaceParam
    : workspaceFilterRaw
  function setWorkspaceFilter(value: string) {
    setWorkspaceFilterTouched(true)
    setWorkspaceFilterRaw(value)
  }

  // API Key 归属具体工作空间（GET /workspaces/:id/api-keys），故选项必须跟随「工作空间」筛选，
  // 而不是全局 activeWorkspaceId——否则切换日志页的工作空间筛选时，API Key 选项不对齐。
  // 选“全部工作空间”时无法确定归属，禁用该筛选。
  const apiKeyWorkspaceId = workspaceFilter === 'all' ? undefined : workspaceFilter

  const { data: apiKeysData } = useQuery({
    queryKey: ['api-keys', apiKeyWorkspaceId],
    queryFn: () => listApiKeys(apiKeyWorkspaceId!),
    enabled: Boolean(apiKeyWorkspaceId),
    staleTime: 60_000,
  })

  const { data: modelsData } = useQuery({
    queryKey: ['catalog-models', 'logs-filter'],
    queryFn: () => listModels({ page_size: 100 }),
    staleTime: 5 * 60_000,
  })

  const { data: membersData } = useQuery({
    queryKey: ['tenant-members-for-log-filter', activeTenantId],
    queryFn: () => listTenantMembers(activeTenantId!, { limit: 100 }),
    enabled: Boolean(activeTenantId),
    staleTime: 5 * 60_000,
  })

  // 搜索防抖：settle 350ms 后才进 queryKey，避免每次按键触发请求
  const debouncedSearch = useDebouncedValue(searchValue.trim(), 350)
  // Request ID 精确检索：识别为完整 ID → 走 request_id 参数（精确），否则走模糊 q
  const isRequestIdSearch = isLikelyRequestId(debouncedSearch)

  const { from, to } = useMemo(() => rangeToDates(timeRange), [timeRange])
  const backendStatus = resolveBackendStatus(statusFilter)
  const selectedWorkspaceId = workspaceFilter === 'all' ? undefined : workspaceFilter
  // 空间视图（单空间场景）：锁定该负责空间的全员数据，覆盖手动的工作空间筛选。
  const effectiveWorkspaceId = view === 'space' ? ownedWorkspaceIds[0] : selectedWorkspaceId
  // 我的视图：锁定当前账号；企业视图/空间视图：用「成员」筛选（默认全部）
  const effectiveAccountId =
    view === 'mine' ? currentAccountId || undefined : memberFilter === 'all' ? undefined : memberFilter

  const { data, isFetching, isLoading, isError, refetch } = useQuery({
    queryKey: [
      'logs',
      activeTenantId,
      view,
      effectiveAccountId,
      effectiveWorkspaceId,
      statusFilter,
      guardrailFilter,
      modelFilter,
      apiKeyFilter,
      memberFilter,
      debouncedSearch,
      isRequestIdSearch,
      timeRange,
      page,
      currentCursor,
    ],
    queryFn: () =>
      listCallLogs({
        workspace_id: effectiveWorkspaceId,
        status: backendStatus,
        guardrail: guardrailFilter === 'all' ? undefined : guardrailFilter,
        model_id: modelFilter === 'all' ? undefined : modelFilter,
        api_key_id: apiKeyFilter === 'all' ? undefined : apiKeyFilter,
        account_id: effectiveAccountId,
        // 精确 ID 与模糊关键词分流：命中 ID 走 request_id，否则走 q
        request_id: isRequestIdSearch ? debouncedSearch : undefined,
        q: isRequestIdSearch ? undefined : debouncedSearch || undefined,
        from,
        to,
        before_started_at: currentCursor ?? undefined,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(activeTenantId) && recordType === 'sync',
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })

  // 详情内容区（transcript）需同时展示请求 + 响应两栏，故两份 payload 都加载
  const requestPayloadQuery = useQuery({
    queryKey: ['logs', selectedLog?.request_id, 'payload', 'request'],
    queryFn: () => getLogPayload(selectedLog!.request_id, 'request'),
    enabled: Boolean(selectedLog?.request_id),
  })
  const responsePayloadQuery = useQuery({
    queryKey: ['logs', selectedLog?.request_id, 'payload', 'response'],
    queryFn: () => getLogPayload(selectedLog!.request_id, 'response'),
    enabled: Boolean(selectedLog?.request_id),
  })

  const requestPayloadText = decodePayloadBody(requestPayloadQuery.data?.body_b64)
  const responseRaw = decodePayloadBody(responsePayloadQuery.data?.body_b64)
  const responseSSE = reassembleSSE(responseRaw)
  // 响应文本：SSE 流式先合并成完整答案；否则用原始解码文本
  const responsePayloadText = responseSSE && payloadView === 'parsed'
    ? formatSSESummary(responseSSE)
    : responseRaw
  const payloadLoading = requestPayloadQuery.isLoading || responsePayloadQuery.isLoading

  const items = data?.items ?? []
  const hasMore = Boolean(data?.has_more && data.next_cursor)

  // Request ID 精确检索命中唯一 → 自动展开详情（每个检索值只自动开一次；用户手动关掉后不再弹）
  const autoOpenedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isRequestIdSearch || !data) return
    if (data.items.length === 1 && autoOpenedRef.current !== debouncedSearch) {
      autoOpenedRef.current = debouncedSearch
      setSelectedLog(data.items[0])
      setPayloadView('parsed')
      trackEvent('logs_detail_view', { record_type: 'sync', source: 'request_id_autoopen' })
    }
  }, [data, isRequestIdSearch, debouncedSearch])

  // 搜索埋点：防抖 settle 后一次，非空才报
  useEffect(() => {
    if (debouncedSearch) trackEvent('logs_search', { record_type: 'sync', is_request_id: isRequestIdSearch })
  }, [debouncedSearch, isRequestIdSearch])

  const workspaceNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const workspace of workspacesData?.items ?? []) {
      map.set(workspace.workspace_id, workspace.name)
    }
    return map
  }, [workspacesData?.items])

  const activeChips = useMemo(() => {
    const chips: string[] = []
    if (!isDefaultTimeRange(timeRange)) chips.push(timeRangeLabel(timeRange))
    if (statusFilter !== 'all') chips.push(STATUS_OPTIONS.find((item) => item.value === statusFilter)?.label ?? statusFilter)
    if (workspaceFilter !== 'all') {
      const workspace = workspacesData?.items.find((item) => item.workspace_id === workspaceFilter)
      chips.push(`工作空间: ${workspace?.name ?? workspaceFilter}`)
    }
    if (modelFilter !== 'all') chips.push(`模型: ${modelFilter}`)
    if (apiKeyFilter !== 'all') {
      const key = apiKeysData?.items.find((item) => item.api_key_id === apiKeyFilter)
      chips.push(`API Key: ${key?.name ?? apiKeyFilter}`)
    }
    if (memberFilter !== 'all') {
      const member = membersData?.items.find((item) => item.account.account_id === memberFilter)
      chips.push(`成员: ${member?.account.display_name ?? memberFilter}`)
    }
    if (guardrailFilter !== 'all') chips.push(GUARDRAIL_OPTIONS.find((item) => item.value === guardrailFilter)?.label ?? guardrailFilter)
    if (searchValue.trim()) chips.push(`关键词: ${searchValue.trim()}`)
    return chips
  }, [
    apiKeyFilter,
    apiKeysData?.items,
    guardrailFilter,
    memberFilter,
    membersData?.items,
    modelFilter,
    searchValue,
    statusFilter,
    timeRange,
    workspaceFilter,
    workspacesData?.items,
  ])

  function goNextPage() {
    const nextCursor = data?.next_cursor
    if (!nextCursor) return
    setCursorStack((current) => [...current.slice(0, page), nextCursor])
    setPage((current) => current + 1)
  }

  function goPrevPage() {
    setPage((current) => Math.max(1, current - 1))
  }

  function downloadPayloadJson() {
    if (!selectedLog) return
    const blob = new Blob([JSON.stringify({ request: requestPayloadText, response: responsePayloadText }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `log-${selectedLog.request_id}.json`
    a.click()
    URL.revokeObjectURL(url)
    trackEvent('logs_artifact_download', { record_type: 'sync', artifact: 'payload_json' })
  }

  function openLog(row: CallLogItem) {
    setSelectedLog(row)
    setPayloadView('parsed')
    trackEvent('logs_detail_view', { record_type: 'sync', status: row.status })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="调用日志"
        description={
          recordType === 'sync'
            ? '按工作空间、成员和 API Key 追踪同步调用。'
            : '查看视频、图片、音乐等异步生成任务的状态、费用和产物。'
        }
        actions={
          <div className="flex items-center gap-3">
            {/* 顺序固定：视图范围切换 → 记录类型切换（PRD §4/§6） */}
            {showViewToggle && (
              <SegmentedToggle<LogView>
                ariaLabel="切换视图范围"
                value={view}
                options={[
                  { value: 'enterprise', label: '企业视图' },
                  { value: 'mine', label: '我的视图' },
                ]}
                onChange={(next) => { setUserView(next); if (next === 'mine') setMemberFilter('all'); setSelectedLog(null); resetPagination() }}
              />
            )}
            {showSpaceViewToggle && (
              <SegmentedToggle<LogView>
                ariaLabel="切换视图范围"
                value={view}
                options={[
                  { value: 'space', label: '空间视图' },
                  { value: 'mine', label: '我的视图' },
                ]}
                onChange={(next) => { setUserView(next); if (next === 'mine') setMemberFilter('all'); setSelectedLog(null); resetPagination() }}
              />
            )}
            <SegmentedToggle<RecordType>
              ariaLabel="切换记录类型"
              value={recordType}
              options={[
                { value: 'sync', label: '同步调用' },
                { value: 'async', label: '异步任务' },
              ]}
              onChange={changeRecordType}
            />
            {recordType === 'sync' && (
              <Button variant="outline" disabled={isLoading || isFetching} onClick={() => refetch()}>
                <LuRefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            )}
          </div>
        }
      />

      {recordType === 'async' ? (
        <AsyncTasksPanel view={view} currentAccountId={currentAccountId} />
      ) : (
        <>
      <section className="space-y-4 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_180px_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto] lg:items-end">
          <FilterField label="时间范围">
            <DateRangePicker value={timeRange} onChange={(value) => { setTimeRange(value); resetPagination(); trackFilter('time_range', value.preset) }} presets={LOG_TIME_PRESETS} />
          </FilterField>
          <FilterField label="调用状态">
            <Select value={statusFilter} onChange={(value) => { setStatusFilter(value as LogStatusFilter); resetPagination(); trackFilter('status', value) }}>
              {STATUS_OPTIONS.map((option) => (
                <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="工作空间">
            <Select value={workspaceFilter} onChange={(value) => { setWorkspaceFilter(value); setApiKeyFilter('all'); resetPagination(); trackFilter('workspace') }}>
              <Select.Option value="all">全部工作空间</Select.Option>
              {(workspacesData?.items ?? []).map((workspace) => (
                <Select.Option key={workspace.workspace_id} value={workspace.workspace_id}>
                  {workspace.name}
                </Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="模型名称">
            <Select value={modelFilter} onChange={(value) => { setModelFilter(value); resetPagination(); trackFilter('model') }}>
              <Select.Option value="all">全部模型</Select.Option>
              {(modelsData?.items ?? []).map((model) => (
                <Select.Option key={model.model_id} value={model.model_id}>
                  {model.display_name || model.model_id}
                </Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="API Key">
            <Select value={apiKeyFilter} disabled={!apiKeyWorkspaceId} onChange={(value) => { setApiKeyFilter(value); resetPagination(); trackFilter('api_key') }}>
              <Select.Option value="all">{apiKeyWorkspaceId ? '全部 API Key' : '先选择工作空间'}</Select.Option>
              {(apiKeysData?.items ?? []).map((key) => (
                <Select.Option key={key.api_key_id} value={key.api_key_id}>
                  {key.name} ({key.masked})
                </Select.Option>
              ))}
            </Select>
          </FilterField>
          <Button
            variant="outline"
            className="justify-center"
            onClick={() => setShowMoreFilters((value) => !value)}
          >
            <LuChevronDown className={`mr-1.5 h-4 w-4 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
            更多筛选
          </Button>
        </div>

        {showMoreFilters && (
          <div className="grid grid-cols-1 gap-3 border-t border-mg-border pt-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(260px,1.2fr)] lg:items-end">
            <FilterField label="Request ID / 关键词检索">
              <Input
                value={searchValue}
                onChange={(event) => { setSearchValue(event.target.value); resetPagination() }}
                placeholder="输入 Request ID、模型、错误摘要或成员"
                prefix={<LuSearch className="h-4 w-4 text-mg-text-3" />}
              />
            </FilterField>
            {(view === 'enterprise' || view === 'space') && (
              <FilterField label="成员">
                <Select value={memberFilter} onChange={(value) => { setMemberFilter(value); resetPagination(); trackFilter('member') }}>
                  <Select.Option value="all">全部成员</Select.Option>
                  {(membersData?.items ?? []).map((member) => (
                    <Select.Option key={member.account.account_id} value={member.account.account_id}>
                      {member.account.display_name || member.account.email}
                    </Select.Option>
                  ))}
                </Select>
              </FilterField>
            )}
            <FilterField label="护栏">
              <Select value={guardrailFilter} onChange={(value) => { setGuardrailFilter(value as LogGuardrailFilter); resetPagination(); trackFilter('guardrail', value) }}>
                {GUARDRAIL_OPTIONS.map((option) => (
                  <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
                ))}
              </Select>
            </FilterField>
            <div className="rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-sm)] mg-text-caption text-mg-text-3">
              Request/Response 全文搜索仅覆盖已开启输入 / 输出日志采集的记录；未开启时仅展示调用元数据。
            </div>
          </div>
        )}

        <ActiveFilterChips chips={activeChips} onClear={clearFilters} />
      </section>

      {isError && !isLoading ? (
        <div className="rounded-md border border-mg-border bg-mg-bg-0">
          <EmptyState
            icon={<LuTriangleAlert />}
            title="调用日志加载失败"
            description="接口拉取出错，请检查网络后重试。"
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <LuRefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                重试
              </Button>
            }
          />
        </div>
      ) : (
        <LogsTable
          hasActiveFilters={activeChips.length > 0}
          hasMore={hasMore}
          isFetching={isFetching}
          isLoading={isLoading}
          items={items}
          onClearFilters={clearFilters}
          onNext={goNextPage}
          onPrev={goPrevPage}
          onSelectLog={openLog}
          page={page}
          selectedLogId={selectedLog?.call_log_id}
          workspaceNameById={workspaceNameById}
        />
      )}

      <LogDetailSheet
        requestPayloadText={requestPayloadText}
        responsePayloadText={responsePayloadText}
        payloadView={payloadView}
        onPayloadViewChange={setPayloadView}
        payloadLoading={payloadLoading}
        onDownload={downloadPayloadJson}
        onClose={() => setSelectedLog(null)}
        open={Boolean(selectedLog)}
        row={selectedLog}
        workspaceName={selectedLog ? (workspaceNameById.get(selectedLog.workspace_id) || selectedLog.workspace_id) : undefined}
        onViewTraceLogs={viewTraceLogs}
      />
        </>
      )}
    </div>
  )
}
