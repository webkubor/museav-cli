import { useState, useEffect, useRef } from 'react'
import { useCopy } from '@/hooks/use-copy'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { SideSheet } from '@/components/ui/SideSheet'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { LuSearch, LuEye, LuRefreshCw, LuCalendar, LuCopy, LuCheck } from 'react-icons/lu'
import { IoAlertCircle } from 'react-icons/io5'
import { useAuthStore } from '@/store/auth'
import { getLogPayload, listCallLogs } from '@/services/logs'
import { listApiKeys } from '@/services/api-keys'
import { listModels } from '@/services/catalog'
import type { CallLogItem, LogPayload } from '@/types'
import { formatDateTime } from '@/lib/format-date'
import { appToast } from '@/lib/app-toast'
import { cn, formatFriendlyAmount } from '@/lib/utils'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import { CodeBlock } from '@/components/ui/CodeBlock'

type LogStatusFilter = 'all' | 'success' | 'failed'
type PayloadKind = 'request' | 'response'

const LOG_STATUS_MAP: Record<string, StatusConfig> = {
  success: { label: 'Success', variant: 'success' },
  failed:  { label: 'Failed',  variant: 'destructive' },
}

function getLogStatus(row: { http_status?: number | null; status?: string }): string {
  const ok = row.http_status ? row.http_status < 400 : (row.status === 'succeeded' || row.status === 'accepted')
  return ok ? 'success' : 'failed'
}

