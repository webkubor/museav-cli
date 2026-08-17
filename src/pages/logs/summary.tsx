/**
 * 调用日志 Summary 指标条（需求方#668）
 * 位置：筛选器下方、已选筛选标签上方；始终按当前视图/记录类型/全部筛选计算，与列表口径一致。
 * 后端契约 qa#605：交付前 /model-logs/stats 仅回 requests/tokens/spend，其余指标显「—」；
 * 交付后由 services/logs 的 toLogsSummary 映射自动补全，本组件不感知契约差异。
 * PRD 数值规则：比例 1 位小数；分母为 0 / 无有效耗时费用显「—」；Token 紧凑格式；只看不可点。
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth'
import { useCurrency } from '@/hooks/use-platform-config'
import { formatMoney } from '@/lib/utils'
import { formatDuration } from '@/lib/format-date'
import { abbreviateNumber } from '@/features/dashboard/workbench/shared'
import { getLogsSummary } from '@/services/logs'
import type { LogStatsParams } from '@/interfaces/logs'

const EM_DASH = '—'

/** 比例：分子/分母任一缺失或分母为 0 → —；保留 1 位小数 */
function pct(numerator: number | undefined, denominator: number | undefined) {
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || denominator <= 0) return EM_DASH
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function count(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString() : EM_DASH
}

function duration(ms: number | undefined) {
  return typeof ms === 'number' && ms > 0 ? formatDuration(ms) : EM_DASH
}

interface SummaryTile {
  label: string
  value: string
  sub?: string
}

/** 纯展示的六指标条（同步/异步共用外观）；无结果时显 —/0，不隐藏（PRD） */
export function SummaryTiles({ tiles, loading }: { tiles: SummaryTile[]; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-mg-border pt-4 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div key={tile.label} className="min-w-0 rounded-sm bg-mg-fill-0 px-3 py-2.5">
          <div className="mg-text-label text-mg-text-3">{tile.label}</div>
          {loading ? (
            <div className="mt-1.5 h-6 w-16 animate-pulse rounded-sm bg-mg-fill-1" />
          ) : (
            <>
              <div className="mt-0.5 truncate font-mono text-lg font-bold tabular-nums text-mg-text-1">{tile.value}</div>
              {tile.sub && <div className="mg-text-caption truncate text-mg-text-2">{tile.sub}</div>}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/** 同步调用 Summary：六项指标跟随全部筛选；拉取失败静默显 —，不打断列表主流程 */
export function SyncLogsSummary({ params }: { params: LogStatsParams }) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  const { data, isLoading } = useQuery({
    queryKey: ['logs-summary', activeTenantId, params],
    queryFn: () => getLogsSummary(params),
    enabled: Boolean(activeTenantId),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { silentError: true },
  })

  // 费用均值 = 总费用 ÷ 有费用记录数（PRD：避免未计费记录拉低均值）
  const avgCost = (() => {
    const total = Number(data?.total_cost?.amount)
    const records = data?.cost_records
    if (!Number.isFinite(total) || typeof records !== 'number' || records <= 0) return EM_DASH
    return formatMoney(total / records, symbol)
  })()

  const tiles: SummaryTile[] = [
    {
      label: t('logs.summary.totalCalls'),
      value: count(data?.total_requests),
      sub: t('logs.summary.totalTokens', {
        value: typeof data?.total_tokens === 'number' ? abbreviateNumber(data.total_tokens) : EM_DASH,
      }),
    },
    {
      // 护栏命中后继续执行并完成的请求计为成功（succeeded 口径），被拦截（rejected）不计
      label: t('logs.summary.successRate'),
      value: pct(data?.succeeded, data?.total_requests),
      sub: t('logs.summary.succeededCount', { value: count(data?.succeeded) }),
    },
    {
      label: t('logs.summary.guardrailHits'),
      value: count(data?.guardrail_hits),
      sub: t('logs.summary.hitRatio', { value: pct(data?.guardrail_hits, data?.total_requests) }),
    },
    {
      label: t('logs.summary.errors'),
      value: count(data?.failed),
      sub: t('logs.summary.errorRate', { value: pct(data?.failed, data?.total_requests) }),
    },
    {
      label: t('logs.summary.totalCost'),
      value: data?.total_cost ? formatMoney(data.total_cost.amount, symbol) : EM_DASH,
      sub: t('logs.summary.avgCost', { value: avgCost }),
    },
    {
      label: t('logs.summary.avgDuration'),
      value: duration(data?.avg_duration_ms),
      sub: t('logs.summary.avgTtft', { value: duration(data?.avg_ttft_ms) }),
    },
  ]

  return <SummaryTiles tiles={tiles} loading={isLoading} />
}
