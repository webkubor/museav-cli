import {
  LuActivity,
  LuChartBar,
  LuBot,
  LuCode,
  LuKeyRound,
  LuListTree,
  LuSearch,
  LuSquareTerminal,
} from 'react-icons/lu'
import { Card } from '@/components/ui/Card'
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

const modelRankings: RankingItem[] = [
  {
    rank: '01',
    name: 'qwen/qwen3.7-max',
    meta: '企业知识库问答 · 低延迟',
    score: '98.6',
    tone: 'emerald',
    icon: <LuBot />,
  },
  {
    rank: '02',
    name: 'deepseek-r1',
    meta: '复杂推理 · 代码分析',
    score: '96.2',
    tone: 'cyan',
    icon: <LuActivity />,
  },
  {
    rank: '03',
    name: 'claude-opus-4.7-fast',
    meta: '长上下文 · 稳定输出',
    score: '94.8',
    tone: 'violet',
    icon: <LuListTree />,
  },
]

const skillRankings: RankingItem[] = [
  {
    rank: '01',
    name: 'CLI 快速接入',
    meta: '本地开发 · 一键验证',
    score: '12.4k',
    tone: 'emerald',
    icon: <LuSquareTerminal />,
  },
  {
    rank: '02',
    name: 'API Key 管理',
    meta: '密钥轮换 · 权限隔离',
    score: '9.8k',
    tone: 'amber',
    icon: <LuKeyRound />,
  },
  {
    rank: '03',
    name: '日志 Payload 追踪',
    meta: '请求排障 · 原始数据',
    score: '8.6k',
    tone: 'cyan',
    icon: <LuSearch />,
  },
]

function RankingCard({ title, caption, items }: { title: string; caption: string; items: RankingItem[] }) {
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
        {items.map((item) => (
          <div className="dashboard-ranking-row" data-tone={item.tone} key={item.name}>
            <span className="dashboard-ranking-rank">{item.rank}</span>
            <span className="dashboard-ranking-icon">{item.icon}</span>
            <span className="dashboard-ranking-copy">
              <strong>{item.name}</strong>
              <small>{item.meta}</small>
            </span>
            <span className="dashboard-ranking-score">{item.score}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function DashboardRankingsSection() {
  return (
    <section className="dashboard-rankings-section">
      <RankingCard title="热门模型排行榜" caption="当前高频体验与调用模型" items={modelRankings} />
      <RankingCard title="热门 Skills" caption="开发者最常使用的工作流" items={skillRankings} />
      <div className="dashboard-ranking-note">
        <LuCode aria-hidden />
        <span>榜单结构先按产品展示做静态承载，后续可直接替换为真实统计接口。</span>
      </div>
    </section>
  )
}
