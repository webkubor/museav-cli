import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet'
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
          <h1 className="text-2xl font-bold text-semi-color-text-0 tracking-tight mb-1.5">
            调用日志
          </h1>
          <p className="text-[13px] text-semi-color-text-2 leading-relaxed">
            实时观测工作区内的所有 API 调用历史，进行流量追踪、耗时统计与问题排查。
          </p>
        </div>
        <Button
          variant="outline"
          disabled={isLoading || isFetching}
          onClick={() => refetch()}
          className="rounded-full px-5 h-10 shrink-0 font-semibold"
        >
          <LuRefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
      </div>

      {/* 综合过滤面板 */}
      <div className="bg-semi-color-bg-0 p-5 rounded-xl border border-semi-color-border/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end shadow-sm select-none">
        <div className="flex flex-col gap-1.5">
          <label className="block text-[11px] font-bold text-semi-color-text-2 tracking-widest uppercase">调用状态</label>
          <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v as LogStatusFilter); setPage(1) }}>
            <SelectTrigger className="w-full bg-semi-color-fill-0/30">
              <SelectValue placeholder="选择状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部请求</SelectItem>
              <SelectItem value="success">仅成功</SelectItem>
              <SelectItem value="failed">仅失败</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="block text-[11px] font-bold text-semi-color-text-2 tracking-widest uppercase">模型名称</label>
          <Input
            value={modelFilter}
            onChange={(e) => { setModelFilter(e.target.value); setPage(1) }}
            placeholder="如: gpt-4o-mini"
            className="bg-semi-color-fill-0/30"
          />
        </div>

        <div className="flex flex-col gap-1.5 lg:col-span-2">
          <label className="block text-[11px] font-bold text-semi-color-text-2 tracking-widest uppercase">关键词检索</label>
          <Input
            placeholder="输入 Request ID 快速检索"
            prefix={<LuSearch className="opacity-50" />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full bg-semi-color-fill-0/30"
          />
        </div>
      </div>

      {/* 极简细线条无框 Table 视图 */}
      <div className="rounded-xl border border-semi-color-border/60 overflow-hidden bg-semi-color-bg-0">
        {isLoading ? (
          <div className="py-20 text-center text-xs text-semi-color-text-2">
            <div className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-brand-base" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>正在加载调用日志...</span>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-xs italic text-semi-color-text-2">
            未找到匹配的日志记录
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>请求时间</TableHead>
                  <TableHead>Request ID</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>状态码</TableHead>
                  <TableHead>耗时</TableHead>
                  <TableHead>Token 消耗</TableHead>
                  <TableHead>调用密钥</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((row) => (
                  <TableRow key={row.call_log_id}>
                    <TableCell className="text-xs text-semi-color-text-1">
                      {formatDateTime(row.started_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-semi-color-text-0 max-w-[140px] truncate select-all">
                      {row.request_id}
                    </TableCell>
                    <TableCell className="font-semibold text-semi-color-text-0 text-[13.5px]">
                      {row.model.display_name}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(row)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-semi-color-text-1 tabular-nums">
                      {row.duration_ms}ms
                    </TableCell>
                    <TableCell className="font-mono text-xs text-semi-color-text-1 tabular-nums">
                      {row.usage ? (
                        <span>
                          {row.usage.total_tokens} <span className="text-[10px] text-semi-color-text-2">({row.usage.input_tokens}p/{row.usage.output_tokens}c)</span>
                        </span>
                      ) : (
                        <span className="text-semi-color-text-2">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-semi-color-text-1 font-medium">
                      {row.api_key.name || <span className="text-semi-color-text-2">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedLog(row)}
                        className="h-7 text-xs font-semibold"
                      >
                        <LuEye className="w-3.5 h-3.5 mr-1" />
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* 分页控制 */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-semi-color-border gap-4 flex-wrap select-none">
              <span className="text-xs text-semi-color-text-2">
                共找到 {total} 条记录
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="h-8 font-semibold"
                >
                  上一页
                </Button>
                <span className="text-xs font-mono text-semi-color-text-1 bg-semi-color-fill-0 border border-semi-color-border px-3 py-1 rounded">
                  第 {page} 页
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasMore}
                  onClick={() => setPage(page + 1)}
                  className="h-8 font-semibold"
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 极简高雅的右侧 Sheet 日志抽屉 */}
      <Sheet open={!!selectedLog} onOpenChange={(open) => { if (!open) setSelectedLog(null) }}>
        <SheetContent className="sm:max-w-xl overflow-y-auto no-scrollbar">
          <SheetHeader>
            <SheetTitle>调用日志详情</SheetTitle>
          </SheetHeader>
          {selectedLog && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-semi-color-border/60 p-3.5 rounded-lg bg-semi-color-fill-0/20">
                  <p className="text-[10px] text-semi-color-text-2 uppercase font-bold tracking-widest">状态</p>
                  <div className="mt-1.5">{getStatusBadge(selectedLog)}</div>
                </div>
                <div className="border border-semi-color-border/60 p-3.5 rounded-lg bg-semi-color-fill-0/20">
                  <p className="text-[10px] text-semi-color-text-2 uppercase font-bold tracking-widest">总耗时</p>
                  <p className="text-base font-bold text-semi-color-text-0 font-mono mt-1">{selectedLog.duration_ms}ms</p>
                </div>
              </div>

              <div className="space-y-1 select-all">
                <DetailRow label="Request ID" value={selectedLog.request_id} mono />
                <DetailRow label="调用模型" value={selectedLog.model.display_name} />
                <DetailRow label="调用时间" value={formatDateTime(selectedLog.started_at)} />
                <DetailRow label="API Key 名称" value={selectedLog.api_key.name || '—'} />
                <DetailRow label="Token 消耗数量" value={selectedLog.usage ? `${selectedLog.usage.total_tokens} (Prompt: ${selectedLog.usage.input_tokens} / Completion: ${selectedLog.usage.output_tokens})` : '—'} />
              </div>

              {selectedLog.error && (
                <div className="border border-rose-500/10 bg-rose-500/[0.03] p-4 rounded-xl space-y-2 border-l-4 border-l-rose-500">
                  <p className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                    <IoAlertCircle className="w-4 h-4 shrink-0" />
                    异常报错信息
                  </p>
                  <pre className="text-xs text-rose-600 dark:text-rose-400 font-mono break-all whitespace-pre-wrap leading-relaxed select-all">
                    {selectedLog.error}
                  </pre>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-semi-color-text-2 uppercase font-bold tracking-widest mb-2 flex items-center gap-1">
                    <LuCalendar className="w-3.5 h-3.5" />
                    请求内容 (Prompt Payload)
                  </p>
                  <pre className="text-[11.5px] text-slate-300 bg-slate-950 p-4 rounded-xl border border-semi-color-border/40 font-mono overflow-x-auto max-h-56 leading-relaxed select-all">
                    {JSON.stringify(selectedLog.provider, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-semi-color-border/40 gap-4">
      <span className="text-xs font-bold text-semi-color-text-2 shrink-0">{label}</span>
      <span className={`text-xs text-semi-color-text-0 font-semibold text-right break-all max-w-[340px] select-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
