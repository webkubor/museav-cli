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
 * - OAuth 回跳：浏览器 302 到控制台地址，标记在 URL query 上；由应用启动时捕获、会话
 *   确认后上报（见下）。放在启动阶段是因为这个回跳可能落在任意目标页，而各页只在挂载时
 *   读一次 URL，晚于清理就拿不到标记了。
 *
 * `sign_up` 是**新增**事件，不改动既有 `login_success` 的发送条件：老账号照旧只发
 * `login_success`，新账号两条都发。这样原有的登录漏斗与 DAU 口径不受影响，同时新账号
 * 可被单独计数。
 *
 * ⚠️ 已知边界：本模块只走站内自建埋点（`@model-go/track` → `/api/v1/events:batch`），
 * **不写 GA4 / dataLayer**——控制台前台没有 dataLayer 转发（与官网首页埋点同一待定口径，
 * 见 prd#1246 的 C 项）。若市场侧要用 GA4 的 sign_up 做转化，需另立单加转发。
 */
import { trackEvent } from '@/lib/track'

/** OAuth 回跳 URL 上的新注册标记参数名（后端 web-api!90 / permissions!56 契约）。 */
const NEW_ACCOUNT_PARAM = 'is_new_account'

/** 登录方式：与既有 `login_success` 的 method 取值保持一致，便于两条事件对齐口径。 */
export type AuthMethod = 'email_code' | 'phone' | 'oauth' | 'password'

/** OAuth 回跳捕获到的标记；`null` = 本次没有回跳标记或已消费。 */
let pendingOAuthLanding: boolean | null = null

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
export function captureNewAccountFlag(): void {
  if (typeof window === 'undefined') return
  let url: URL
  try {
    url = new URL(window.location.href)
  } catch {
    return // 极端环境下 URL 解析失败：埋点不值得阻断启动
  }
  const raw = url.searchParams.get(NEW_ACCOUNT_PARAM)
  if (raw === null) return
  pendingOAuthLanding = raw === 'true'
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
export function trackSignUp(method: AuthMethod, isNewAccount?: boolean): void {
  if (isNewAccount !== true) return
  trackEvent('sign_up', { method }, { result: 'success' })
}

/**
 * 会话确认成立后上报 OAuth 回跳的新注册事件。
 *
 * 由 `AuthProvider` 在首拉 session 成功后调用：**先证明这次登录真的成了**再记账，避免
 * 有人把 `?is_new_account=true` 贴到别处就刷出一条注册。同一标记只上报一次。
 */
export function flushNewAccountSignUp(): void {
  const isNewAccount = pendingOAuthLanding
  pendingOAuthLanding = null
  if (isNewAccount) trackSignUp('oauth', true)
}

/** 仅供测试：清掉模块级待上报标记，避免用例之间互相污染。 */
export function resetNewAccountStateForTest(): void {
  pendingOAuthLanding = null
}
