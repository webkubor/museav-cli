/**
 * 历史会话侧栏（PRD 1.0.4 §7.8）
 * 收起态：窄图标轨（展开历史 + 新建会话，hover/focus 出 tooltip）。
 * 展开态：248px 内联侧栏，顶部新建会话按钮 + 按日期分组（今天/最近7天/更早）的会话列表。
 * 受控组件：collapsed/sessions/activeSessionId 均由外部传入，本组件不拉取数据。
 */
import { useMemo } from 'react'
import { LuHistory, LuPanelLeftOpen, LuPlus, LuCircleOff } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { formatRelativeTime } from '@/lib/format-date'
import '@/pages/models/styles/history-session-sidebar.css'

export interface HistorySessionItem {
  id: string
  name: string
  updatedAt: string // ISO 时间
  category: 'dialogue' | 'image' | 'audio' | 'video'
  task: string
  models: Array<{ id: string; name: string; offline?: boolean }>
}

interface HistorySessionSidebarProps {
  collapsed: boolean
  onToggleCollapsed: (collapsed: boolean) => void
  /** 外部传入；本组件不负责拉取数据。省略时兜底内置 mock，供开发自测使用 */
  sessions?: HistorySessionItem[]
  activeSessionId?: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
}

const CATEGORY_META: Record<HistorySessionItem['category'], { label: string; variant: BadgeVariant }> = {
  dialogue: { label: '对话', variant: 'info' },
  image: { label: '图像', variant: 'purple' },
  audio: { label: '音频', variant: 'success' },
  video: { label: '视频', variant: 'warning' },
}

// 开发自测用内置 mock（组件本身仍是受控的：仅供本文件外的调用方在开发期传入 sessions 参考，不在组件内部使用）
const MOCK_HISTORY_SESSIONS: HistorySessionItem[] = [
  {
    id: 'sess-1',
    name: '产品文案润色 —— 首页 Hero 区块多版本对比',
    updatedAt: new Date().toISOString(),
    category: 'dialogue',
    task: '文本生成',
    models: [{ id: 'm1', name: 'GPT-4o' }, { id: 'm2', name: 'Claude 3.5 Sonnet' }],
  },
  {
    id: 'sess-2',
    name: '海报主视觉生成',
    updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    category: 'image',
    task: '图像生成',
    models: [{ id: 'm3', name: 'FLUX.1' }],
  },
  {
    id: 'sess-3',
    name: '客服播报语音合成测试',
    updatedAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
    category: 'audio',
    task: '语音合成',
    models: [{ id: 'm4', name: 'Old-TTS-v1', offline: true }],
  },
  {
    id: 'sess-4',
    name: '产品宣传短片分镜生成',
    updatedAt: new Date(Date.now() - 15 * 86400_000).toISOString(),
    category: 'video',
    task: '视频生成',
    models: [{ id: 'm5', name: 'Gen-Video-2' }, { id: 'm6', name: 'Gen-Video-2-HD' }],
  },
]

/** 日期分组：今天 / 最近7天（含昨天，不含今天）/ 更早——按本地日历日比较，非 24h 滑动窗口 */
function groupByDate(sessions: HistorySessionItem[]) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = startOfDay(new Date())
  const groups: { key: string; label: string; items: HistorySessionItem[] }[] = [
    { key: 'today', label: '今天', items: [] },
    { key: 'recent7', label: '最近 7 天', items: [] },
    { key: 'earlier', label: '更早', items: [] },
  ]
  const sorted = [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  for (const session of sorted) {
    const day = startOfDay(new Date(session.updatedAt))
    const diffDays = Math.round((today - day) / 86400_000)
    if (diffDays <= 0) groups[0].items.push(session)
    else if (diffDays <= 7) groups[1].items.push(session)
    else groups[2].items.push(session)
  }
  return groups.filter((g) => g.items.length > 0)
}

export function HistorySessionSidebar({
  collapsed,
  onToggleCollapsed,
  sessions = MOCK_HISTORY_SESSIONS,
  activeSessionId,
  onSelectSession,
  onNewSession,
}: HistorySessionSidebarProps) {
  const groups = useMemo(() => groupByDate(sessions), [sessions])

  if (collapsed) {
    return (
      <div className="history-sidebar-rail" role="navigation" aria-label="历史会话（收起）">
        <button
          type="button"
          title="展开历史会话"
          aria-label="展开历史会话"
          className="history-sidebar-rail-btn"
          onClick={() => onToggleCollapsed(false)}
        >
          <LuPanelLeftOpen size={18} />
        </button>
        <button
          type="button"
          title="新建会话"
          aria-label="新建会话"
          className="history-sidebar-rail-btn"
          onClick={onNewSession}
        >
          <LuPlus size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="history-sidebar-panel" role="navigation" aria-label="历史会话">
      <div className="history-sidebar-panel-header">
        <button
          type="button"
          title="收起历史会话"
          aria-label="收起历史会话"
          className="history-sidebar-rail-btn"
          onClick={() => onToggleCollapsed(true)}
        >
          <LuHistory size={16} />
        </button>
        <span className="history-sidebar-panel-title">历史会话</span>
      </div>

      <Button variant="brand" size="sm" className="history-sidebar-new-btn" onClick={onNewSession}>
        <LuPlus size={14} className="mr-1" /> 新建会话
      </Button>

      <div className="history-sidebar-list">
        {groups.length === 0 ? (
          <div className="history-sidebar-empty">暂无历史会话</div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="history-sidebar-group">
              <div className="history-sidebar-group-label">{group.label}</div>
              {group.items.map((session) => {
                const hasOffline = session.models.some((m) => m.offline)
                const categoryMeta = CATEGORY_META[session.category]
                const isActive = session.id === activeSessionId
                return (
                  <button
                    key={session.id}
                    type="button"
                    className={cn('history-sidebar-item', isActive && 'history-sidebar-item-active')}
                    onClick={() => onSelectSession(session.id)}
                  >
                    <div className="history-sidebar-item-top">
                      <span className="history-sidebar-item-name" title={session.name}>
                        {session.name}
                      </span>
                      <span className="history-sidebar-item-time">{formatRelativeTime(session.updatedAt)}</span>
                    </div>
                    <div className="history-sidebar-item-tags">
                      <Badge variant={categoryMeta.variant} size="xs">
                        {categoryMeta.label}
                      </Badge>
                      <Badge variant="secondary" size="xs">
                        {session.task}
                      </Badge>
                    </div>
                    <div className="history-sidebar-item-models">
                      {session.models.slice(0, 3).map((model) => (
                        <span
                          key={model.id}
                          className={cn('history-sidebar-model-chip', model.offline && 'history-sidebar-model-chip-offline')}
                        >
                          {model.offline && <LuCircleOff size={11} />}
                          {model.name}
                        </span>
                      ))}
                    </div>
                    {hasOffline && <div className="history-sidebar-offline-flag">部分模型已下线</div>}
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
