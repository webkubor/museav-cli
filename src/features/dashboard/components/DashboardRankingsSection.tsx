import { LuBot, LuChartBar } from 'react-icons/lu'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { useAuthStore } from '@/store/auth'
import { getRankings, type RankingApiItem } from '@/services/overview'
import './dashboard-rankings-section.css'

type RankingTone = 'emerald' | 'cyan' | 'violet' | 'amber'

interface RankingItem {
  rank: string
  name: string
  meta: string
  score: string
  tone: RankingTone
  icon: React.ReactNode
}

const TONES: RankingTone[] = ['emerald', 'cyan', 'violet', 'amber']

/** 后端真实聚合行 → 展示行（rank 补零、tone 轮转） */
function toRankingItem(item: RankingApiItem, index: number): RankingItem {
  return {
    rank: item.rank.padStart(2, '0'),
    name: item.name,
    meta: item.meta,
    score: item.score,
    tone: TONES[index % TONES.length],
    icon: <LuBot aria-hidden />,
  }
}

function RankingCard({
  title,
  caption,
  items,
}: {
  title: string
  caption: string
  items: RankingItem[]
}) {
  return (
    <Card glass className="dashboard-ranking-card">
      <div className="dashboard-ranking-header">
        <div>
          <h3>{title}</h3>
          <p>{caption}</p>
        </div>
        <LuChartBar aria-hidden />
      </div>

      <div className="dashboard-ranking-list">
        {items.length === 0 ? (
          <div className="dashboard-ranking-row" data-tone="cyan">
            <span className="dashboard-ranking-copy">
              <strong>暂无数据</strong>
              <small>近 30 天还没有模型调用记录</small>
            </span>
          </div>
        ) : (
          items.map((item) => (
            <div className="dashboard-ranking-row" data-tone={item.tone} key={item.name}>
              <span className="dashboard-ranking-rank">{item.rank}</span>
              <span className="dashboard-ranking-icon">{item.icon}</span>
              <span className="dashboard-ranking-copy">
                <strong>{item.name}</strong>
                <small>{item.meta}</small>
              </span>
              <span className="dashboard-ranking-score">{item.score}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

/**
 * Dashboard 排行榜（#98）：models 榜来自 observer 真实聚合（近 30 天调用量
 * Top3）。skills 榜后端恒返回空（平台无 skills 数据源，不造假数据）——
 * 列表为空时整张卡片隐藏。
 */
export function DashboardRankingsSection({ compact }: { compact?: boolean }) {
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const { data } = useQuery({
    queryKey: ['overview', 'rankings', tenantId],
    queryFn: () => getRankings(tenantId),
    enabled: !!tenantId,
  })

  const models = (data?.models ?? []).map(toRankingItem)
  const skills = (data?.skills ?? []).map(toRankingItem)

  return (
    <section className={`dashboard-rankings-section${compact ? ' dashboard-rankings-section--compact' : ''}`}>
      <RankingCard title="热门模型排行榜" caption="近 30 天调用量 Top 3" items={models} />
      {skills.length > 0 && (
        <RankingCard title="热门 Skills" caption="开发者最常使用的工作流" items={skills} />
      )}
    </section>
  )
}