function decodePayload(payload: LogPayload | undefined) {
  if (!payload?.body_b64) return ''
  try {
    const binary = atob(payload.body_b64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    if (payload.content_type?.includes('json')) {
      return JSON.stringify(JSON.parse(decoded), null, 2)
    }
    return decoded
  } catch {
    return payload.body_b64
  }
}

/**
 * 高颜值模型筛选搜索选择框（Combobox）
 */
const ModelSelectCombobox: React.FC<{
  value: string
  onChange: (val: string) => void
  models: { id: string; display_name: string }[]
  placeholder: string
}> = ({ value, onChange, models, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputValue(value)
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = models.filter(
    (m) =>
      m.id.toLowerCase().includes(inputValue.toLowerCase()) ||
      m.display_name.toLowerCase().includes(inputValue.toLowerCase())
  )

  const handleSelect = (modelId: string, displayName: string) => {
    onChange(modelId)
    setInputValue(displayName)
    setIsOpen(false)
  }

  const handleInputChange = (val: string) => {
    setInputValue(val)
    onChange(val)
  }

  const handleClear = () => {
    setInputValue('')
    onChange('')
  }

  return (
    <div ref={containerRef} className="relative w-full flex flex-col gap-1.5 z-40 select-none">
      <label className="block text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">模型名称</label>
      <div className="relative">
        <Input
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-mg-fill-0/30 font-medium pr-8"
        />
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-mg-text-2 hover:text-mg-text-0 text-[11px] font-bold cursor-pointer transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-mg-bg-1/90 backdrop-blur-xl border border-mg-border/50 rounded-2xl p-2 shadow-[0_16px_36px_-6px_rgba(0,0,0,0.2)] flex flex-col gap-1 max-h-56 overflow-y-auto z-[80] animate-in fade-in slide-in-from-top-2 no-scrollbar">
          {/* Subtle top border highlight */}
          <div className="absolute top-0 left-4 right-4 h-[1.5px] bg-gradient-to-r from-transparent via-brand-base/20 to-transparent rounded-full" />

          {filtered.length === 0 ? (
            <div className="py-3 text-center text-xs italic text-mg-text-2">
              未找到匹配模型
            </div>
          ) : (
            filtered.map((m) => (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(m.id, m.display_name)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(m.id, m.display_name) }}
                className={cn(
                  "group/item flex flex-col gap-0.5 px-3 py-2 rounded-lg cursor-pointer select-none transition-all outline-none",
                  value === m.id
                    ? "bg-brand-selected-bg text-brand-base font-bold shadow-sm shadow-brand-glow/5"
                    : "text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0/30 active:scale-[0.98] hover:translate-x-[2px]"
                )}
              >
                <span className="text-[13.5px] font-bold leading-none truncate">
                  {m.display_name}
                </span>
                <span className="text-[10px] text-mg-text-3 font-mono truncate mt-0.5">
                  {m.id}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 极具科技设计感的高颜值数据加载骨架屏（Skeleton）
 */
const TableSkeleton = () => (
  <div className="p-5 flex flex-col gap-4 animate-pulse select-none">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex items-center justify-between gap-4 py-4 border-b border-mg-border/30 last:border-none animate-in fade-in duration-300">
        <div className="flex flex-col gap-2 w-1/4">
          <div className="h-3.5 bg-mg-fill-0/40 rounded-full w-full" />
          <div className="h-2.5 bg-mg-fill-0/20 rounded-full w-2/3" />
        </div>
        <div className="h-3.5 bg-mg-fill-0/40 rounded-full w-1/6" />
        <div className="h-4 bg-mg-fill-0/40 rounded-full w-1/5" />
        <div className="h-3 bg-mg-fill-0/40 rounded-full w-12" />
        <div className="h-3.5 bg-mg-fill-0/40 rounded-full w-1/6" />
      </div>
    ))}
  </div>
)

export default function LogsPage() {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  // 过滤选项
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>('all')
  const [searchValue, setSearchValue] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [apiKeyFilter, setApiKeyFilter] = useState('all')
  const [timeRange, setTimeRange] = useState<DateRangeValue>({ preset: 'all' })

  // 复制反馈状态
  const { copy: copyPayloadText, copied: copiedPayload } = useCopy()

  // 侧边栏抽屉展示
  const [selectedLog, setSelectedLog] = useState<CallLogItem | null>(null)
  const [payloadKind, setPayloadKind] = useState<PayloadKind>('request')

  // 接口分页
  const [page, setPage] = useState(1)
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null])
  const pageSize = 15
  const currentCursor = cursorStack[page - 1] ?? null

  function resetPagination() {
    setPage(1)
    setCursorStack([null])
  }

  // 加载当前工作区下的 API 密钥列表
  const { data: apiKeysData } = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 60_000,
  })
  const apiKeys = apiKeysData?.items ?? []

  // 加载系统所有的模型列表
  const { data: modelsData } = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ page_size: 100 }),
    staleTime: 5 * 60_000,
  })
  const systemModels = modelsData?.items ?? []

  // 真实日志加载
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs', activeWorkspaceId, statusFilter, modelFilter, apiKeyFilter, searchValue, timeRange, page, currentCursor],
    queryFn: () =>
      listCallLogs({
        workspace_id: activeWorkspaceId!,
        status: statusFilter === 'all' ? undefined : (statusFilter === 'success' ? 'succeeded' : 'failed'),
        model_id: modelFilter || undefined,
        api_key_id: apiKeyFilter === 'all' ? undefined : apiKeyFilter,
        request_id: searchValue.trim() || undefined,
        preset: timeRange.preset !== 'all' ? (timeRange.preset as '1h' | '24h' | '7d' | '30d' | 'custom') : undefined,
        before_started_at: currentCursor ?? (timeRange.preset === 'custom' && timeRange.endDate ? timeRange.endDate : undefined),
        limit: pageSize,
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

  async function copyPayload() {
    if (!decodedPayload) return
    await copyPayloadText(decodedPayload)
    appToast.success(t('logs.detail.payloadCopied'))
  }

  // 后端 cursor 翻页
  const rawLogs = data?.items ?? []
  const filteredLogs = rawLogs

  const total = rawLogs.length
  const hasMore = Boolean(data?.has_more && data.next_cursor)

  function goNextPage() {
    const nextCursor = data?.next_cursor
    if (!nextCursor) return
    setCursorStack((current) => [...current.slice(0, page), nextCursor])
    setPage((current) => current + 1)
  }

  function goPrevPage() {
    setPage((current) => Math.max(1, current - 1))
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <PageHeader
        title={t('logs.title')}
        description={t('logs.desc')}
        actions={
          <Button
            variant="outline"
            disabled={isLoading || isFetching}
            onClick={() => refetch()}
            className="rounded-full px-5 h-10 shrink-0 font-semibold"
          >
            <LuRefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            {t('logs.refresh')}
          </Button>
        }
      />

      {/* 综合过滤面板 */}
      <div className="bg-mg-bg-0 p-5 rounded-xl border border-mg-border/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end shadow-sm select-none">
        <div className="flex flex-col gap-1.5">
          <label className="block text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">{t('logs.filter.statusLabel')}</label>
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v as LogStatusFilter); resetPagination() }}
            placeholder={t('logs.filter.statusPlaceholder')}
            className="w-full bg-mg-fill-0/30"
          >
            <Select.Option value="all">{t('logs.filter.statusAll')}</Select.Option>
            <Select.Option value="success">{t('logs.filter.statusSuccess')}</Select.Option>
            <Select.Option value="failed">{t('logs.filter.statusFailed')}</Select.Option>
          </Select>
        </div>

        <ModelSelectCombobox
          value={modelFilter}
          onChange={(val) => { setModelFilter(val); resetPagination() }}
          models={systemModels.map(m => ({ id: m.id, display_name: m.display_name }))}
          placeholder={t('logs.filter.modelPlaceholder')}
        />

        <div className="flex flex-col gap-1.5">
          <label className="block text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">API 密钥</label>
          <Select
            value={apiKeyFilter}
            onChange={(v) => { setApiKeyFilter(v); resetPagination() }}
            placeholder="筛选 API 密钥"
            className="w-full bg-mg-fill-0/30 font-medium"
          >
            <Select.Option value="all">全部密钥</Select.Option>
            {apiKeys.map((key) => (
              <Select.Option key={key.api_key_id} value={key.api_key_id}>
                {key.name} ({key.masked})
              </Select.Option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="block text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">时间范围</label>
          <DateRangePicker
            value={timeRange}
            onChange={(val) => { setTimeRange(val); resetPagination() }}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <label className="block text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">Request ID</label>
          <Input
            placeholder="输入完整的 Request ID 进行精确检索"
            prefix={<LuSearch className="opacity-50" />}
            value={searchValue}
            onChange={(e) => { setSearchValue(e.target.value); resetPagination() }}
            className="w-full bg-mg-fill-0/30"
          />
        </div>
      </div>

      {/* 极简细线条无框 Table 视图 */}
      <div className="rounded-xl border border-mg-border/60 overflow-x-auto bg-mg-bg-0">
        {isLoading ? (
          <TableSkeleton />
        ) : filteredLogs.length === 0 ? (
          <EmptyState title={t('logs.empty')} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request ID</TableHead>
                  <TableHead>{t('logs.table.requestTime')}</TableHead>
                  <TableHead>{t('logs.table.model')}</TableHead>
                  <TableHead>{t('logs.table.usage')}</TableHead>
                  <TableHead>{t('logs.table.cost')}</TableHead>
                  <TableHead>{t('logs.table.ttft')}</TableHead>
                  <TableHead>{t('logs.table.duration')}</TableHead>
                  <TableHead>{t('logs.table.status')}</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((row) => (
                  <TableRow key={row.call_log_id}>
                    <TableCell className="font-mono text-xs text-mg-text-0 max-w-[160px] truncate select-all">
                      {row.request_id}
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-1 whitespace-nowrap">
                      {formatDateTime(row.started_at)}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <ModelIcon model={{ display_name: row.model.display_name, vendor: row.model.display_name }} size={18} />
                        <span className="font-semibold text-mg-text-0 text-[13.5px]">{row.model.display_name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {row.usage ? (
                        <div className="space-y-0.5">
                          <div className="text-mg-text-2">{t('logs.table.tokenTotal')} <strong className="text-mg-text-0 tabular-nums">{row.usage.total_tokens}</strong></div>
                          <div className="text-mg-text-2">{t('logs.table.tokenInput')} <strong className="text-mg-text-0 tabular-nums">{row.usage.input_tokens}</strong></div>
                          <div className="text-mg-text-2">{t('logs.table.tokenOutput')} <strong className="text-mg-text-0 tabular-nums">{row.usage.output_tokens}</strong></div>
                        </div>
                      ) : (
                        <span className="text-mg-text-2">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums whitespace-nowrap">
                      {Number(row.cost.amount) > 0 ? (
                        <span className="text-mg-text-0 font-semibold">
                          <span className="text-[10px] text-mg-text-2 mr-0.5">{row.cost.currency}</span>
                          {formatFriendlyAmount(row.cost.amount, '', { maxDecimals: 6 })}
                        </span>
                      ) : (
                        <span className="text-mg-text-2">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-mg-text-1 tabular-nums whitespace-nowrap">
                      {(row.speed.first_token_ms / 1000).toFixed(2)}s
                    </TableCell>
                    <TableCell className="font-mono text-xs text-mg-text-1 tabular-nums whitespace-nowrap">
                      {(row.duration_ms / 1000).toFixed(2)}s
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={getLogStatus(row)} statusMap={LOG_STATUS_MAP} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedLog(row)
                          setPayloadKind('request')
                        }}
                        className="h-7 text-xs font-semibold"
                      >
                        <LuEye className="w-3.5 h-3.5 mr-1" />
                        {t('logs.table.detail')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* 分页控制 */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-mg-border gap-4 flex-wrap select-none">
              <span className="text-xs text-mg-text-2">
                {t('logs.pagination.total', { count: total })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={goPrevPage}
                  className="h-8 font-semibold"
                >
                  {t('logs.pagination.prev')}
                </Button>
                <span className="text-xs font-mono text-mg-text-1 bg-mg-fill-0 border border-mg-border px-3 py-1 rounded">
                  {t('logs.pagination.page', { page })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasMore}
                  onClick={goNextPage}
                  className="h-8 font-semibold"
                >
                  {t('logs.pagination.next')}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 右侧日志详情抽屉 */}
      <SideSheet
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={t('logs.detail.title')}
        className="sm:max-w-xl overflow-y-auto no-scrollbar"
      >
        {selectedLog && (
          <div className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-mg-border/60 p-3.5 rounded-lg bg-mg-fill-0/20">
                <p className="text-[10px] text-mg-text-2 uppercase font-bold tracking-widest">{t('logs.detail.status')}</p>
                <div className="mt-1.5"><StatusBadge status={getLogStatus(selectedLog)} statusMap={LOG_STATUS_MAP} /></div>
              </div>
              <div className="border border-mg-border/60 p-3.5 rounded-lg bg-mg-fill-0/20">
                <p className="text-[10px] text-mg-text-2 uppercase font-bold tracking-widest">{t('logs.detail.duration')}</p>
                <p className="text-base font-bold text-mg-text-0 font-mono mt-1">{selectedLog.duration_ms}ms</p>
              </div>
            </div>

            <div className="space-y-1 select-all">
              <DetailRow label="Request ID" value={selectedLog.request_id} mono />
              <DetailRow label={t('logs.detail.model')} value={selectedLog.model.display_name} />
              <DetailRow label={t('logs.detail.time')} value={formatDateTime(selectedLog.started_at)} />
              <DetailRow label={t('logs.detail.apiKeyName')} value={selectedLog.api_key.name || '—'} />
              <DetailRow label={t('logs.detail.tokens')} value={selectedLog.usage ? `${selectedLog.usage.total_tokens} (Prompt: ${selectedLog.usage.input_tokens} / Completion: ${selectedLog.usage.output_tokens})` : '—'} />
              <DetailRow label="追踪 ID" value={selectedLog.trace_id || '—'} mono />
              <DetailRow label="请求模型" value={selectedLog.requested_model || '—'} />
              <DetailRow label="调用类型" value={selectedLog.call_type || '—'} />
              <DetailRow label="HTTP 状态" value={selectedLog.http_status ? String(selectedLog.http_status) : '—'} mono />
              <DetailRow label="计费状态" value={selectedLog.billing_status || '—'} />
              <DetailRow label="费用" value={selectedLog.cost?.amount ? `${formatFriendlyAmount(selectedLog.cost.amount, '', { maxDecimals: 6 })} ${selectedLog.cost.currency}` : '—'} />
              <DetailRow label="结束原因" value={selectedLog.finish_reason || '—'} />
              <DetailRow label="首 Token 延迟" value={selectedLog.speed?.first_token_ms ? `${selectedLog.speed.first_token_ms}ms` : '—'} />
              <DetailRow label="TPOT" value={selectedLog.tpot_ms ? `${selectedLog.tpot_ms}ms` : '—'} />
              <DetailRow label="缓存读 Token" value={selectedLog.usage?.cache_read_tokens != null ? String(selectedLog.usage.cache_read_tokens) : '—'} />
            </div>

            {selectedLog.error && (
              <div className="border border-mg-danger/10 bg-mg-danger/[0.03] p-4 rounded-xl space-y-2 border-l-4 border-l-mg-danger">
                <p className="text-xs font-bold text-mg-danger flex items-center gap-1.5">
                  <IoAlertCircle className="w-4 h-4 shrink-0" />
                  {t('logs.detail.errorTitle')}
                </p>
                <pre className="text-xs text-mg-danger font-mono break-all whitespace-pre-wrap leading-relaxed select-all">
                  {selectedLog.error}
                </pre>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] text-mg-text-2 uppercase font-bold tracking-widest flex items-center gap-1">
                    <LuCalendar className="w-3.5 h-3.5" />
                    {t('logs.detail.rawPayload')}
                  </p>
                  <div className="flex items-center gap-1">
                    {(['request', 'response'] as PayloadKind[]).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setPayloadKind(kind)}
                        className={`h-7 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
                          payloadKind === kind
                            ? 'bg-brand-base text-white'
                            : 'border border-mg-border bg-mg-fill-0 text-mg-text-1 hover:text-mg-text-0'
                        }`}
                      >
                        {t(`logs.detail.payloadKind.${kind}`)}
                      </button>
                    ))}
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!decodedPayload || payloadQuery.isLoading}
                      onClick={copyPayload}
                      className="h-7 min-w-[76px] transition-all duration-300 active:scale-[0.95]"
                    >
                      {copiedPayload ? (
                        <LuCheck className="mr-1 h-3 w-3 text-mg-success animate-in zoom-in-50 duration-300" />
                      ) : (
                        <LuCopy className="mr-1 h-3 w-3 animate-in zoom-in-50 duration-300" />
                      )}
                      <span>{copiedPayload ? "已复制" : t('common.copy')}</span>
                    </Button>
                  </div>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-mg-text-2">
                  <span>{payloadQuery.data?.content_type || '—'}</span>
                  <span>·</span>
                  <span>{payloadQuery.data ? `${payloadQuery.data.size} bytes` : '—'}</span>
                  {payloadQuery.data?.truncated && (
                    <Badge variant="warning">{t('logs.detail.payloadTruncated')}</Badge>
                  )}
                </div>
                <CodeBlock className="max-h-72">
                  {payloadQuery.isLoading
                    ? t('logs.detail.payloadLoading')
                    : payloadQuery.isError
                      ? t('logs.detail.payloadError')
                      : decodedPayload || t('logs.detail.payloadEmpty')}
                </CodeBlock>
              </div>
            </div>
          </div>
        )}
      </SideSheet>
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-mg-border/40 gap-4">
      <span className="text-xs font-bold text-mg-text-2 shrink-0">{label}</span>
      <span className={`text-xs text-mg-text-0 font-semibold text-right break-all max-w-[340px] select-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
