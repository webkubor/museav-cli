import { LuBot, LuKeyRound, LuChartBar } from 'react-icons/lu'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { useAuthStore } from '@/store/auth'
import { useNavigate } from 'react-router-dom'
import { getUsageRankingsModels, getUsageRankingsApiKeys } from '@/services/generated-api'
import { listModels } from '@/services/catalog'
import { ModelIcon, type ModelIconLike } from '@/features/models/components/ModelIcon'
import { useCurrency } from '@/hooks/use-platform-config'
import type { UsageRankingItem } from '@/types/generated-api-types'
import './dashboard-rankings-section.css'

type RankingTone = 'emerald' | 'cyan' | 'violet' | 'amber'

interface DisplayItem {
  rank: string
  name: string
  meta: string
  score: string
  tone: RankingTone
  key: string
  iconModel?: ModelIconLike
}

const TONES: RankingTone[] = ['emerald', 'cyan', 'violet', 'amber']

function toDisplay(
  item: UsageRankingItem,
  index: number,
  symbol: string,
  iconMap: Map<string, ModelIconLike>
): DisplayItem {
  const amount = item.spend?.amount ? `${symbol}${parseFloat(item.spend.amount).toFixed(4)}` : '—'
  const tokens = item.tokens ? `${(item.tokens / 1000).toFixed(1)}K` : ''
  return {
    rank: String(item.rank ?? index + 1).padStart(2, '0'),
    name: item.name || item.key || '—',
    meta: tokens ? `${tokens} tokens · ${item.requests ?? 0} calls` : `${item.requests ?? 0} calls`,
    score: amount,
    tone: TONES[index % TONES.length],
    key: item.key ?? '',
    iconModel: item.key
      ? (iconMap.get(item.key) ?? { display_name: item.name || item.key, vendor: item.key.split('/')[0] })
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
    caption: '本月模型调用量排行',
    icon: <LuBot aria-hidden />,
    emptyTitle: '暂无数据',
    emptyDesc: '本月还没有模型调用记录',
    link: '/models/catalog',
    linkLabel: '查看全部模型',
  },
  'api-keys': {
    title: 'API Key 消费排行',
    caption: '本月 API Key 调用量排行',
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
  const { symbol } = useCurrency()
  const { from, to } = getMonthRange()
  const cfg = CONFIG[type]

  const { data } = useQuery({
    queryKey: ['usage-rankings', type, tenantId],
    queryFn: () =>
      type === 'models'
        ? getUsageRankingsModels({ from, to, limit: 5 })
        : getUsageRankingsApiKeys({ from, to, limit: 5 }),
    enabled: !!tenantId,
  })

  // 仅模型排行需要 logo，复用目录页同一查询（react-query 去重，不重复请求）
  const { data: modelsData } = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ limit: 100 }),
    staleTime: 5 * 60_000,
    enabled: type === 'models',
  })

  const iconMap = new Map<string, ModelIconLike>()
  for (const m of modelsData?.items ?? []) {
    iconMap.set(m.model_id, { logo_url: m.logo_url, vendor: m.vendor, display_name: m.display_name })
  }

  const items = (data?.items ?? []).map((item, i) => toDisplay(item, i, symbol, iconMap))

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
              className="dashboard-ranking-row cursor-pointer hover:shadow-sm transition-shadow"
              data-tone={item.tone}
              key={item.rank}
              onClick={() => handleRowClick(item)}
            >
              <span className="dashboard-ranking-rank">{item.rank}</span>
              <span className="dashboard-ranking-icon">
                {item.iconModel ? (
                  <ModelIcon model={item.iconModel} size={24} />
                ) : (
                  cfg.icon
                )}
              </span>
              <span className="dashboard-ranking-copy">
                <strong>{item.name}</strong>
                <small>{item.meta}</small>
              </span>
              <span className="dashboard-ranking-score">{item.score}</span>
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
