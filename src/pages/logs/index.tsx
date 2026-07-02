import { useMemo, useState, type ReactNode } from 'react'
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
import { useAuthStore } from '@/store/auth'
import { endOfLocalDayISO } from '@/lib/datetime'
import { appToast } from '@/lib/app-toast'
import type { CallLogItem, LogPayload } from '@/types'
import { formatSSESummary, reassembleSSE } from './reassemble-sse'
import {
  ActiveFilterChips,
  LogsTable,
} from './components'
import {
  LogDetailSheet,
  type PayloadKind,
  type PayloadView,
} from './detail'
import { LuChevronDown, LuRefreshCw, LuSearch } from 'react-icons/lu'

type LogStatusFilter = 'all' | 'accepted' | 'succeeded' | 'failed' | 'rejected'

const PAGE_SIZE = 15
const DEFAULT_TIME_RANGE: DateRangeValue = { preset: '7d' }

const STATUS_OPTIONS: Array<{ label: string; value: LogStatusFilter }> = [
  { label: '全部状态', value: 'all' },
  { label: '成功', value: 'succeeded' },
  { label: '处理中', value: 'accepted' },
  { label: '失败', value: 'failed' },
  { label: '已拒绝', value: 'rejected' },
]

function decodePayload(payload: LogPayload | undefined) {
  if (!payload?.body_b64) return ''
  let decoded: string
  try {
    const binary = atob(payload.body_b64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    decoded = new TextDecoder().decode(bytes)
  } catch {
    return payload.body_b64
  }
  try {
    return JSON.stringify(JSON.parse(decoded), null, 2)
  } catch {
    return decoded
  }
}

function isDefaultTimeRange(value: DateRangeValue) {
  return value.preset === DEFAULT_TIME_RANGE.preset && !value.startDate && !value.endDate
}

function timeRangeLabel(value: DateRangeValue) {
  if (value.preset === '1h') return '近 1 小时'
  if (value.preset === '24h') return '近 24 小时'
  if (value.preset === '7d') return '近 7 天'
  if (value.preset === '30d') return '近 30 天'
  if (value.preset === 'custom' && value.startDate && value.endDate) {
    return `${value.startDate} 至 ${value.endDate}`
  }
  return '全部时间'
}

export default function LogsPage() {
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [apiKeyFilter, setApiKeyFilter] = useState('all')
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
    setModelFilter('all')
    setApiKeyFilter('all')
    setSearchValue('')
    setTimeRange(DEFAULT_TIME_RANGE)
    resetPagination()
  }

  const { data: apiKeysData } = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 60_000,
  })

  const { data: modelsData } = useQuery({
    queryKey: ['catalog-models', 'logs-filter'],
    queryFn: () => listModels({ page_size: 100 }),
    staleTime: 5 * 60_000,
  })

  const { data, isFetching, isLoading, refetch } = useQuery({
    queryKey: [
      'logs',
      activeWorkspaceId,
      statusFilter,
      modelFilter,
      apiKeyFilter,
      searchValue,
      timeRange,
      page,
      currentCursor,
    ],
    queryFn: () =>
      listCallLogs({
        workspace_id: activeWorkspaceId!,
        status: statusFilter === 'all' ? undefined : statusFilter,
        model_id: modelFilter === 'all' ? undefined : modelFilter,
        api_key_id: apiKeyFilter === 'all' ? undefined : apiKeyFilter,
        request_id: searchValue.trim() || undefined,
        preset: timeRange.preset !== 'all'
          ? (timeRange.preset as '1h' | '24h' | '7d' | '30d' | 'custom')
          : undefined,
        before_started_at: currentCursor ?? (
          timeRange.preset === 'custom' && timeRange.endDate
            ? endOfLocalDayISO(timeRange.endDate)
            : undefined
        ),
        limit: PAGE_SIZE,
      }),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })

  const payloadQuery = useQuery({
    queryKey: ['logs', selectedLog?.request_id, 'payload', payloadKind],
    queryFn: () => getLogPayload(selectedLog!.request_id, payloadKind),
    enabled: Boolean(selectedLog?.request_id),
  })

  const decodedPayload = decodePayload(payloadQuery.data)
  const sseReassembled = reassembleSSE(decodedPayload)
  const displayedPayload = sseReassembled && payloadView === 'parsed'
    ? formatSSESummary(sseReassembled)
    : decodedPayload

  const items = data?.items ?? []
  const hasMore = Boolean(data?.has_more && data.next_cursor)

  const activeChips = useMemo(() => {
    const chips: string[] = []
    if (!isDefaultTimeRange(timeRange)) chips.push(timeRangeLabel(timeRange))
    if (statusFilter !== 'all') chips.push(STATUS_OPTIONS.find((item) => item.value === statusFilter)?.label ?? statusFilter)
    if (modelFilter !== 'all') chips.push(`模型: ${modelFilter}`)
    if (apiKeyFilter !== 'all') {
      const key = apiKeysData?.items.find((item) => item.api_key_id === apiKeyFilter)
      chips.push(`API Key: ${key?.name ?? apiKeyFilter}`)
    }
    if (searchValue.trim()) chips.push(`Request ID: ${searchValue.trim()}`)
    return chips
  }, [apiKeyFilter, apiKeysData?.items, modelFilter, searchValue, statusFilter, timeRange])

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
        description="按时间、状态、模型和 API Key 追踪真实调用，定位请求、费用、Token 与响应耗时。"
        actions={
          <Button variant="outline" disabled={isLoading || isFetching} onClick={() => refetch()}>
            <LuRefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        }
      />

      <section className="space-y-4 rounded-md border border-mg-border bg-mg-bg-0 p-[var(--mg-panel-padding-md)]">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_180px_minmax(180px,1fr)_minmax(180px,1fr)_auto] lg:items-end">
          <FilterField label="时间范围">
            <DateRangePicker value={timeRange} onChange={(value) => { setTimeRange(value); resetPagination() }} />
          </FilterField>
          <FilterField label="调用状态">
            <Select value={statusFilter} onChange={(value) => { setStatusFilter(value as LogStatusFilter); resetPagination() }}>
              {STATUS_OPTIONS.map((option) => (
                <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
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
            <Select value={apiKeyFilter} onChange={(value) => { setApiKeyFilter(value); resetPagination() }}>
              <Select.Option value="all">全部 API Key</Select.Option>
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
          <div className="grid grid-cols-1 gap-3 border-t border-mg-border pt-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,1.4fr)] md:items-end">
            <FilterField label="Request ID 精确检索">
              <Input
                value={searchValue}
                onChange={(event) => { setSearchValue(event.target.value); resetPagination() }}
                placeholder="输入完整 Request ID"
                prefix={<LuSearch className="h-4 w-4 text-mg-text-3" />}
              />
            </FilterField>
            <div className="rounded-md border border-mg-border bg-mg-fill-0/30 p-[var(--mg-panel-padding-sm)] mg-text-caption text-mg-text-3">
              Request/Response 内容检索取决于工作区是否开启输入 / 输出日志采集；未开启时仅展示调用元数据。
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

function FilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="mg-text-label text-mg-text-3">{label}</span>
      {children}
    </label>
  )
}
