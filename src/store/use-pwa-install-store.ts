import { create } from 'zustand'

/**
 * PWA 安装（添加到桌面）调度。
 * 浏览器满足可安装条件时触发 beforeinstallprompt（Chromium 系），
 * 我们拦截并暂存该事件，由 <PwaInstallPrompt/> 在首次访问时给一个可关闭的轻提示，
 * 用户点「安装」再唤起浏览器原生安装框。
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface PwaInstallState {
  /** 暂存的可安装事件；非空 = 当前可安装 */
  deferredPrompt: BeforeInstallPromptEvent | null
  setDeferredPrompt: (e: BeforeInstallPromptEvent | null) => void
  /** 唤起浏览器原生安装框；返回用户是否接受 */
  promptInstall: () => Promise<boolean>
}

export const usePwaInstallStore = create<PwaInstallState>((set, get) => ({
  deferredPrompt: null,
  setDeferredPrompt: (e) => set({ deferredPrompt: e }),
  promptInstall: async () => {
    const { deferredPrompt } = get()
    if (!deferredPrompt) return false
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    // 事件只能用一次，用后清空
    set({ deferredPrompt: null })
    return choice.outcome === 'accepted'
  },
}))
