/**
 * 历史会话侧栏（PRD 1.0.4 §7.8）
 * 收起态：窄图标轨（展开历史 + 新建会话，hover/focus 出 tooltip）。
 * 展开态：248px 内联侧栏，顶部新建会话按钮 + 按日期分组（今天/最近7天/更早）的会话列表。
 * 受控组件：collapsed/sessions/activeSessionId 均由外部传入，本组件不拉取数据。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuHistory, LuPanelLeftOpen, LuPanelLeftClose, LuPlus, LuCircleOff, LuTrash2 } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { formatRelativeTime } from '@/lib/format-date'
import '@/pages/models/styles/history-session-sidebar.css'
import type { HistorySessionItem } from '../history-session-mapper'

export type { HistorySessionItem }

interface HistorySessionSidebarProps {
  collapsed: boolean
  onToggleCollapsed: (collapsed: boolean) => void
  /** 外部传入；本组件不负责拉取数据。省略时按空列表渲染 */
  sessions?: HistorySessionItem[]
  activeSessionId?: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  /** 双击会话标题重命名；传空串会清空标题，交回后端下次提问自动命名（省略则不启用双击重命名） */
  onRenameSession?: (id: string, name: string) => void
  /** 删除会话记录（shared/modelgo_prd#362）；省略则不渲染删除入口。
   *  返回 Promise 时按它决定 loading / 关弹窗时机 */
  onDeleteSession?: (id: string) => void | Promise<unknown>
}

const CATEGORY_META: Record<HistorySessionItem['category'], { labelKey: string; variant: BadgeVariant }> = {
  dialogue: { labelKey: 'modelsExperience.historySidebar.categoryDialogue', variant: 'info' },
  image: { labelKey: 'modelsExperience.historySidebar.categoryImage', variant: 'purple' },
  audio: { labelKey: 'modelsExperience.historySidebar.categoryAudio', variant: 'success' },
  video: { labelKey: 'modelsExperience.historySidebar.categoryVideo', variant: 'warning' },
}

/** 分组标签 key，渲染时按 t() 解析——放在这里而不是 groupByDate 里，因为 groupByDate 是纯函数不接 t */
const GROUP_LABEL_KEYS: Record<string, string> = {
  today: 'modelsExperience.historySidebar.groupToday',
  recent7: 'modelsExperience.historySidebar.groupRecent7',
  earlier: 'modelsExperience.historySidebar.groupEarlier',
}

