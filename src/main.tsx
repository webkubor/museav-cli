/**
 * 应用入口
 * 路由：全局 React 挂载
 * API：无直接请求，初始化主题、设备指纹、PWA 与开发环境清理
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
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
import { useAppUpdateStore } from './store/use-app-update-store'
import { fetchLatestVersion } from './lib/app-version'

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
  // PWA 版本更新（registerType: 'prompt'）：检测到新版本 → 置 store.updateReady →
  // 全局 <AppUpdatePrompt/> 弹强制更新窗；用户点「立即更新」调 updateSW(true) 激活新 SW + 刷新。
  const updateSW = registerSW({
    onNeedRefresh() {
      useAppUpdateStore.getState().setUpdateReady(true)
      // 拉取服务器最新版本，供弹窗展示「当前 → 最新」对比（失败则弹窗只显当前版本）
      fetchLatestVersion().then((v) => useAppUpdateStore.getState().setLatestVersion(v))
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // 主动轮询新版本（每 5 分钟）+ 标签页重新可见时各查一次，让更新提示尽快出现，
      // 不必等用户手动刷新才发现新版本。
      const checkUpdate = () => registration.update().catch(() => {})
      setInterval(checkUpdate, 5 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkUpdate()
      })
    },
  })
  useAppUpdateStore.getState().setUpdateSW(updateSW)
}

// 兜底（不限 PROD）：部署后旧 hash chunk 被清除，停留旧页面的用户导航时动态 import 会失败
// （服务器 SPA 回退把缺失的 /assets/*.js 返成 index.html/text/html → MIME 报错 → 白屏，需求方#233）。
// 捕获 Vite 的 preloadError，强制整页刷新拉取最新 index.html + chunk；10s 时间窗防刷新循环。
window.addEventListener('vite:preloadError', (event) => {
  const key = 'mg:preload-reload-ts'
  const last = Number(sessionStorage.getItem(key) || '0')
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(key, String(Date.now()))
    event.preventDefault()
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
