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
import { ConsentBanner } from './components/consent/ConsentBanner'
import { installAgentErrorReporter } from 'vite-plugin-agent-eyes/client'
import { initDeviceFingerprint } from './lib/device-fingerprint'
import { installDevAuth } from './lib/dev-auth'
import { destroy as destroyTrack, init as initTrack, TrackApp, TrackRegion } from '@model-go/track'
import { installGlobalClientErrorReporting } from './lib/client-error-report'
import { getMarket } from './lib/market'
import { installChunkReloadGuard } from './lib/chunk-reload'
import { apiBaseUrl } from './lib/request'
import { useAuthStore } from './store/auth'
import { captureNewAccountFlag } from './lib/new-account'
import { captureAdAttributionAtBoot } from './pages/signup/ad-source'
import { installDataLayerIdentitySync } from './lib/gtm-datalayer'
import { getBrowserConsentRegion, getBrowserCountry } from './lib/consent-region'
import { hasAnalyticsConsent, onConsentChange } from './lib/consent'
import { adoptVisitorIdFromUrl, getOrCreateVisitorId, readVisitorId } from './lib/visitor-id'
import { getDeviceId } from './lib/device-fingerprint'
import { urlParamsProp } from './lib/url-params'

// 前端运行时错误上报（仅 DEV）：未捕获异常 / rejection / 全控制台 + DOM 快照，
// 内置 5s 去重 + 去 HMR 戳防刷爆。统一由 vite-plugin-agent-eyes 提供，替代原 dev-error-reporter。
installAgentErrorReporter()
initDeviceFingerprint()
if (import.meta.env.DEV) installDevAuth()

// 当前 PRD 累积基线（见「PRD by Release」发布基线树），随 PRD 发版节奏手动 bump，供埋点 A/B 对比（#423）
// 2026-09-03 bump 到 v1.0.6：此前停在 v1.0.3，导致 1.0.4/1.0.5/1.0.6 三个版本的埋点
// 全部归因到 1.0.3，A/B 对比失去意义。改这里时同步 PROJECT-BRIEF.md §6 的基线说明。
const PRD_VERSION = 'v1.0.6'

// 浏览器时区映射国家，与官网共用名单和 IANA timezone-country 映射。
// 时区是国家推断（非 IP 定位）；未知时区 fail-closed，要求同意。
const consentCountry = getBrowserCountry()
const consentRequired = getBrowserConsentRegion() !== 'not-required'
document.documentElement.dataset.country = consentCountry ?? ''
document.documentElement.dataset.consentRequired = consentRequired ? '1' : '0'

// 统一访客 ID：官网跳转带来的 mg_vid 优先采纳（本域无 cookie 时）；名单内外一律写入，不走同意门控（口径见 lib/visitor-id.ts）。
// URL 参数保留在地址栏上，埋点的 url_params 公共属性随事件读取当前 URL。
adoptVisitorIdFromUrl(window.location.search)
getOrCreateVisitorId()

// 自建埋点与 GTM 身份同步只在允许统计时启动：名单外始终启动（照常统计，附 consent_required=0）；
// 名单内等横幅「接受」后启动，「拒绝」时停止（SDK destroy 会丢弃缓冲并移除监听）。
let trackStarted = false
let stopIdentitySync: (() => void) | undefined

function startTrack() {
  if (trackStarted) return
  trackStarted = true
  initTrack({
    app: TrackApp.ConsoleWeb,
    region: getMarket() === 'global' ? TrackRegion.Global : TrackRegion.CN,
    prdVersion: PRD_VERSION,
    baseURL: apiBaseUrl(),
    getAuthHeaders: () => {
      const tenantId = useAuthStore.getState().activeTenantId
      return tenantId ? { 'X-Tenant-Id': tenantId } : undefined
    },
    getCommonProps: () => {
      const { account, activeWorkspaceId } = useAuthStore.getState()
      const props: Record<string, string> = {
        country: consentCountry ?? '',
        consent_required: consentRequired ? '1' : '0',
        visitor_id: readVisitorId() ?? '',
        identity_number: getDeviceId() ?? '',
        url_params: urlParamsProp(),
      }
      if (account?.account_id) props.user_id = account.account_id
      if (activeWorkspaceId) props.workspace_id = activeWorkspaceId
      return props
    },
  })
  stopIdentitySync = installDataLayerIdentitySync()
}

function stopTrack() {
  if (!trackStarted) return
  trackStarted = false
  destroyTrack()
  stopIdentitySync?.()
  stopIdentitySync = undefined
}

if (!consentRequired || hasAnalyticsConsent()) startTrack()
onConsentChange((choice) => (choice === 'accept' ? startTrack() : stopTrack()))

// 广告来源落地即捕获（投放归因，prd46#1271）：任何落地页的 gclid / utm 先存进 sessionStorage，
// 否则从 /models?gclid=… 直接点头部「登录」进 /login（不带参数）时来源就丢了；OAuth 要整页跳出
// 再 302 回来，回跳 URL 只带 is_new_account、不带来源参数，也靠这份记录取回。
// 必须早于 captureNewAccountFlag —— 它拍的 OAuth 快照读的就是这份持久化记录。
captureAdAttributionAtBoot()

// OAuth 回跳的新注册标记：必须在 React 挂载前摘掉并记下（prd#1242）。
// 回跳目标页各自在挂载时读一次 URL，晚一步清理用户就会看到残留的 ?is_new_account=…；
// 上报不在这里做 —— 要等 AuthProvider 首拉 session 成功，确认这次登录真的成立（见 lib/new-account.ts）。
captureNewAccountFlag()

// GTM dataLayer 身份同步（prd46#1271）：登录态 / 工作空间变化时推 mg_identity（user_id / workspace_id），
// 供市场侧在 GTM 里给 GA4 设置 user_id。必须早于 AuthProvider 首拉会话，否则漏掉第一次 setAuth。

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
    <ConsentBanner />
  </StrictMode>,
)
