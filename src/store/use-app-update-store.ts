import { create } from 'zustand'
import type { AppVersionInfo } from '@/lib/app-version'

/** PWA 版本更新调度：main.tsx 注册 SW 时回填 updateSW，检测到新版本置 updateReady。 */
type UpdateSW = (reloadPage?: boolean) => Promise<void>

const UPDATE_FALLBACK_MS = 1200

interface AppUpdateState {
  /** 检测到新版本、SW 已就绪待激活 */
  updateReady: boolean
  /** 正在应用更新（点了「立即更新」后到刷新前的过渡态） */
  updating: boolean
  /** vite-plugin-pwa registerSW 返回的更新函数；updateSW(true) = skipWaiting + 刷新 */
  updateSW: UpdateSW | null
  /** 服务器最新部署版本（拉取 /version.json），供弹窗「当前 → 最新」对比 */
  latestVersion: AppVersionInfo | null
  setUpdateReady: (ready: boolean) => void
  setUpdateSW: (fn: UpdateSW) => void
  setLatestVersion: (info: AppVersionInfo | null) => void
  /** 应用更新：激活新 SW 并整页刷新，拿到最新 index.html + chunk */
  applyUpdate: () => void
}

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  updateReady: false,
  updating: false,
  updateSW: null,
  latestVersion: null,
  setUpdateReady: (ready) => set({ updateReady: ready }),
  setUpdateSW: (fn) => set({ updateSW: fn }),
  setLatestVersion: (info) => set({ latestVersion: info }),
  applyUpdate: () => {
    const { updating, updateSW } = get()
    if (updating) return // 防重复触发
    set({ updating: true })
    // 关键:保证「立即更新」一定生效,不出现「一直点没反应/卡更新中」。
    // 整页刷新会拉取最新 index.html + chunk——即使 SW 的 skipWaiting/controllerchange
    // 机制异常或挂起,刷新本身也能真正更新到新版本。故无论 updateSW 成功/失败/挂起,
    // 都在短暂等待后强制兜底刷新，避免用户误以为首次点击无效。
    let reloaded = false
    const hardReload = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    const timer = setTimeout(hardReload, UPDATE_FALLBACK_MS)
    const finish = () => {
      clearTimeout(timer)
      hardReload()
    }
    if (updateSW) {
      // updateSW(true) 正常会 skipWaiting 后自身 reload；若未 reload/失败,由 finish/timer 兜底
      updateSW(true).then(finish).catch(finish)
    } else {
      hardReload()
    }
  },
}))
