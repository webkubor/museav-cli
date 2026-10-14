/**
 * GTM dataLayer 推送（prd46#1271）
 *
 * 与 `lib/track.ts` 是两条线：track 报自有后端，这里只往 `window.dataLayer` 推，
 * 交给 GTM 容器 GTM-PCHLTL6L 由市场侧配置 GA4 / Google Ads 标签接收（投放文档 5.2：
 * 「GTM 安装完成后，由市场侧统一配置 GA4 标签」）。前端**不直接调 gtag('event')**——
 * 否则市场在 GTM 里再配同名标签就会重复上报。
 *
 * 推送的事件（市场侧按这个契约在 GTM 里配触发器与数据层变量）：
 * - `mg_identity`：登录态或当前工作空间变化时推一次，带 `user_id`（account_id）/ `workspace_id`；
 *   登出时两个字段推 undefined，清掉 GTM 数据模型里的旧值。
 * - `sign_up`：新注册成功，带 `method` / `user_id` / `workspace_id`、注册时的广告来源，以及 GA4 / Google Ads 标识
 *   `ga_client_id` / `ga_session_id` / `gcl_aw`（见 lib/new-account.ts、lib/ga-ids.ts）。
 *
 * 不推邮箱、手机号等明文，只推内部稳定 ID。推送失败静默，不阻断业务。
 */
import { useAuthStore } from '@/store/auth'

type DataLayerEntry = { event: string } & Record<string, string | undefined>

export function pushDataLayer(entry: DataLayerEntry): void {
  if (typeof window === 'undefined') return
  try {
    const w = window as Window & { dataLayer?: unknown[] }
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push(entry)
  } catch {
    /* 埋点不阻断业务 */
  }
}

/** 当前身份：未登录 / 未选定工作空间时对应字段为 undefined。 */
export function currentIdentity(): { user_id?: string; workspace_id?: string } {
  const { account, activeWorkspaceId } = useAuthStore.getState()
  return { user_id: account?.account_id || undefined, workspace_id: activeWorkspaceId || undefined }
}

let lastIdentityKey = '|'

/**
 * 身份变化时推 `mg_identity`。只在 `main.tsx` 调一次；setAuth 同步触发订阅，
 * 所以新注册时 `mg_identity` 一定先于 `sign_up` 进 dataLayer。
 */
export function installDataLayerIdentitySync(): () => void {
  return useAuthStore.subscribe(() => {
    const identity = currentIdentity()
    const key = `${identity.user_id ?? ''}|${identity.workspace_id ?? ''}`
    if (key === lastIdentityKey) return
    lastIdentityKey = key
    pushDataLayer({ event: 'mg_identity', ...identity })
  })
}

/** 仅供测试：重置去重状态。 */
export function resetDataLayerIdentityForTest(): void {
  lastIdentityKey = '|'
}
