import { create } from 'zustand'
import type { ServerErrorDiagnostics } from '@/lib/error-diagnostics'

interface ServerErrorState {
  current: ServerErrorDiagnostics | null
  show: (d: ServerErrorDiagnostics) => void
  dismiss: () => void
}

/**
 * 服务端 5xx 错误诊断弹窗的全局状态。
 * 由 appToast.requestError 在命中服务端级错误时触发，ServerErrorDialog 订阅渲染。
 */
export const useServerErrorStore = create<ServerErrorState>()((set, get) => ({
  current: null,
  show: (d) => {
    // 已有弹窗时不叠加：并发 5xx 只提示一次，避免弹窗堆叠/闪烁。
    if (get().current) return
    set({ current: d })
  },
  dismiss: () => set({ current: null }),
}))
