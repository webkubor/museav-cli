import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import { EmptyState } from '@/components/ui/EmptyState'
import { ForbiddenState } from '@/components/ui/ForbiddenState'
import { Input } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import Select from '@/components/ui/Select'
import { isApiErrorCode } from '@/lib/request-error-message'
import { getLogPayload, listCallLogs } from '@/services/logs'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { listApiKeys } from '@/services/api-keys'
import { listModels } from '@/services/catalog'
import { listTenantMembers } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import { useAuthStore } from '@/store/auth'
import { useMarket } from '@/hooks/useMarket'
import { getMarketConfig } from '@/config/market'
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
import { LuChevronDown, LuFileText, LuRefreshCw, LuSearch, LuTriangleAlert } from 'react-icons/lu'

type RecordType = 'sync' | 'async'

type LogStatusFilter = 'all' | 'success' | 'guarded' | 'error'
type LogGuardrailFilter = 'all' | 'hit' | 'not_hit'
type LogView = 'enterprise' | 'mine' | 'space'

const DEFAULT_PAGE_SIZE = 15
const PAGE_SIZE_OPTIONS = [10, 15, 20, 50]
const DEFAULT_TIME_RANGE: DateRangeValue = { preset: '7d' }

const STATUS_OPTION_VALUES: LogStatusFilter[] = ['all', 'success', 'guarded', 'error']

const GUARDRAIL_OPTION_VALUES: LogGuardrailFilter[] = ['all', 'hit', 'not_hit']

const LOG_TIME_PRESET_VALUES = ['today', '7d', '30d', 'thisMonth', 'lastMonth', 'custom'] as const

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

function timeRangeLabel(value: DateRangeValue, t: (key: string, options?: Record<string, string>) => string) {
  if (value.preset === 'today') return t('logs.timeRange.today')
  if (value.preset === '7d') return t('logs.timeRange.7d')
  if (value.preset === '30d') return t('logs.timeRange.30d')
  if (value.preset === 'thisMonth') return t('logs.timeRange.thisMonth')
  if (value.preset === 'lastMonth') return t('logs.timeRange.lastMonth')
  if (value.preset === 'custom' && value.startDate && value.endDate) {
    return t('logs.timeRange.customRange', { start: value.startDate, end: value.endDate })
  }
  return t('logs.timeRange.all')
}

// 调用状态(status)与护栏命中(guardrail)是两个正交维度——一次调用可能失败但未命中护栏，
// 也可能成功但命中护栏（脱敏后继续）——故这里只负责 success/error 两个纯状态维度。
// 「护栏命中」主状态不映射到某个 backend status（它跨 succeeded/rejected/failed），
// 改由独立 guardrail 参数（按 guardrail_decision 判定命中）承接，见 effectiveGuardrail。
function resolveBackendStatus(status: LogStatusFilter): CallLogListParams['status'] | undefined {
  if (status === 'error') return 'failed'
  if (status === 'success') return 'succeeded'
  return undefined
}

