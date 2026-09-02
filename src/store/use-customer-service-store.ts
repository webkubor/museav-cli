import { create } from 'zustand'

interface CustomerServiceUiState {
  isOpen: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/**
 * 智能助手悬浮面板的全局开关。
 *
 * ⚠️ 定位已随《ModelGo 智能客服 PRD（v0.1）》（V1.0.6）改回：助手**承接**问题反馈、
 * 转人工与服务记录，不再是「只答不接」。此前这里写着「不承接客服反馈（投诉/工单/
 * 退款/人工介入）」，那条已被 PRD 推翻，勿再据它裁剪功能。
 *
 * 用词：产品与文档层面叫「智能客服」，**界面上显示「智能助手」**（PRD §7.3：顶部
 * 显示 ModelGo 标识、「智能助手」与绿色「在线」状态）。文案走 i18n 的
 * `common.customerService.assistant`，不要在组件里写死。
 */
export const useCustomerServiceStore = create<CustomerServiceUiState>()((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}))
