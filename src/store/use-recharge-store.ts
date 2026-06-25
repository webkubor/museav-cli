import { create } from 'zustand'

interface RechargeUiState {
  isOpen: boolean
  open: () => void
  close: () => void
}

/**
 * 充值弹框的全局开关：任意入口（余额预警条 / 首充锁 / 模型页等）调 open() 即就地弹出，
 * 不跳页、不传 URL 参数。弹框本体在 DashboardLayout 挂一次。
 */
export const useRechargeStore = create<RechargeUiState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
