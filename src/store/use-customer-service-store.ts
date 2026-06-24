import { create } from 'zustand'

interface CustomerServiceUiState {
  isOpen: boolean
  /** 待注入聊天输入框的草稿（如错误诊断信息）；被组件消费后置空。 */
  draft: string | null
  setOpen: (open: boolean) => void
  toggle: () => void
  /** 打开客服窗口，并把文本预填到输入框（不自动发送，留给用户补充描述）。 */
  openWithDraft: (text: string) => void
  clearDraft: () => void
}

/**
 * 客服窗口的全局开关 + 输入草稿通道。
 * 让窗口外的入口（如服务端错误弹窗「转给客服」）能打开客服并预填内容。
 */
export const useCustomerServiceStore = create<CustomerServiceUiState>()((set) => ({
  isOpen: false,
  draft: null,
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  openWithDraft: (text) => set({ isOpen: true, draft: text }),
  clearDraft: () => set({ draft: null }),
}))
