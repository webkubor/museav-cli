import { create } from 'zustand'

/** PWA 版本更新调度：main.tsx 注册 SW 时回填 updateSW，检测到新版本置 updateReady。 */
type UpdateSW = (reloadPage?: boolean) => Promise<void>

interface AppUpdateState {
  /** 检测到新版本、SW 已就绪待激活 */
  updateReady: boolean
  /** 正在应用更新（点了「立即更新」后到刷新前的过渡态） */
  updating: boolean
  /** vite-plugin-pwa registerSW 返回的更新函数；updateSW(true) = skipWaiting + 刷新 */
  updateSW: UpdateSW | null
  setUpdateReady: (ready: boolean) => void
  setUpdateSW: (fn: UpdateSW) => void
  /** 应用更新：激活新 SW 并整页刷新，拿到最新 index.html + chunk */
  applyUpdate: () => void
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  updateReady: false,
  updating: false,
  updateSW: null,
  setUpdateReady: (ready) => set({ updateReady: ready }),
  setUpdateSW: (fn) => set({ updateSW: fn }),
  applyUpdate: () => {
    const { updateSW } = get()
    set({ updating: true })
    if (updateSW) {
      // updateSW(true) 会 skipWaiting 后自动 reload；失败兜底手动刷新
      updateSW(true).catch(() => window.location.reload())
    } else {
      window.location.reload()
    }
  },
}))
