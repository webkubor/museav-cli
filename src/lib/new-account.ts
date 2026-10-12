/**
 * 新注册标记 → sign_up 埋点（投放归因的注册分母）
 *
 * 背景（prd#1228 / prd#1242）：国际站是「登录即注册」——邮箱验证码、短信验证码、OAuth
 * 都是同一个动作，可能建号也可能只是登录。后端已在三条链路的响应里给出 `is_new_account`
 * （OAuth 走 302 跳转，标记挂在落地 URL 上），前端据此补发 `sign_up`，否则「注册 CPA」
 * 的分母在前端侧恒为空，market 侧只能看登录数。
 *
 * 口径（两处触发点，互不重复）：
 * - 邮箱验证码登录：`emailCodeLoginRegister` 的响应体里带标记，成功分支直接判定。
 * - OAuth 回跳：浏览器 302 到控制台地址，标记在 URL query 上；由应用启动时捕获，
 *   **任何一条成功建立会话的路径**都可以调用 `flushNewAccountSignUp` 上报，函数自身幂等
 *   （同一标记只发一次）——这样 AuthProvider 首拉会话、回调页首拉、回调页兜底重试三条
 *   路径里任意一条成功，事件都不会漏。
 *
 * `sign_up` 是**新增**事件，不改动既有 `login_success` 的发送条件：老账号照旧只发
 * `login_success`，新账号两条都发。这样原有的登录漏斗与 DAU 口径不受影响，同时新账号
 * 可被单独计数。
 *
 * ⚠️ 已知边界（独立审查提出，见 MR !326 评审记录）：
 * 1. **信任边界**：`is_new_account` 是后端 302 带上来的裸 query，前端无法自证它来自真实
 *    注册。已登录用户手拼 `?is_new_account=true` 并整页重载，可多发一条 `sign_up`。
 *    要彻底堵住需后端给可校验的一次性凭据，或按 prd#1228 ④ 的做法由后端上报该事件。
 * 2. **时效窗口**：标记带 5 分钟 TTL，超时不发 —— 让「捕获到上报」只发生在回跳后的即时
 *    会话建立窗口内，而不是任意时刻的某次会话刷新，把边界 1 的影响面压到一个很窄的窗口。
 * 3. 两条线同时发：站内自建埋点（`@model-go/track` → `/api/v1/events:batch`）+ GTM dataLayer
 *    （prd46#1271，带 user_id / workspace_id / 注册时的广告来源，见 lib/gtm-datalayer.ts）。
 *    dataLayer 只是交给 GTM，GA4 能否收到取决于市场侧在 GTM 里配的 GA4 事件标签。
 */
import { trackEvent } from '@/lib/track'
import { currentIdentity, pushDataLayer } from '@/lib/gtm-datalayer'
import { readPersistedAdAttribution, type AdAttributionFields } from '@/pages/signup/ad-source'

/** OAuth 回跳 URL 上的新注册标记参数名（后端 web-api!90 / permissions!56 契约）。 */
const NEW_ACCOUNT_PARAM = 'is_new_account'

/** 标记的有效期：超过它就不再上报（见文件头「时效窗口」）。 */
const PENDING_TTL_MS = 5 * 60 * 1000

/** 登录方式：与既有 `login_success` 的 method 取值保持一致，便于两条事件对齐口径。 */
export type AuthMethod = 'email_code' | 'phone' | 'oauth' | 'password'

/** OAuth 回跳捕获到的标记；`null` = 本次没有回跳标记或已消费。 */
let pendingOAuthLanding: { isNewAccount: boolean; capturedAt: number; adAttribution?: AdAttributionFields } | null = null

/**
 * 启动时从当前 URL 捕获 OAuth 回跳的新注册标记，并把参数从地址栏摘掉。
 *
 * - 只在模块加载时调用一次（`main.tsx`），必须在 React 挂载前——回跳目标页各自读 URL，
 *   晚清会让用户看到残留的 `?is_new_account=false`。
 * - 只有显式 `true` 才算新注册：`false`、空值、拼错的值一律当老账号（宁少不误报）。
 * - 摘参数走 `history.replaceState`（不是 `location.replace`），不 reload、不产生新历史项。
 * - 会话未必成立（例如用户直接手拼这个参数访问）——真正的上报要等 `flushNewAccountSignUp`
 *   在会话确认之后触发，见下。
 */
export function captureNewAccountFlag(now: number = Date.now()): void {
  if (typeof window === 'undefined') return
  let url: URL
  try {
    url = new URL(window.location.href)
  } catch {
    return // 极端环境下 URL 解析失败：埋点不值得阻断启动
  }
  const raw = url.searchParams.get(NEW_ACCOUNT_PARAM)
  if (raw === null) return
  // 广告来源在这里先拍一份：OAuth 回调页拿到会话后会清掉 sessionStorage 里的来源（防串号），
  // 而 sign_up 的上报可能晚于清理（AuthProvider 路径），所以不能等上报时再读。
  pendingOAuthLanding = { isNewAccount: raw === 'true', capturedAt: now, adAttribution: readPersistedAdAttribution(now) }
  url.searchParams.delete(NEW_ACCOUNT_PARAM)
  try {
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  } catch {
    /* 摘不掉就算了：不能因为清理地址栏影响登录流程 */
  }
}

/**
 * 新注册事件（注册 CPA 的分子/分母口径）。仅 `isNewAccount === true` 时发，
 * 判定留在各触发点，避免这里再猜一次语义。
 */
export function trackSignUp(method: AuthMethod, isNewAccount?: boolean, adAttribution?: AdAttributionFields): void {
  if (isNewAccount !== true) return
  trackEvent('sign_up', { method }, { result: 'success' })
  // 身份取调用时的 store：各触发点都在 setAuth 之后调用，这里已是新账号。
  pushDataLayer({ event: 'sign_up', method, ...currentIdentity(), ...adAttribution })
}

/**
 * 会话确认成立后上报 OAuth 回跳的新注册事件。
 *
 * **幂等**：同一标记只上报一次，所以每个成功建立会话的路径都可以直接调用它 ——
 * `AuthProvider` 的首拉会话、OAuth 回调页的首拉、回调页的兜底重试，任意一条成功都不会漏，
 * 多条成功也不会重复计数。
 *
 * 两个约束：
 * - 先证明这次登录真的成了再记账，而不是只看 URL（见文件头「信任边界」）。
 * - 超过 `PENDING_TTL_MS` 的陈旧标记直接丢弃（见文件头「时效窗口」）。
 */
export function flushNewAccountSignUp(now: number = Date.now()): void {
  const pending = pendingOAuthLanding
  pendingOAuthLanding = null
  if (!pending || !pending.isNewAccount) return
  if (now - pending.capturedAt > PENDING_TTL_MS) return
  trackSignUp('oauth', true, pending.adAttribution)
}

/** 仅供测试：清掉模块级待上报标记，避免用例之间互相污染。 */
export function resetNewAccountStateForTest(): void {
  pendingOAuthLanding = null
}
