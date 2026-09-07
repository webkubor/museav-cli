import { create } from 'zustand'

interface CustomerServiceUiState {
  isOpen: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/**
 * 平台助手窗口的全局开关。
 *
 * 命名说明：文件名 / store 名里的 customer-service 是历史遗留，产品定位已改为
 * 平台助手——只解答平台功能怎么用，不承接客服反馈（投诉/工单/退款/人工介入）。
 * 用户可见文案一律用「平台助手」，勿再出现「客服」。
 */
export const useCustomerServiceStore = create<CustomerServiceUiState>()((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}))