/** 日期分组：今天 / 最近7天（含昨天，不含今天）/ 更早——按本地日历日比较，非 24h 滑动窗口 */
function groupByDate(sessions: HistorySessionItem[]) {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = startOfDay(new Date())
  const groups: { key: string; items: HistorySessionItem[] }[] = [
    { key: 'today', items: [] },
    { key: 'recent7', items: [] },
    { key: 'earlier', items: [] },
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
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
}: HistorySessionSidebarProps) {
  const { t } = useTranslation()
  const groups = useMemo(() => groupByDate(sessions), [sessions])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  /** 删除是破坏性操作，先出确认弹窗（对齐护栏/工作空间的删除交互），不做即点即删 */
  const [deleteTarget, setDeleteTarget] = useState<HistorySessionItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  function startEditing(session: HistorySessionItem) {
    if (!onRenameSession) return
    setEditingId(session.id)
    setEditValue(session.name)
  }

  function commitEditing(session: HistorySessionItem) {
    const next = editValue.trim()
    setEditingId(null)
    if (next !== session.name) onRenameSession?.(session.id, next)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await onDeleteSession?.(deleteTarget.id)
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  if (collapsed) {
    return (
      <div className="history-sidebar-rail" role="navigation" aria-label={t('modelsExperience.historySidebar.ariaCollapsed')}>
        {/* 两个图标贴合内容套一张 .mg-tile 小卡片，给一组按钮一个视觉边界
            （shared/modelgo_prd#314：之前裸放在页面背景上，跟原型的分组卡片不一致） */}
        <div className="mg-tile history-sidebar-rail-group">
          <button
            type="button"
            title={t('modelsExperience.historySidebar.railExpandLabel')}
            aria-label={t('modelsExperience.historySidebar.railExpandLabel')}
            className="history-sidebar-rail-btn"
            onClick={() => onToggleCollapsed(false)}
          >
            <LuPanelLeftOpen size={18} />
          </button>
          <button
            type="button"
            title={t('modelsExperience.historySidebar.railNewLabel')}
            aria-label={t('modelsExperience.historySidebar.railNewLabel')}
            className="history-sidebar-rail-btn"
            onClick={onNewSession}
          >
            <LuPlus size={18} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 窄屏展开态覆盖内容区（§8.5），宽屏这个背板 CSS 直接不渲染；点击背板等同收起 */}
      <div className="history-sidebar-backdrop" onClick={() => onToggleCollapsed(true)} aria-hidden="true" />
      <div className="history-sidebar-panel" role="navigation" aria-label={t('modelsExperience.historySidebar.ariaExpanded')}>
      <div className="history-sidebar-panel-header">
        <span className="history-sidebar-panel-title">
          <LuHistory size={14} className="text-mg-text-3" />
          {t('modelsExperience.historySidebar.title')}
        </span>
        {/* 收起按钮：onClick/aria-label 本来就是收起语义，只是图标用了 LuHistory（跟标题
            前缀图标重复，视觉上读不出"这是收起"），且排在标题左边——用户找右上角
            找不到收起入口（shared/modelgo_prd#314）。换成跟收起态 LuPanelLeftOpen 对称的
            LuPanelLeftClose，挪到右侧，header 改 space-between 顶开两端。 */}
        <button
          type="button"
          title={t('modelsExperience.historySidebar.collapseLabel')}
          aria-label={t('modelsExperience.historySidebar.collapseLabel')}
          className="history-sidebar-rail-btn"
          onClick={() => onToggleCollapsed(true)}
        >
          <LuPanelLeftClose size={16} />
        </button>
      </div>

      <Button variant="brand" size="sm" className="history-sidebar-new-btn" onClick={onNewSession}>
        <LuPlus size={14} className="mr-1" /> {t('modelsExperience.historySidebar.newSession')}
      </Button>

      <div className="history-sidebar-list">
        {groups.length === 0 ? (
          <div className="history-sidebar-empty">{t('modelsExperience.historySidebar.empty')}</div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="history-sidebar-group">
              <div className="history-sidebar-group-label">{t(GROUP_LABEL_KEYS[group.key])}</div>
              {group.items.map((session) => {
                const hasOffline = session.models.some((m) => m.offline)
                const categoryMeta = CATEGORY_META[session.category]
                const isActive = session.id === activeSessionId
                const isEditing = editingId === session.id
                return (
                  <div
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    className={cn('history-sidebar-item', isActive && 'history-sidebar-item-active')}
                    onClick={() => { if (!isEditing) onSelectSession(session.id) }}
                    onKeyDown={(e) => {
                      if (isEditing) return
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSession(session.id) }
                    }}
                  >
                    <div className="history-sidebar-item-top">
                      {isEditing ? (
                        <input
                          className="history-sidebar-item-name-input"
                          value={editValue}
                          autoFocus
                          onChange={(e) => setEditValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => commitEditing(session)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') { e.preventDefault(); commitEditing(session) }
                            else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
                          }}
                        />
                      ) : (
                        <span
                          className="history-sidebar-item-name"
                          title={session.name || t('modelsExperience.unnamedSession')}
                          onDoubleClick={(e) => { e.stopPropagation(); startEditing(session) }}
                        >
                          {session.name || t('modelsExperience.unnamedSession')}
                        </span>
                      )}
                      <span className="history-sidebar-item-time">{formatRelativeTime(session.updatedAt)}</span>
                    </div>
                    <div className="history-sidebar-item-tags">
                      <Badge variant={categoryMeta.variant} size="xs">
                        {t(categoryMeta.labelKey)}
                      </Badge>
                      <Badge variant="secondary" size="xs">
                        {session.task}
                      </Badge>
                    </div>
                    <div className="history-sidebar-item-models">
                      {session.models.slice(0, 3).map((model) => (
                        /* chip 是 inline-flex，裸文本节点吃不到 text-overflow——名称包一层
                           span 才能出省略号；全称用纯 CSS hover 气泡即时展示（对齐 InfoTip
                           模式，原生 title 有秒级延迟，视觉验收要求移入即显） */
                        <span
                          key={model.id}
                          className={cn('history-sidebar-model-chip', model.offline && 'history-sidebar-model-chip-offline')}
                        >
                          {model.offline && <LuCircleOff size={11} />}
                          <span className="history-sidebar-model-chip-name">{model.name}</span>
                          <span role="tooltip" className="history-sidebar-model-chip-tip">{model.name}</span>
                        </span>
                      ))}
                    </div>
                    {hasOffline && <div className="history-sidebar-offline-flag">{t('modelsExperience.historySidebar.offlineFlag')}</div>}
                    {onDeleteSession && (
                      <button
                        type="button"
                        className="history-sidebar-item-delete"
                        title={t('modelsExperience.historySidebar.deleteLabel')}
                        aria-label={t('modelsExperience.historySidebar.deleteLabel')}
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(session) }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <LuTrash2 size={13} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('modelsExperience.historySidebar.deleteModal.title')}
        description={t('modelsExperience.historySidebar.deleteModal.description', {
          name: deleteTarget?.name || t('modelsExperience.unnamedSession'),
        })}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('modelsExperience.historySidebar.deleteModal.cancel')}
            </Button>
            <Button variant="destructive" loading={deleting} onClick={() => void confirmDelete()}>
              {t('modelsExperience.historySidebar.deleteModal.confirm')}
            </Button>
          </>
        }
      />
    </>
  )
}
