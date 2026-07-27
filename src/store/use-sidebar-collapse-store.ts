import { create } from 'zustand'

/**
 * Console 左侧导航栏折叠状态（PRD 1.0.4 模型体验 §7.3）：
 * 从 1 个模型增加到 2 个模型进入对比时，需要先记录用户当前的侧栏偏好、
 * 自动收起一次；退出对比或离开模型体验时恢复该偏好。这个交互跨路由
 * （对比页 ↔ Console 其它页面），侧栏折叠状态必须提升到全局 store 才能
 * 被模型体验页读写，不能再是 DashboardLayout 内部的私有 useState。
 */
interface SidebarCollapseState {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  /** 记录的"进入对比前"偏好；null 表示当前没有待恢复的记录 */
  savedPreference: boolean | null
  /** 保存当前偏好并强制收起（只在从 1→2 模型那一刻调用一次，不重复保存） */
  collapseForCompare: () => void
  /** 恢复之前保存的偏好；没有记录时不做任何事 */
  restoreSavedPreference: () => void
}

export const useSidebarCollapseStore = create<SidebarCollapseState>()((set, get) => ({
  collapsed: false,
  setCollapsed: (collapsed) => set({ collapsed }),
  savedPreference: null,
  collapseForCompare: () => {
    if (get().savedPreference !== null) return
    set({ savedPreference: get().collapsed, collapsed: true })
  },
  restoreSavedPreference: () => {
    const saved = get().savedPreference
    if (saved === null) return
    set({ collapsed: saved, savedPreference: null })
  },
}))
