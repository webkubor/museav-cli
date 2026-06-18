import { LuBot, LuKeyRound, LuChartBar } from 'react-icons/lu'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { useAuthStore } from '@/store/auth'
import { useNavigate } from 'react-router-dom'
import { getUsageRankingsModels, getUsageRankingsApiKeys } from '@/services/usage'
import { ModelIcon, type ModelIconLike } from '@/features/models/components/ModelIcon'
import { Money } from '@/components/ui/Money'
import type { UsageRankingItem } from '@/types'
import './dashboard-rankings-section.css'

interface DisplayItem {
  rank: string
  name: string
  meta: string
  spendAmount?: string
  spendCurrency?: string
  key: string
  iconModel?: ModelIconLike
}

function toDisplay(
  item: UsageRankingItem,
  index: number,
  type: 'models' | 'api-keys'
): DisplayItem {
  const tokens = item.tokens ? `${(item.tokens / 1000).toFixed(1)}K tokens` : ''
  const calls = `${item.requests ?? 0} calls`
  return {
    rank: String(item.rank ?? index + 1).padStart(2, '0'),
    name: item.name || item.key || '—',
    meta: tokens ? `${tokens} · ${calls}` : calls,
    spendAmount: item.spend?.amount,
    spendCurrency: item.spend?.currency,
    key: item.key ?? '',
    // 仅模型排行用模型图标；API Key 排行用 key 图标（cfg.icon），避免把 key id 当模型渲染
    iconModel: type === 'models' && item.key
      ? { display_name: item.name || item.key, vendor: item.key }
      : undefined,
  }
}

function getMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: from.toISOString(), to: now.toISOString() }
}

const CONFIG = {
  models: {
    title: '模型消费排行',
    caption: '本月',
    icon: <LuBot aria-hidden />,
    emptyTitle: '暂无数据',
    emptyDesc: '本月还没有模型调用记录',
    link: '/models/catalog',
    linkLabel: '查看全部模型',
  },
  'api-keys': {
    title: 'API Key 消费排行',
    caption: '本月',
    icon: <LuKeyRound aria-hidden />,
    emptyTitle: '暂无数据',
    emptyDesc: '本月还没有 API Key 调用记录',
    link: '/settings/workspace',
    linkLabel: '管理 API Key',
  },
} as const

export function UsageRankingsSection({ type }: { type: 'models' | 'api-keys' }) {
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const navigate = useNavigate()
  const { from, to } = getMonthRange()
  const cfg = CONFIG[type]

  const { data } = useQuery({
    queryKey: ['usage-rankings', type, tenantId],
    queryFn: () =>
      type === 'models'
        ? getUsageRankingsModels({ from, to, limit: 5 })
        : getUsageRankingsApiKeys({ from, to, limit: 5 }),
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  })

  const items = (data?.items ?? []).map((item, i) => toDisplay(item, i, type))

  function handleRowClick(item: DisplayItem) {
    if (type === 'models' && item.key) {
      navigate('/models/playground', { state: { selectedModelId: item.key } })
    } else {
      navigate(cfg.link)
    }
  }

  return (
    <Card glass className="dashboard-ranking-card h-full flex flex-col">
      <div className="dashboard-ranking-header">
        <div>
          <h3>{cfg.title}</h3>
          <p>{cfg.caption}</p>
        </div>
        <LuChartBar aria-hidden />
      </div>

      <div className="dashboard-ranking-list flex-1">
        {items.length === 0 ? (
          <div className="dashboard-ranking-row" data-tone="cyan">
            <span className="dashboard-ranking-copy">
              <strong>{cfg.emptyTitle}</strong>
              <small>{cfg.emptyDesc}</small>
            </span>
          </div>
        ) : (
          items.map((item) => (
            <div
              className="dashboard-ranking-row cursor-pointer"
              key={item.rank}
              onClick={() => handleRowClick(item)}
            >
              <span className="dashboard-ranking-rank">{item.rank}</span>
              <span className="dashboard-ranking-icon">
                {item.iconModel ? (
                  <ModelIcon model={item.iconModel} size={22} />
                ) : (
                  cfg.icon
                )}
              </span>
              <span className="dashboard-ranking-copy">
                <strong>{item.name}</strong>
                <small>{item.meta}</small>
              </span>
              <Money
                amount={item.spendAmount}
                currency={item.spendCurrency}
                className="dashboard-ranking-value"
              />
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate(cfg.link)}
        className="dashboard-ranking-note mt-3 bg-transparent border-0 cursor-pointer p-0 w-full"
      >
        <LuChartBar size={13} />
        <span>{cfg.linkLabel}</span>
      </button>
    </Card>
  )
}
