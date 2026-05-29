import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { SideSheet } from '@/components/ui/SideSheet'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { LuSearch, LuEye, LuRefreshCw, LuCalendar } from 'react-icons/lu'
import { IoAlertCircle } from 'react-icons/io5'
import { useAuthStore } from '@/store/auth'
import { listCallLogs } from '@/services/logs'
import type { CallLogItem } from '@/types'
import { formatDateTime } from '@/lib/format-date'

type LogStatusFilter = 'all' | 'success' | 'failed'

export default function LogsPage() {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  // 过滤选项
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>('all')
  const [searchValue, setSearchValue] = useState('')
  const [modelFilter, setModelFilter] = useState('')

  // 侧边栏抽屉展示
  const [selectedLog, setSelectedLog] = useState<CallLogItem | null>(null)

  // 接口分页
  const [page, setPage] = useState(1)
  const pageSize = 15

  // 真实日志加载
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['logs', activeWorkspaceId, statusFilter, modelFilter, page],
    queryFn: () =>
      listCallLogs({
        workspace_id: activeWorkspaceId!,
        status: statusFilter === 'all' ? undefined : (statusFilter === 'success' ? 'succeeded' : 'failed'),
        model_id: modelFilter || undefined,
        limit: pageSize * page, // 粗粒度分页兼容
      }),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  })

  // 简易前端切片分页模拟
  const rawLogs = data?.items ?? []
  const filteredLogs = rawLogs
    .filter(row => 
      row.request_id.toLowerCase().includes(searchValue.toLowerCase()) || 
      row.model.display_name.toLowerCase().includes(searchValue.toLowerCase())
    )
    .slice((page - 1) * pageSize, page * pageSize)

  const total = data?.items?.length ?? 0
  const hasMore = rawLogs.length > page * pageSize

  // 获取状态标签
  const getStatusBadge = (row: CallLogItem) => {
    if (row.status === 'succeeded' || row.status === 'accepted') {
      return <Badge variant="success">Success</Badge>
    }
    return <Badge variant="destructive">Failed</Badge>
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 头部标题与刷新 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-mg-text-0 tracking-tight mb-1.5">
            {t('logs.title')}
          </h1>
          <p className="text-[13px] text-mg-text-2 leading-relaxed">
            {t('logs.desc')}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={isLoading || isFetching}
          onClick={() => refetch()}
          className="rounded-full px-5 h-10 shrink-0 font-semibold"
        >
          <LuRefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          {t('logs.refresh')}
        </Button>
      </div>

      {/* 综合过滤面板 */}
      <div className="bg-mg-bg-0 p-5 rounded-xl border border-mg-border/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end shadow-sm select-none">
        <div className="flex flex-col gap-1.5">
          <label className="block text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">{t('logs.filter.statusLabel')}</label>
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v as LogStatusFilter); setPage(1) }}
            placeholder={t('logs.filter.statusPlaceholder')}
            className="w-full bg-mg-fill-0/30"
          >
            <Select.Option value="all">{t('logs.filter.statusAll')}</Select.Option>
            <Select.Option value="success">{t('logs.filter.statusSuccess')}</Select.Option>
            <Select.Option value="failed">{t('logs.filter.statusFailed')}</Select.Option>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="block text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">{t('logs.filter.modelLabel')}</label>
          <Input
            value={modelFilter}
            onChange={(e) => { setModelFilter(e.target.value); setPage(1) }}
            placeholder={t('logs.filter.modelPlaceholder')}
            className="bg-mg-fill-0/30"
          />
        </div>

        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <label className="block text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">{t('logs.filter.keywordLabel')}</label>
          <Input
            placeholder={t('logs.filter.keywordPlaceholder')}
            prefix={<LuSearch className="opacity-50" />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full bg-mg-fill-0/30"
          />
        </div>
      </div>

      {/* 极简细线条无框 Table 视图 */}
      <div className="rounded-xl border border-mg-border/60 overflow-hidden bg-mg-bg-0">
        {isLoading ? (
          <div className="py-20 text-center text-xs text-mg-text-2">
            <div className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-brand-base" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>{t('logs.loading')}</span>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-xs italic text-mg-text-2">
            {t('logs.empty')}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('logs.table.requestTime')}</TableHead>
                  <TableHead>Request ID</TableHead>
                  <TableHead>{t('logs.table.model')}</TableHead>
                  <TableHead>{t('logs.table.statusCode')}</TableHead>
                  <TableHead>{t('logs.table.duration')}</TableHead>
                  <TableHead>{t('logs.table.tokens')}</TableHead>
                  <TableHead>{t('logs.table.apiKey')}</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((row) => (
                  <TableRow key={row.call_log_id}>
                    <TableCell className="text-xs text-mg-text-1">
                      {formatDateTime(row.started_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-mg-text-0 max-w-[140px] truncate select-all">
                      {row.request_id}
                    </TableCell>
                    <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">
                      {row.model.display_name}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(row)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-mg-text-1 tabular-nums">
                      {row.duration_ms}ms
                    </TableCell>
                    <TableCell className="font-mono text-xs text-mg-text-1 tabular-nums">
                      {row.usage ? (
                        <span>
                          {row.usage.total_tokens} <span className="text-[10px] text-mg-text-2">({row.usage.input_tokens}p/{row.usage.output_tokens}c)</span>
                        </span>
                      ) : (
                        <span className="text-mg-text-2">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-1 font-medium">
                      {row.api_key.name || <span className="text-mg-text-2">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedLog(row)}
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
                  onClick={() => setPage(page - 1)}
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
                  onClick={() => setPage(page + 1)}
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
                <div className="mt-1.5">{getStatusBadge(selectedLog)}</div>
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
            </div>

            {selectedLog.error && (
              <div className="border border-rose-500/10 bg-rose-500/[0.03] p-4 rounded-xl space-y-2 border-l-4 border-l-rose-500">
                <p className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                  <IoAlertCircle className="w-4 h-4 shrink-0" />
                  {t('logs.detail.errorTitle')}
                </p>
                <pre className="text-xs text-rose-600 dark:text-rose-400 font-mono break-all whitespace-pre-wrap leading-relaxed select-all">
                  {selectedLog.error}
                </pre>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-mg-text-2 uppercase font-bold tracking-widest mb-2 flex items-center gap-1">
                  <LuCalendar className="w-3.5 h-3.5" />
                  {t('logs.detail.promptPayload')}
                </p>
                <pre className="text-[11.5px] text-slate-300 bg-slate-950 p-4 rounded-xl border border-mg-border/40 font-mono overflow-x-auto max-h-56 leading-relaxed select-all">
                  {JSON.stringify(selectedLog.provider, null, 2)}
                </pre>
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
