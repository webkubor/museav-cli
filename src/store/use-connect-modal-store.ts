import { create } from 'zustand'

interface ConnectModalUiState {
  isOpen: boolean
  open: () => void
  close: () => void
}

/**
 * 快速接入弹窗的全局开关。顶栏「快速接入」按钮和新手指南第 4 步「去接入」必须
 * 打开**同一个**弹窗（规格 2026-08-06 §7.3：不建设两套配置界面），而两者不在同
 * 一棵组件树里，所以开关提到 store。弹窗本体仍挂在 DashboardHeader 里，只此一份。
 */
export const useConnectModalStore = create<ConnectModalUiState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
