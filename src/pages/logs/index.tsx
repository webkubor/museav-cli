import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCopy } from '@/hooks/use-copy'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
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
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { appToast } from '@/lib/app-toast'
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
  type PayloadKind,
  type PayloadView,
} from './detail'
import { LuChevronDown, LuRefreshCw, LuSearch } from 'react-icons/lu'

type LogStatusFilter = 'all' | 'success' | 'guarded' | 'error'
type LogGuardrailFilter = 'all' | 'hit' | 'not_hit'
type LogView = 'enterprise' | 'mine'

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

function resolveBackendStatus(
  status: LogStatusFilter,
  guardrail: LogGuardrailFilter
): CallLogListParams['status'] | undefined {
  if (status === 'guarded' || guardrail === 'hit') return 'rejected'
  if (status === 'error') return 'failed'
  if (status === 'success' || guardrail === 'not_hit') return 'succeeded'
  return undefined
}

export default function LogsPage() {
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountId = useAuthStore((s) => s.account?.account_id)
  const { canManage, isEnterprise } = useTenantRole()
  // 视图默认：企业 Owner/Admin=企业视图，Member/个人租户=我的视图；手动切换后不再被角色覆盖（同总览页）
  // 从总览「查看全部」带来的上下文：?view= 初始化视图
  const [searchParams] = useSearchParams()
  const viewParam = searchParams.get('view')
  const [userView, setUserView] = useState<LogView | null>(
    viewParam === 'mine' || viewParam === 'enterprise' ? viewParam : null,
  )
  const view = userView ?? (isEnterprise && canManage ? 'enterprise' : 'mine')
  const showViewToggle = isEnterprise && canManage
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>('all')
  const [workspaceFilter, setWorkspaceFilter] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [apiKeyFilter, setApiKeyFilter] = useState('all')
  const [memberFilter, setMemberFilter] = useState('all')
  const [guardrailFilter, setGuardrailFilter] = useState<LogGuardrailFilter>('all')
  const [searchValue, setSearchValue] = useState('')
  const [timeRange, setTimeRange] = useState<DateRangeValue>(DEFAULT_TIME_RANGE)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [selectedLog, setSelectedLog] = useState<CallLogItem | null>(null)
  const [payloadKind, setPayloadKind] = useState<PayloadKind>('request')
  const [payloadView, setPayloadView] = useState<PayloadView>('parsed')
  const [page, setPage] = useState(1)
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null])
  const { copied, copy } = useCopy()

  const currentCursor = cursorStack[page - 1] ?? null

  function resetPagination() {
    setPage(1)
    setCursorStack([null])
  }

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

  const { from, to } = useMemo(() => rangeToDates(timeRange), [timeRange])
  const backendStatus = resolveBackendStatus(statusFilter, guardrailFilter)
  const selectedWorkspaceId = workspaceFilter === 'all' ? undefined : workspaceFilter
  // 我的视图：锁定当前账号；企业视图：用「成员」筛选（默认全部）
  const effectiveAccountId =
    view === 'mine' ? currentAccountId || undefined : memberFilter === 'all' ? undefined : memberFilter

  const { data, isFetching, isLoading, refetch } = useQuery({
    queryKey: [
      'logs',
      activeTenantId,
      view,
      effectiveAccountId,
      selectedWorkspaceId,
      statusFilter,
      guardrailFilter,
      modelFilter,
      apiKeyFilter,
      memberFilter,
      searchValue,
      timeRange,
      page,
      currentCursor,
    ],
    queryFn: () =>
      listCallLogs({
        workspace_id: selectedWorkspaceId,
        status: backendStatus,
        model_id: modelFilter === 'all' ? undefined : modelFilter,
        api_key_id: apiKeyFilter === 'all' ? undefined : apiKeyFilter,
        account_id: effectiveAccountId,
        q: searchValue.trim() || undefined,
        from,
        to,
        before_started_at: currentCursor ?? undefined,
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(activeTenantId),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })

  const payloadQuery = useQuery({
    queryKey: ['logs', selectedLog?.request_id, 'payload', payloadKind],
    queryFn: () => getLogPayload(selectedLog!.request_id, payloadKind),
    enabled: Boolean(selectedLog?.request_id),
  })

  const decodedPayload = decodePayloadBody(payloadQuery.data?.body_b64)
  const sseReassembled = reassembleSSE(decodedPayload)
  const displayedPayload = sseReassembled && payloadView === 'parsed'
    ? formatSSESummary(sseReassembled)
    : decodedPayload

  const items = data?.items ?? []
  const hasMore = Boolean(data?.has_more && data.next_cursor)

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

  async function copyPayload() {
    if (!displayedPayload) return
    await copy(displayedPayload)
    appToast.success('Payload 已复制')
  }

  function openLog(row: CallLogItem) {
    setSelectedLog(row)
    setPayloadKind('request')
    setPayloadView('parsed')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="调用日志"
        description="按工作空间、成员和 API Key 追踪企业调用。"
        actions={
          <div className="flex items-center gap-3">
            {showViewToggle && (
              <SegmentedToggle<LogView>
                ariaLabel="切换视图范围"
                value={view}
                options={[
                  { value: 'enterprise', label: '企业视图' },
                  { value: 'mine', label: '我的视图' },
                ]}
                onChange={(next) => { setUserView(next); if (next === 'mine') setMemberFilter('all'); resetPagination() }}
              />
            )}
            <Button variant="outline" disabled={isLoading || isFetching} onClick={() => refetch()}>
              <LuRefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        }
      />

      <section className="space-y-4 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_180px_minmax(180px,1fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto] lg:items-end">
          <FilterField label="时间范围">
            <DateRangePicker value={timeRange} onChange={(value) => { setTimeRange(value); resetPagination() }} presets={LOG_TIME_PRESETS} />
          </FilterField>
          <FilterField label="调用状态">
            <Select value={statusFilter} onChange={(value) => { setStatusFilter(value as LogStatusFilter); resetPagination() }}>
              {STATUS_OPTIONS.map((option) => (
                <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="工作空间">
            <Select value={workspaceFilter} onChange={(value) => { setWorkspaceFilter(value); setApiKeyFilter('all'); resetPagination() }}>
              <Select.Option value="all">全部工作空间</Select.Option>
              {(workspacesData?.items ?? []).map((workspace) => (
                <Select.Option key={workspace.workspace_id} value={workspace.workspace_id}>
                  {workspace.name}
                </Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="模型名称">
            <Select value={modelFilter} onChange={(value) => { setModelFilter(value); resetPagination() }}>
              <Select.Option value="all">全部模型</Select.Option>
              {(modelsData?.items ?? []).map((model) => (
                <Select.Option key={model.model_id} value={model.model_id}>
                  {model.display_name || model.model_id}
                </Select.Option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="API Key">
            <Select value={apiKeyFilter} disabled={!apiKeyWorkspaceId} onChange={(value) => { setApiKeyFilter(value); resetPagination() }}>
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
            {view === 'enterprise' && (
              <FilterField label="成员">
                <Select value={memberFilter} onChange={(value) => { setMemberFilter(value); resetPagination() }}>
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
              <Select value={guardrailFilter} onChange={(value) => { setGuardrailFilter(value as LogGuardrailFilter); resetPagination() }}>
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

      <LogsTable
        hasMore={hasMore}
        isFetching={isFetching}
        isLoading={isLoading}
        items={items}
        onNext={goNextPage}
        onPrev={goPrevPage}
        onSelectLog={openLog}
        page={page}
        selectedLogId={selectedLog?.call_log_id}
        workspaceNameById={workspaceNameById}
      />

      <LogDetailSheet
        copied={copied}
        displayedPayload={displayedPayload}
        onClose={() => setSelectedLog(null)}
        onCopyPayload={copyPayload}
        onPayloadKindChange={(kind) => { setPayloadKind(kind); setPayloadView('parsed') }}
        onPayloadViewChange={setPayloadView}
        open={Boolean(selectedLog)}
        payload={payloadQuery.data}
        payloadKind={payloadKind}
        payloadLoading={payloadQuery.isLoading}
        payloadView={payloadView}
        row={selectedLog}
        sseAvailable={Boolean(sseReassembled)}
      />
    </div>
  )
}
