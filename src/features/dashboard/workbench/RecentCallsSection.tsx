import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LuArrowUpRight } from 'react-icons/lu'
import { listCallLogs } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { Money } from '@/components/ui/Money'
import { formatDuration } from '@/lib/format-date'

/** 时间：MM-dd HH:mm:ss */
function formatSimple(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 模块 8：最近调用日志（最近 3 条）。
 * 列：时间 / 状态 / 模型 / 归属 / Token / 费用 / 延迟；「查看全部」跳 /logs。
 */
export function RecentCallsSection() {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const navigate = useNavigate()

  // 总览是租户级页面：最近调用按租户口径取，不读工作空间选择器的 activeWorkspaceId
  // （PRD §7.3：选择器只驱动 workspace 级页面）。视图×角色的数据裁剪归 #314。
  const { data, isLoading } = useQuery({
    queryKey: ['workbench', 'recent-logs', activeTenantId],
    queryFn: () => listCallLogs({ limit: 3 }),
    enabled: !!activeTenantId,
    staleTime: 30_000,
  })

  const items = data?.items ?? []

  return (
    <Card className="p-6 flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold text-base text-mg-text-1 m-0">{t('dashboard.workbench.recent.title')}</h3>
        <button
          type="button"
          onClick={() => navigate('/logs')}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-base hover:text-brand-deep cursor-pointer"
        >
          {t('dashboard.workbench.recent.viewAll')}
          <LuArrowUpRight size={14} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 py-2">
          {[0, 1, 2].map((i) => <div key={i} className="animate-pulse bg-mg-fill-2 rounded-sm h-6 w-full" />)}
        </div>
      ) : items.length > 0 ? (
        <div className="overflow-x-auto w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.workbench.recent.time')}</TableHead>
                <TableHead>{t('dashboard.workbench.recent.status')}</TableHead>
                <TableHead>{t('dashboard.workbench.recent.model')}</TableHead>
                <TableHead>{t('dashboard.workbench.recent.owner')}</TableHead>
                <TableHead>{t('dashboard.workbench.recent.tokens')}</TableHead>
                <TableHead>{t('dashboard.workbench.recent.cost')}</TableHead>
                <TableHead>{t('dashboard.workbench.recent.latency')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const rawModel = item.model?.display_name || '—'
                const model = rawModel.includes('/') ? rawModel.split('/').pop() : rawModel
                const owner = item.account?.display_name || item.api_key?.name || '—'
                return (
                  <TableRow key={item.call_log_id}>
                    <TableCell className="text-xs text-mg-text-3 whitespace-nowrap">{formatSimple(item.started_at)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={item.status === 'failed' ? 'destructive' : item.status === 'rejected' ? 'secondary' : 'default'}
                        size="sm"
                      >
                        {item.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-mg-text-1">{model}</TableCell>
                    <TableCell className="text-xs text-mg-text-2 max-w-[140px] truncate">{owner}</TableCell>
                    <TableCell className="text-xs text-mg-text-2 font-mono">{(item.usage?.total_tokens ?? 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Money amount={item.cost?.amount} currency={item.cost?.currency} />
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-2 font-mono whitespace-nowrap">{formatDuration(item.duration_ms)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span className="text-2xl mb-2">📭</span>
          <p className="text-xs text-mg-text-3 font-medium">{t('dashboard.workbench.recent.empty')}</p>
          <p className="mt-1 text-[11px] text-mg-text-4 max-w-[280px]">{t('dashboard.workbench.recent.emptyHint')}</p>
        </div>
      )}
    </Card>
  )
}
