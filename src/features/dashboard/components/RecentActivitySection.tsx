import React from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { listCallLogs } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import { useNavigate, useParams } from 'react-router-dom'
import { LuArrowUpRight } from 'react-icons/lu'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

/** 格式化日期：MM-dd HH:mm:ss */
function formatSimple(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const RecentActivitySection: React.FC = () => {
  const { t } = useTranslation()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { workspaceId } = useParams()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['logs', 'recent', activeTenantId, workspaceId],
    queryFn: () => listCallLogs({ limit: 10, workspace_id: workspaceId }),
    enabled: !!activeTenantId,
    staleTime: 30_000,
  })

  return (
    <Card className="p-6 h-full flex flex-col">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ fontWeight: 700, fontSize: '16px', color: 'var(--mg-text-0)', margin: 0 }}>{t('dashboard.recentLogs.title')}</h3>
        <button
          onClick={() => navigate('/logs')}
          className="text-xs bg-none border-none text-brand-base hover:text-brand-deep cursor-pointer font-semibold p-0 flex items-center gap-1 transition-colors"
        >
          {t('dashboard.recentLogs.viewAll')} <LuArrowUpRight size={14} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 py-4">
          <div className="animate-pulse bg-mg-fill-2 rounded h-5 w-full" />
          <div className="animate-pulse bg-mg-fill-2 rounded h-5 w-full" />
          <div className="animate-pulse bg-mg-fill-2 rounded h-5 w-full" />
          <div className="animate-pulse bg-mg-fill-2 rounded h-5 w-full" />
          <div className="animate-pulse bg-mg-fill-2 rounded h-5 w-full" />
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse text-sm">
             <thead>
              <tr className="border-b border-mg-border">
                <th className="py-2.5 px-3 font-semibold text-mg-text-2 text-xs">{t('dashboard.recentLogs.requestId')}</th>
                <th className="py-2.5 px-3 font-semibold text-mg-text-2 text-xs">{t('dashboard.recentLogs.model')}</th>
                <th className="py-2.5 px-3 font-semibold text-mg-text-2 text-xs">{t('dashboard.recentLogs.status')}</th>
                <th className="py-2.5 px-3 font-semibold text-mg-text-2 text-xs">{t('dashboard.recentLogs.duration')}</th>
                <th className="py-2.5 px-3 font-semibold text-mg-text-2 text-xs">Token</th>
                <th className="py-2.5 px-3 font-semibold text-mg-text-2 text-xs">Cost</th>
                <th className="py-2.5 px-3 font-semibold text-mg-text-2 text-xs">{t('dashboard.recentLogs.time')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item: any) => {
                const reqId = item.request_id.startsWith('gw_') ? item.request_id.slice(3) : item.request_id
                const rawModelName = item.model?.display_name || '—'
                const displayModelName = rawModelName.includes('/') ? rawModelName.split('/').pop() : rawModelName

                return (
                  <tr
                    key={item.call_log_id}
                    className="border-b border-mg-border hover:bg-mg-fill-0 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono text-xs text-mg-text-1">
                      {reqId.slice(0, 8)}...
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-mg-text-0 text-xs">
                      {displayModelName}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge variant={item.status === 'failed' ? 'destructive' : item.status === 'rejected' ? 'secondary' : 'default'} className="text-[10px] py-0.5 px-1.5 font-bold tracking-wider">
                        {item.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-mg-text-1">
                      {item.duration_ms}ms
                    </td>
                    <td className="py-2.5 px-3 text-xs text-mg-text-1 font-mono">
                      {item.usage?.total_tokens ?? 0}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-mg-text-1 font-mono">
                      {item.cost ? `${item.cost.currency === 'USD' ? '$' : '¥'}${parseFloat(item.cost.amount).toFixed(4)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-mg-text-2">
                      {formatSimple(item.started_at)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="text-2xl mb-2">📭</span>
          <p className="text-xs text-mg-text-2 font-medium">{t('dashboard.recentLogs.empty')}</p>
        </div>
      )}
    </Card>
  )
}
