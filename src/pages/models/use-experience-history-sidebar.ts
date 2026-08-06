/**
 * 历史会话侧栏的共享逻辑（playground 单列 ↔ compare 多列共用）
 *
 * 抽取自 use-models-playground.tsx 和 use-models-compare-state.tsx 里逐字复制的：
 *   - refreshHistorySessions（拉列表 + mapSessionToHistoryItem 映射）
 *   - renameHistorySession（乐观更新 + 失败回滚）
 *   - deleteHistorySession（删成功才改本地列表；删的是当前会话则交回调）
 *   - historyCollapsed 副作用（展开时刷新）
 *
 * 不包含（各页面语义不同，由调用方自己管）：
 *   - startNewSession（playground 重置单列，compare 退回单模型页）—— 通过 onDeletedCurrent 回调注入
 *   - 跨租户失效 useEffect（依赖各自的 startNewSession + tenantId，见各 hook）
 *   - openHistorySession（恢复历史的列/消息结构差异大，各自实现）
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  listExperienceSessions,
  renameExperienceSession,
  deleteExperienceSession,
} from '@/services/experience-sessions'
import { appToast } from '@/lib/app-toast'
import { mapSessionToHistoryItem, type HistorySessionItem } from './history-session-mapper'

export interface UseExperienceHistorySidebarOptions {
  /** 当前打开的会话 id；删除命中它时触发 onDeletedCurrent（用于重置工作区） */
  sessionId: string | null
  /** 模型目录，用于把 model_id 翻译成可读名 + 判断离线 */
  allModels: Array<{ model_id: string; display_name: string; vendor?: string | null; provider?: string | null }>
  /** 任务枚举 → 可读文案（experienceTaskLabel） */
  taskLabel: (task: string) => string | undefined
  /** 删除的正是当前会话时调用（playground 传 startNewSession，compare 传退回单模型页） */
  onDeletedCurrent: () => void
}

export interface UseExperienceHistorySidebarReturn {
  historyCollapsed: boolean
  setHistoryCollapsed: (collapsed: boolean) => void
  historySessions: HistorySessionItem[]
  setHistorySessions: React.Dispatch<React.SetStateAction<HistorySessionItem[]>>
  /** 拉取真实历史会话列表；失败不抛，侧栏保持空态。返回列表供调用方做"恢复第一条"等后续操作 */
  refreshHistorySessions: () => Promise<HistorySessionItem[]>
  /** 双击重命名：乐观更新 + 失败回滚 */
  renameHistorySession: (id: string, name: string) => Promise<void>
  /** 删除会话：删成功才改本地列表（不可撤销，不做乐观更新）；命中当前会话则调 onDeletedCurrent */
  deleteHistorySession: (id: string) => Promise<void>
}

export function useExperienceHistorySidebar(
  opts: UseExperienceHistorySidebarOptions,
): UseExperienceHistorySidebarReturn {
  const { sessionId, allModels, taskLabel, onDeletedCurrent } = opts
  const { t } = useTranslation()
  const [historyCollapsed, setHistoryCollapsed] = useState(true)
  const [historySessions, setHistorySessions] = useState<HistorySessionItem[]>([])

  /** 拉取真实历史会话列表供侧栏展示；失败不阻塞主流程，侧栏保持空态 */
  async function refreshHistorySessions(): Promise<HistorySessionItem[]> {
    try {
      const { items } = await listExperienceSessions({ limit: 20, offset: 0 })
      const sessions = items.map((session) => mapSessionToHistoryItem(session, allModels, taskLabel))
      setHistorySessions(sessions)
      return sessions
    } catch {
      return []
    }
  }

  /** 双击重命名（HistorySessionSidebar）：乐观更新 + 失败回滚，name 传空串会清空标题交回自动命名 */
  async function renameHistorySession(id: string, name: string) {
    const prev = historySessions
    setHistorySessions((cur) => cur.map((s) => (s.id === id ? { ...s, name } : s)))
    try {
      await renameExperienceSession(id, name)
    } catch {
      setHistorySessions(prev)
      appToast.error(t('modelsExperience.historySidebar.renameError'))
    }
  }

  /** 删除会话记录（shared/modelgo_prd#362）：删成功再改本地列表——删除不可撤销，
   *  乐观更新一旦失败会让「已经消失的卡片」再冒出来，不如等接口回。
   *  删掉的正是当前打开的会话时，交给 onDeletedCurrent 重置工作区，避免继续往已删 session 发消息。 */
  async function deleteHistorySession(id: string) {
    try {
      await deleteExperienceSession(id)
      setHistorySessions((cur) => cur.filter((s) => s.id !== id))
      if (sessionId === id) onDeletedCurrent()
      appToast.success(t('modelsExperience.historySidebar.deleteSuccess'))
    } catch {
      appToast.error(t('modelsExperience.historySidebar.deleteError'))
    }
  }

  // 展开侧栏时刷新（收起期间数据可能过期）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!historyCollapsed) void refreshHistorySessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyCollapsed])

  return {
    historyCollapsed,
    setHistoryCollapsed,
    historySessions,
    setHistorySessions,
    refreshHistorySessions,
    renameHistorySession,
    deleteHistorySession,
  }
}
