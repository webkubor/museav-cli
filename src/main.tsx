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
import { init as initTrack, TrackApp, TrackRegion } from '@model-go/track'
import { getMarket } from './lib/market'
import { apiBaseUrl } from './lib/request'
import { useAuthStore } from './store/auth'

// 前端运行时错误上报（仅 DEV）：未捕获异常 / rejection / 全控制台 + DOM 快照，
// 内置 5s 去重 + 去 HMR 戳防刷爆。统一由 vite-plugin-agent-eyes 提供，替代原 dev-error-reporter。
installAgentErrorReporter()
initDeviceFingerprint()
if (import.meta.env.DEV) installDevAuth()

// 当前 PRD 累积基线（见「PRD by Release」发布基线树），随 PRD 发版节奏手动 bump，供埋点 A/B 对比（#423）
const PRD_VERSION = 'v1.0.3'

// 埋点 SDK 初始化（@model-go/track，替代 Umami）：app=console_web，区域按域名判定；
// baseURL 与普通接口统一走 apiBaseUrl()（web-api 域名，SDK 自己拼 /api/v1/events:batch），
// 与 doc-web 一致；不传会退化成相对路径打到控制台自身域名，测试环境无 /api 代理 → 上报打不到 web-api。
initTrack({
  app: TrackApp.ConsoleWeb,
  region: getMarket() === 'global' ? TrackRegion.Global : TrackRegion.CN,
  prdVersion: PRD_VERSION,
  baseURL: apiBaseUrl(),
  getAuthHeaders: () => {
    const tenantId = useAuthStore.getState().activeTenantId
    return tenantId ? { 'X-Tenant-Id': tenantId } : undefined
  },
})

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
