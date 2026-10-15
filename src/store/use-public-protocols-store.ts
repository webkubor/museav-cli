import { create } from 'zustand'
import { listPublicProtocols } from '@/services/catalog'
import type { PublicProtocolLabelItem } from '@/types'

/**
 * 协议标签目录（GET /catalog/public-protocols）的运行时缓存。
 *
 * 真源已迁移到 modelgo-model-gateway `pkg/publicprotocols` 静态注册表，经
 * controller/web-api 透传；前端不再手写协议 label 映射（model-format.ts 的体验 / 对比
 * 标签、api-code-samples.ts 的代码 Tab 标签统一从这里取，取不到时各自回落本地兜底常量）。
 *
 * 用普通 Zustand store 而非 React Query：这份数据要被 model-format.ts /
 * api-code-samples.ts 里的纯函数（protocolLabel 等，非 Hook、在渲染期被直接调用）
 * 读取，而不少调用它们的组件（如 ExperienceModelCard）在单测里是脱离
 * QueryClientProvider 直接渲染的——用 React Query 会在这些用例里炸掉。Zustand
 * 的 selector Hook 不需要 Provider，未挂载 fetch 时 items 保持 null，各消费方直接
 * 回落兜底文案，不影响既有用例。
 *
 * 非阻塞设计：不设 loading/error 状态给 UI 挂 spinner——请求中或失败期间 items 为
 * null，与后端 controller 侧「取不到就用上一份缓存/静态兜底」的降级同口径，首屏不
 * 因这份次要展示数据被拖住。
 */
interface PublicProtocolsState {
  items: PublicProtocolLabelItem[] | null
  /** 触发一次拉取（幂等：已有结果或请求进行中时直接跳过）。App 启动时调用一次即可，
   *  各消费组件也可按需自行调用兜底——重复调用不会重复发请求。 */
  fetchPublicProtocols: () => void
}

let inflight: Promise<void> | null = null

export const usePublicProtocolsStore = create<PublicProtocolsState>()((set, get) => ({
  items: null,
  fetchPublicProtocols: () => {
    if (inflight || get().items) return
    inflight = listPublicProtocols()
      .then((res) => set({ items: res.items ?? [] }))
      .catch(() => {
        // 静默失败：items 保持 null，各消费方回落本地兜底文案。该接口尚未随
        // web-api/controller/gateway 合并上线前（或任一环节抖动）都会走这条路径。
      })
      .finally(() => {
        inflight = null
      })
  },
}))
