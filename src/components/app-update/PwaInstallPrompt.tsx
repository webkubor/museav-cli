/**
 * PWA 安装轻提示（全局单例，挂在 App 根部）。
 * 触发条件：浏览器可安装（beforeinstallprompt 已暂存）+ 未安装（非 standalone）+ 用户未关闭过。
 * 形态：右下角可关闭的轻量提示条——不打断操作，关掉后本地记住不再打扰。
 */
import { useState } from 'react'
import { LuDownload, LuX } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { usePwaInstallStore } from '@/store/use-pwa-install-store'
import { appToast } from '@/lib/app-toast'

const DISMISS_KEY = 'mg:pwa-install-dismissed'

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function PwaInstallPrompt() {
  const deferredPrompt = usePwaInstallStore((s) => s.deferredPrompt)
  const promptInstall = usePwaInstallStore((s) => s.promptInstall)
  // 已安装(standalone) 或 本地关闭过 → 不再展示（惰性初始化，避免 effect 内同步 setState）
  const [dismissed, setDismissed] = useState(
    () => isStandalone() || localStorage.getItem(DISMISS_KEY) === '1'
  )
  const [installing, setInstalling] = useState(false)

  if (!deferredPrompt || dismissed) return null

  const close = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const install = async () => {
    setInstalling(true)
    try {
      const accepted = await promptInstall()
      if (accepted) appToast.success('已开始安装，可在桌面/应用列表找到 ModelGo')
      close()
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="rounded-lg border border-mg-border bg-mg-bg-0 p-4 shadow-lg">
        <button
          type="button"
          onClick={close}
          aria-label="关闭"
          className="absolute right-2 top-2 inline-flex text-mg-text-3 transition-colors hover:text-mg-text-1"
        >
          <LuX size={15} />
        </button>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-base/10 text-brand-base">
            <LuDownload size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-mg-text-1">安装 ModelGo 到桌面</div>
            <p className="mt-1 text-xs leading-relaxed text-mg-text-3">
              安装后可像原生应用一样从桌面直接打开，启动更快、体验更沉浸。
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button variant="brand" size="sm" loading={installing} onClick={install}>
                安装到桌面
              </Button>
              <Button variant="ghost" size="sm" onClick={close}>
                以后再说
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
