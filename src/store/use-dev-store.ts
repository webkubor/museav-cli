import { create } from 'zustand'

const SHOW_CONFIG_KEY = 'dev:show-platform-config'

function readShowConfig(): boolean {
  try {
    return localStorage.getItem(SHOW_CONFIG_KEY) === 'true'
  } catch {
    return false
  }
}

interface DevState {
  /** 是否在侧边栏显示接口调试菜单（仅开发环境） */
  showPlatformConfig: boolean
  setShowPlatformConfig: (v: boolean) => void
}

export const useDevStore = create<DevState>()((set) => ({
  showPlatformConfig: readShowConfig(),
  setShowPlatformConfig: (v) => {
    try {
      localStorage.setItem(SHOW_CONFIG_KEY, String(v))
    } catch {
      /* ignore */
    }
    set({ showPlatformConfig: v })
  },
}))
