/**
 * 模型体验工作台跨路由状态（qa#544，PRD 1.0.4 §7.1/§7.3/§8.2）。
 *
 * 单模型页 `/models/playground` 与对比页 `/models/compare` 此前把模型选择/会话/消息
 * 全部放在组件内 `useState`——路由切走（比如跳去看账单再切回来）触发卸载，这些状态
 * 就被扔了，PRD 要求「模型列和会话内容不因页面跳转而清空」。
 *
 * 用 zustand 模块级 store（非 persist）解决：store 生命周期跟 JS 模块一样，只要不刷新
 * 整页，组件卸载/重挂载都读到同一份状态。刷新整页/直接输入 URL 仍然重置——这是刻意的，
 * 对比页历史文件头部注释已经写明"刷新本页或输入 URL 没有历史恢复"，跟单模型页的
 * 会话恢复（§7.8，走 HistorySessionSidebar 从后端拉历史消息）是两回事，不重复造轮子。
 */
import { create } from 'zustand'
import type { CatalogModelItem } from '@/types'
import type { ExperienceMessage } from '@/pages/models/model-experience-data'

export interface SingleWorkbenchState {
  selectedId: string | null
  /** 历史会话引用的模型已不在目录里（下线/删除）时的占位展示（PRD §AC-18）。
   *  非空时 selectedId 无意义——渲染层优先读这个字段。 */
  offlineModel: CatalogModelItem | null
  sessionId: string | null
  conversationId: string | null
  messages: ExperienceMessage[]
  chatParams: Record<string, unknown>
  sessionStats: { requestCount: number; tokens: number; cost: number }
}

export interface CompareColumnState {
  model: CatalogModelItem
  conversationId: string
  history: ExperienceMessage[]
  streaming: boolean
  draft: string
  chatParams: Record<string, unknown>
}

export interface CompareWorkbenchState {
  sessionId: string | null
  columns: CompareColumnState[] | null
  sessionStats: { requestCount: number; tokens: number; cost: number }
}

const INITIAL_SINGLE: SingleWorkbenchState = {
  selectedId: null,
  offlineModel: null,
  sessionId: null,
  conversationId: null,
  messages: [],
  chatParams: {},
  sessionStats: { requestCount: 0, tokens: 0, cost: 0 },
}

const INITIAL_COMPARE: CompareWorkbenchState = {
  sessionId: null,
  columns: null,
  sessionStats: { requestCount: 0, tokens: 0, cost: 0 },
}

type Patch<T> = Partial<T> | ((state: T) => Partial<T>)

function resolvePatch<T>(patch: Patch<T>, state: T): Partial<T> {
  return typeof patch === 'function' ? (patch as (state: T) => Partial<T>)(state) : patch
}

interface ExperienceWorkbenchStore {
  single: SingleWorkbenchState
  compare: CompareWorkbenchState
  setSingle: (patch: Patch<SingleWorkbenchState>) => void
  setCompare: (patch: Patch<CompareWorkbenchState>) => void
  resetSingle: () => void
  resetCompare: () => void
}

export const useExperienceWorkbenchStore = create<ExperienceWorkbenchStore>()((set, get) => ({
  single: INITIAL_SINGLE,
  compare: INITIAL_COMPARE,
  setSingle: (patch) => set({ single: { ...get().single, ...resolvePatch(patch, get().single) } }),
  setCompare: (patch) => set({ compare: { ...get().compare, ...resolvePatch(patch, get().compare) } }),
  resetSingle: () => set({ single: INITIAL_SINGLE }),
  resetCompare: () => set({ compare: INITIAL_COMPARE }),
}))
