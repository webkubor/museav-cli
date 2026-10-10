/**
 * 应用入口
 * 路由：全局 React 挂载
 * API：无直接请求，初始化主题、设备指纹与开发环境清理
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import { installAgentErrorReporter } from 'vite-plugin-agent-eyes/client'
import { initDeviceFingerprint } from './lib/device-fingerprint'
import { installDevAuth } from './lib/dev-auth'
import { init as initTrack, TrackApp, TrackRegion } from '@model-go/track'
import { installGlobalClientErrorReporting } from './lib/client-error-report'
import { getMarket } from './lib/market'
import { installChunkReloadGuard } from './lib/chunk-reload'
import { apiBaseUrl } from './lib/request'
import { useAuthStore } from './store/auth'
import { captureNewAccountFlag } from './lib/new-account'

// 前端运行时错误上报（仅 DEV）：未捕获异常 / rejection / 全控制台 + DOM 快照，
// 内置 5s 去重 + 去 HMR 戳防刷爆。统一由 vite-plugin-agent-eyes 提供，替代原 dev-error-reporter。
installAgentErrorReporter()
initDeviceFingerprint()
if (import.meta.env.DEV) installDevAuth()

// 当前 PRD 累积基线（见「PRD by Release」发布基线树），随 PRD 发版节奏手动 bump，供埋点 A/B 对比（#423）
// 2026-09-03 bump 到 v1.0.6：此前停在 v1.0.3，导致 1.0.4/1.0.5/1.0.6 三个版本的埋点
// 全部归因到 1.0.3，A/B 对比失去意义。改这里时同步 PROJECT-BRIEF.md §6 的基线说明。
const PRD_VERSION = 'v1.0.6'

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
  // 公共属性：每条事件带上内部稳定 ID（account_id / workspace_id），不带邮箱手机号。
  // 未登录或尚未选定工作空间时不附加，避免写入空值。
  getCommonProps: () => {
    const { account, activeWorkspaceId } = useAuthStore.getState()
    const props: Record<string, string> = {}
    if (account?.account_id) props.user_id = account.account_id
    if (activeWorkspaceId) props.workspace_id = activeWorkspaceId
    return props
  },
})

// OAuth 回跳的新注册标记：必须在 React 挂载前摘掉并记下（prd#1242）。
// 回跳目标页各自在挂载时读一次 URL，晚一步清理用户就会看到残留的 ?is_new_account=…；
// 上报不在这里做 —— 要等 AuthProvider 首拉 session 成功，确认这次登录真的成立（见 lib/new-account.ts）。
captureNewAccountFlag()

// 全局兜底：未被 ErrorBoundary 兜住的异常（如事件回调里的报错）与未处理 rejection 也上报
installGlobalClientErrorReporting()

// ── PWA 下线迁移：注销历史 ServiceWorker 与 Cache Storage ────────────────────
// 控制台已移除 PWA（不再产出 sw.js）。但老用户浏览器里仍装着历史 SW，若不清理会继续
// 由旧 SW 控制页面、吃到过期 precache——所以这里**所有环境**都注销 SW 并清空 caches，
// 让后续导航回到纯 HTTP。等线上流量全部换代后，本段可整体删除。
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) registration.unregister().catch(() => {})
  })
}
if ('caches' in window) {
  caches.keys().then((keys) => {
    for (const key of keys) caches.delete(key).catch(() => {})
  })
}

// 兜底（不限 PROD）：部署窗口期/停留旧页面时动态 import 失败（服务器 SPA 回退把缺失的
// /assets/*.js 返成 index.html/text/html → MIME 报错 → 白屏，需求方#233、#591）。
// 带退避多次重试 + cache-bust，细节见 lib/chunk-reload.ts。
installChunkReloadGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
