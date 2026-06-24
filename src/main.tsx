/**
 * 应用入口
 * 路由：全局 React 挂载
 * API：无直接请求，初始化主题、设备指纹、PWA 与开发环境清理
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import './index.css'
import './i18n'
import App from './App.tsx'
import { installAgentErrorReporter } from 'vite-plugin-agent-eyes/client'
import { initDeviceFingerprint } from './lib/device-fingerprint'
import { installDevAuth } from './lib/dev-auth'

// 前端运行时错误上报（仅 DEV）：未捕获异常 / rejection / 全控制台 + DOM 快照，
// 内置 5s 去重 + 去 HMR 戳防刷爆。统一由 vite-plugin-agent-eyes 提供，替代原 dev-error-reporter。
installAgentErrorReporter()
initDeviceFingerprint()
if (import.meta.env.DEV) installDevAuth()

const DEV_SW_RESET_KEY = 'modelgo:dev-sw-reset'

function getRegistrationScriptUrl(registration: ServiceWorkerRegistration) {
  return (
    registration.active?.scriptURL ||
    registration.waiting?.scriptURL ||
    registration.installing?.scriptURL ||
    ''
  )
}

// 开发环境不能被历史 PWA / MSW 控制，否则会加载旧 bundle，造成本地改动点击无效。
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    let removed = false

    await Promise.all(
      registrations.map((registration) => {
        const scriptUrl = getRegistrationScriptUrl(registration)
        const shouldRemove = import.meta.env.DEV || scriptUrl.includes('mockServiceWorker')
        if (!shouldRemove) return Promise.resolve(false)
        removed = true
        return registration.unregister()
      }),
    )

    if (!import.meta.env.DEV) return
    if (!removed) {
      sessionStorage.removeItem(DEV_SW_RESET_KEY)
      return
    }

    if (!sessionStorage.getItem(DEV_SW_RESET_KEY)) {
      sessionStorage.setItem(DEV_SW_RESET_KEY, '1')
      window.location.reload()
    }
  })
}

if (import.meta.env.PROD) {
  registerSW({
    onNeedRefresh() {
      toast.info('检测到新版本', {
        action: {
          label: '立即刷新',
          onClick: () => window.location.reload(),
        },
        duration: Infinity,
      })
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