export default function LogsPage() {
  const { t } = useTranslation()
  useEffect(() => {
    trackPageView('logs')
  }, [])
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useAuthStore((s) => s.setActiveWorkspaceId)
  const currentAccountId = useAuthStore((s) => s.account?.account_id)
  const navigate = useNavigate()
  const docsUrl = getMarketConfig(useMarket()).docsUrl
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
  // 记录类型（#361）：同步调用（默认，现有调用日志）/ 异步任务（原任务历史）；URL record_type 同步。
  // 带 ?task_id= 时说明是异步任务下钻，直接落到异步视图（#14）。
  const [recordType, setRecordType] = useState<RecordType>(
    searchParams.get('record_type') === 'async' || searchParams.get('task_id') ? 'async' : 'sync',
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
  // 下钻上下文（#14）：总览/护栏跳来时 ?status= 初始化调用状态筛选
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>(() => {
    const s = searchParams.get('status')
    return s === 'success' || s === 'guarded' || s === 'error' ? s : 'all'
  })
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
  // 下钻上下文（#14）：护栏跳来时 ?guardrail_state= 初始化护栏筛选
  const [guardrailFilter, setGuardrailFilter] = useState<LogGuardrailFilter>(() => {
    const g = searchParams.get('guardrail_state')
    return g === 'hit' || g === 'not_hit' ? g : 'all'
  })
  // 下钻上下文（#14）：?request_id= 落到关键词检索（精确 ID 走 request_id 参数），命中唯一后经下方自动展开详情
  const [searchValue, setSearchValue] = useState(() => searchParams.get('request_id') || '')
  // 初始时间范围同时兼容两种来源：总览「最近调用·查看全部」带 ?period=；用量统计下钻带 ?time_range/range_start/range_end
  const [timeRange, setTimeRange] = useState<DateRangeValue>(() => {
    const periodParam = searchParams.get('period')
    if (periodParam && LOG_TIME_PRESET_VALUES.some((key) => key === periodParam && key !== 'custom')) {
      return { preset: periodParam }
    }
    return initialLogsTimeRange(searchParams)
  })
  // 关键词检索/护栏筛选在「更多筛选」里，带对应 URL 参数时默认展开，让下钻上下文可见（#14）
  const [showMoreFilters, setShowMoreFilters] = useState(
    () => Boolean(searchParams.get('request_id') || searchParams.get('guardrail_state')),
  )
  const [selectedLog, setSelectedLog] = useState<CallLogItem | null>(null)
  const [payloadView, setPayloadView] = useState<PayloadView>('parsed')
  const [page, setPage] = useState(1)
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null])
  // 每页条数（需求方#160）：默认 15，可选 10/15/20/50；改动即重置翻页游标。
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  // 异步任务的刷新桥（#46）：把面板内的刷新动作/态提上来，让页头刷新按钮在同步/异步两种记录类型下保持一致。
  const [asyncFetching, setAsyncFetching] = useState(false)
  const asyncRefreshRef = useRef<() => void>(() => {})

  const currentCursor = cursorStack[page - 1] ?? null
  // 总条数（需求方#160）：后端仅在首页返回 total（游标翻页省略，qa#510）。
  // 任何筛选变化都会 resetPagination 回首页拿新 total，故缓存首页值供后续翻页展示。
  const [knownTotal, setKnownTotal] = useState<number | undefined>(undefined)

  function resetPagination() {
    setPage(1)
    setCursorStack([null])
    setKnownTotal(undefined)
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
  // 「护栏命中」跨多个 backend status，统一走 guardrail=hit（按 guardrail_decision 判定，
  // 含仅记录、脱敏后继续、脱敏后下游失败的异常记录）。状态选「护栏命中」时优先此维度。
  const effectiveGuardrail: LogGuardrailFilter | undefined =
    statusFilter === 'guarded' ? 'hit' : guardrailFilter === 'all' ? undefined : guardrailFilter
  const selectedWorkspaceId = workspaceFilter === 'all' ? undefined : workspaceFilter
  // 空间视图（单空间场景）：锁定该负责空间的全员数据，覆盖手动的工作空间筛选。
  const effectiveWorkspaceId = view === 'space' ? ownedWorkspaceIds[0] : selectedWorkspaceId
  // 我的视图：锁定当前账号；企业视图/空间视图：用「成员」筛选（默认全部）
  const effectiveAccountId =
    view === 'mine' ? currentAccountId || undefined : memberFilter === 'all' ? undefined : memberFilter

  const { data, isFetching, isLoading, isError, error, refetch } = useQuery({
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
      pageSize,
    ],
    queryFn: () =>
      listCallLogs({
        workspace_id: effectiveWorkspaceId,
        status: backendStatus,
        guardrail: effectiveGuardrail,
        model_id: modelFilter === 'all' ? undefined : modelFilter,
        api_key_id: apiKeyFilter === 'all' ? undefined : apiKeyFilter,
        account_id: effectiveAccountId,
        // 精确 ID 与模糊关键词分流：命中 ID 走 request_id，否则走 q
        request_id: isRequestIdSearch ? debouncedSearch : undefined,
        q: isRequestIdSearch ? undefined : debouncedSearch || undefined,
        from,
        to,
        before_started_at: currentCursor ?? undefined,
        limit: pageSize,
      }),
    enabled: Boolean(activeTenantId) && recordType === 'sync',
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    retry: false, // 40301/无权限不重试，直接走兼容态
    meta: { forbiddenHandled: true }, // 40301 由本页 ForbiddenState 承接，不弹全局 toast
  })

  // 接口正常但业务码 40301（无权限，典型是进了自己无权的工作空间日志）→ 403 兼容态，
  // 而不是让空数据伪装成「暂无调用日志」空态（对齐 api-keys 页处理）。
  const forbidden = isApiErrorCode(error, 40301)

  // 详情内容区（transcript）需同时展示请求 + 响应两栏，故两份 payload 都加载
  // 仅 logs.payload:view 有权限才拉原文（#479）：无权限不发请求,不泄露 Prompt/Response
  const { hasPermission } = usePermissions()
  const canViewPayload = hasPermission(PERMS.LOGS_PAYLOAD_VIEW)
  // 有权限但空间未开采集时 payload 返回 40401（无数据，非故障）——静默不弹全局「服务暂不可用」，
  // 由 TranscriptSection 走「未开启采集」空态提示（需求方#101：有权限没数据 ≠ 报错）
  const requestPayloadQuery = useQuery({
    queryKey: ['logs', selectedLog?.request_id, 'payload', 'request'],
    queryFn: () => getLogPayload(selectedLog!.request_id, 'request'),
    enabled: Boolean(selectedLog?.request_id) && canViewPayload,
    retry: false,
    meta: { silentError: true },
  })
  const responsePayloadQuery = useQuery({
    queryKey: ['logs', selectedLog?.request_id, 'payload', 'response'],
    queryFn: () => getLogPayload(selectedLog!.request_id, 'response'),
    enabled: Boolean(selectedLog?.request_id) && canViewPayload,
    retry: false,
    meta: { silentError: true },
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
  const statusOptions = useMemo(
    () => STATUS_OPTION_VALUES.map((value) => ({ value, label: t(`logs.filter.status.${value}`) })),
    [t],
  )
  const guardrailOptions = useMemo(
    () => GUARDRAIL_OPTION_VALUES.map((value) => ({ value, label: t(`logs.filter.guardrail.${value}`) })),
    [t],
  )
  const timePresets = useMemo(
    () => LOG_TIME_PRESET_VALUES.map((key) => ({ key, label: t(`logs.timeRange.${key}`) })),
    [t],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首页响应带 total、游标页省略（qa#510），需缓存最近一次 total 供翻页期间展示
    if (typeof data?.total === 'number') setKnownTotal(data.total)
  }, [data?.total])

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

  // URL 下钻 ?request_id=（#14）：数据到位后按 request_id 精确匹配自动展开详情，一次性
  // （用 ref 保证只弹一次；同时占位 autoOpenedRef 避免上面的通用自动展开重复触发/重复埋点）。
  const urlRequestId = searchParams.get('request_id')
  const urlAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (urlAutoOpenedRef.current || !urlRequestId || !data) return
    const match = data.items.find((item) => item.request_id === urlRequestId)
    if (match) {
      urlAutoOpenedRef.current = true
      autoOpenedRef.current = urlRequestId
      setSelectedLog(match)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL 带 request_id 时数据到位后一次性打开详情（urlAutoOpenedRef 幂等）
      setPayloadView('parsed')
      trackEvent('logs_detail_view', { record_type: 'sync', source: 'url_request_id' })
    }
  }, [data, urlRequestId])

  // 搜索埋点：防抖 settle 后一次，非空才报
  useEffect(() => {
    if (debouncedSearch) trackEvent('logs_search', { record_type: 'sync', is_request_id: isRequestIdSearch })
  }, [debouncedSearch, isRequestIdSearch])

  // 归属名称（#50）：直接用 model-logs 每行返回的 workspace/account/api_key 名字字段，
  // 不再按 id 查映射表——那是"全部工作空间"视图下 API Key 名解析不出的根因。

  const activeChips = useMemo(() => {
    const chips: string[] = []
    if (!isDefaultTimeRange(timeRange)) chips.push(timeRangeLabel(timeRange, t))
    if (statusFilter !== 'all') chips.push(statusOptions.find((item) => item.value === statusFilter)?.label ?? statusFilter)
    if (workspaceFilter !== 'all') {
      const workspace = workspacesData?.items.find((item) => item.workspace_id === workspaceFilter)
      chips.push(t('logs.filter.chip.workspace', { value: workspace?.name ?? workspaceFilter }))
    }
    if (modelFilter !== 'all') chips.push(t('logs.filter.chip.model', { value: modelFilter }))
    if (apiKeyFilter !== 'all') {
      const key = apiKeysData?.items.find((item) => item.api_key_id === apiKeyFilter)
      chips.push(t('logs.filter.chip.apiKey', { value: key?.name ?? apiKeyFilter }))
    }
    if (memberFilter !== 'all') {
      const member = membersData?.items.find((item) => item.account.account_id === memberFilter)
      chips.push(t('logs.filter.chip.member', { value: member?.account.display_name ?? memberFilter }))
    }
    if (guardrailFilter !== 'all') chips.push(guardrailOptions.find((item) => item.value === guardrailFilter)?.label ?? guardrailFilter)
    if (searchValue.trim()) chips.push(t('logs.filter.chip.keyword', { value: searchValue.trim() }))
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
    statusOptions,
    guardrailOptions,
    t,
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
    // space-y-6（非 flex gap）：让 PageHeader 的 mb-6 与容器间距折叠为单档 24px，
    // 对齐企业管理页；flex gap 不折叠会叠成 48px，标题到正文间距过大（需求方#167）。
    <div className="space-y-6">
      <PageHeader
        title={t('logs.title')}
        description={
          // 副标题逐字对齐 PRD 原型 headerSubtitle：异步 / 企业视图 / 空间视图 / 我的视图 四态。
          recordType === 'async'
            ? t('logs.header.asyncDesc')
            : view === 'mine'
              ? t('logs.header.mineDesc')
              : view === 'space'
                ? t('logs.header.spaceDesc')
                : t('logs.header.enterpriseDesc')
        }
        actions={
          <div className="flex items-center gap-3">
            {/* 顺序固定：视图范围切换 → 记录类型切换（PRD §4/§6） */}
            {showViewToggle && (
              <SegmentedToggle<LogView>
                ariaLabel={t('logs.header.viewToggleAria')}
                value={view}
                options={[
                  { value: 'enterprise', label: t('logs.header.enterpriseView') },
                  { value: 'mine', label: t('logs.header.mineView') },
                ]}
                onChange={(next) => { setUserView(next); clearFilters(); setSelectedLog(null) }}
              />
            )}
            {showSpaceViewToggle && (
              <SegmentedToggle<LogView>
                ariaLabel={t('logs.header.viewToggleAria')}
                value={view}
                options={[
                  { value: 'space', label: t('logs.header.spaceView') },
                  { value: 'mine', label: t('logs.header.mineView') },
                ]}
                onChange={(next) => { setUserView(next); clearFilters(); setSelectedLog(null) }}
              />
            )}
            <SegmentedToggle<RecordType>
              ariaLabel={t('logs.header.recordTypeAria')}
              value={recordType}
              options={[
                { value: 'sync', label: t('logs.header.syncRecord') },
                { value: 'async', label: t('logs.header.asyncRecord') },
              ]}
              onChange={changeRecordType}
            />
            {/* 刷新按钮：同步/异步两种记录类型统一放页头、统一样式（#46）。异步的自动刷新计时在面板内静默进行。 */}
            {recordType === 'sync' ? (
              <Button variant="outline" disabled={isLoading || isFetching} onClick={() => refetch()}>
                <LuRefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                {t('logs.refresh')}
              </Button>
            ) : (
              <Button variant="outline" disabled={asyncFetching} onClick={() => asyncRefreshRef.current()}>
                <LuRefreshCw className={`mr-1.5 h-4 w-4 ${asyncFetching ? 'animate-spin' : ''}`} />
                {t('logs.refresh')}
              </Button>
            )}
          </div>
        }
      />

      {recordType === 'async' ? (
        <AsyncTasksPanel view={view} currentAccountId={currentAccountId} initialTaskId={searchParams.get('task_id') ?? undefined} refreshRef={asyncRefreshRef} onFetchingChange={setAsyncFetching} />
      ) : forbidden ? (
        <div className="rounded-md border border-mg-border bg-mg-bg-0">
          <ForbiddenState resource={t('logs.title')} />
        </div>
      ) : (
        <>
      <section className="space-y-4 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
        {/* 收紧筛选布局（需求方#131）：控件宽度封顶 200px（原 1fr 会铺满整行留大白），justify-start 左对齐；
            时间范围选择器 w-full 填满单元格去掉内部留白；auto-fit 窄屏整格折行，保留「更多筛选」不被挤出卡片（#69）。 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(160px,200px))] lg:justify-start lg:items-end">
          <FilterField label={t('logs.filter.timeRange')}>
            <DateRangePicker className="w-full" value={timeRange} onChange={(value) => { setTimeRange(value); resetPagination(); trackFilter('time_range', value.preset) }} presets={timePresets} />
          </FilterField>
          <FilterField label={t('logs.filter.callStatus')}>
            <Select value={statusFilter} onChange={(value) => { setStatusFilter(value as LogStatusFilter); resetPagination(); trackFilter('status', value) }}>
              {statusOptions.map((option) => (
                <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label={t('logs.filter.workspace')}>
            <Select value={workspaceFilter} onChange={(value) => { setWorkspaceFilter(value); setApiKeyFilter('all'); resetPagination(); trackFilter('workspace') }}>
              <Select.Option value="all">{t('logs.filter.allWorkspaces')}</Select.Option>
              {(workspacesData?.items ?? []).map((workspace) => (
                <Select.Option key={workspace.workspace_id} value={workspace.workspace_id}>
                  {workspace.name}
                </Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label={t('logs.filter.modelName')}>
            <Select value={modelFilter} onChange={(value) => { setModelFilter(value); resetPagination(); trackFilter('model') }}>
              <Select.Option value="all">{t('logs.filter.allModels')}</Select.Option>
              {(modelsData?.items ?? []).map((model) => (
                <Select.Option key={model.model_id} value={model.model_id}>
                  {model.display_name || model.model_id}
                </Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="API Key">
            <Select value={apiKeyFilter} disabled={!apiKeyWorkspaceId} onChange={(value) => { setApiKeyFilter(value); resetPagination(); trackFilter('api_key') }}>
              <Select.Option value="all">{apiKeyWorkspaceId ? t('logs.filter.allApiKeys') : t('logs.filter.selectWorkspaceFirst')}</Select.Option>
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
            {t('logs.filter.more')}
          </Button>
        </div>

        {showMoreFilters && (
          <div className="grid grid-cols-1 gap-3 border-t border-mg-border pt-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(260px,1.2fr)] lg:items-end">
            <FilterField label={t('logs.filter.requestIdSearch')}>
              <Input
                value={searchValue}
                onChange={(event) => { setSearchValue(event.target.value); resetPagination() }}
                placeholder={t('logs.filter.searchPlaceholder')}
                prefix={<LuSearch className="h-4 w-4 text-mg-text-3" />}
              />
            </FilterField>
            {(view === 'enterprise' || view === 'space') && (
              <FilterField label={t('logs.filter.member')}>
                <Select value={memberFilter} onChange={(value) => { setMemberFilter(value); resetPagination(); trackFilter('member') }}>
                  <Select.Option value="all">{t('logs.filter.allMembers')}</Select.Option>
                  {(membersData?.items ?? []).map((member) => (
                    <Select.Option key={member.account.account_id} value={member.account.account_id}>
                      {member.account.display_name || member.account.email}
                    </Select.Option>
                  ))}
                </Select>
              </FilterField>
            )}
            <FilterField label={t('logs.filter.guardrailLabel')}>
              <Select value={guardrailFilter} onChange={(value) => { setGuardrailFilter(value as LogGuardrailFilter); resetPagination(); trackFilter('guardrail', value) }}>
                {guardrailOptions.map((option) => (
                  <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
                ))}
              </Select>
            </FilterField>
            <div className="flex items-start gap-2 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-sm)] mg-text-caption text-mg-text-3">
              <LuFileText className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('logs.filter.fullTextHint')}</span>
            </div>
          </div>
        )}

        <ActiveFilterChips chips={activeChips} onClear={clearFilters} />
      </section>

      {isError && !isLoading ? (
        <div className="rounded-md border border-mg-border bg-mg-bg-0">
          <EmptyState
            icon={<LuTriangleAlert />}
            title={t('logs.error.loadTitle')}
            description={t('logs.error.loadDesc')}
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <LuRefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                {t('logs.error.retry')}
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
          pageSize={pageSize}
          total={knownTotal}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={(size) => { setPageSize(size); resetPagination() }}
          selectedLogId={selectedLog?.call_log_id}
          docsUrl={docsUrl}
          onGoCreateKey={activeWorkspaceId ? () => navigate(`/workspace/${activeWorkspaceId}/api-keys`) : undefined}
        />
      )}
      <LogDetailSheet
        requestPayloadText={requestPayloadText}
        responsePayloadText={responsePayloadText}
        responseSSE={payloadView === 'parsed' ? responseSSE : null}
        payloadView={payloadView}
        onPayloadViewChange={setPayloadView}
        payloadLoading={payloadLoading}
        onDownload={downloadPayloadJson}
        onClose={() => setSelectedLog(null)}
        open={Boolean(selectedLog)}
        row={selectedLog}
        workspaceName={
          // 归属空间名：后端行内 workspace.name（#459）缺失时，用筛选条已拉取的空间列表按 id
          // 映射，映射不到详情侧显「—」——不裸露原始 id（需求方#447）。
          selectedLog?.workspace?.name
            || workspacesData?.items.find((item) => item.workspace_id === selectedLog?.workspace_id)?.name
        }
        onOpenLogSettings={(workspaceId) => {
          // 跳该日志所属空间的日志与转发设置时，同步切换活跃空间——否则侧栏/上下文仍停在原空间，
          // 页面显 A 空间设置、侧栏却显 B 空间，用户以为「跳错了」（需求方#109）。
          // 可观测性已并入空间管理详情页的「日志与转发」Tab（不再是独立路由），带 workspaceId+tab
          // 深链过去，由 WorkspacesPage 读 query 参数选中对应空间并展开该 Tab。
          if (workspaceId && workspaceId !== activeWorkspaceId) setActiveWorkspaceId(workspaceId)
          navigate(`/workspaces?workspaceId=${workspaceId}&tab=logs`)
        }}
      />
        </>
      )}
    </div>
  )
}
