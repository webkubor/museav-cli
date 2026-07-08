/**
 * Dev-only：往 window 上挂 __mg_login，供 Playwright MCP / browser-harness
 * 通过 browser_evaluate 直接注入认证状态，绕过登录页 UI。
 *
 * 仅在 import.meta.env.DEV === true 时调用，生产构建会被 tree-shake 掉。
 *
 * 用法（Playwright evaluate）：
 *   await page.evaluate(() => window.__mg_login('email@test.com', 'Password01'))
 *   // 返回 { ok: true, email, tenantId } 或 { ok: false, error }
 */

import { login, getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { storageKeys } from '@/lib/storage'

export type MgLoginResult =
  | { ok: true; email: string; tenantId: string }
  | { ok: false; error: string }

async function mgLogin(email: string, password: string): Promise<MgLoginResult> {
  try {
    // 先 GET /auth/session：让服务端种下 modelgo_csrf cookie，POST 登录才不会 403
    await getSession().catch(() => {})
    await login({ email, password })
    const session = await getSession()
    const persistedWs = localStorage.getItem(storageKeys.activeWorkspaceId(session.active_tenant_id))
    useAuthStore.getState().setAuth(
      session.account,
      session.active_tenant_id,
      session.tenants,
      persistedWs || session.active_workspace_id,
      session.permissions?.granted ?? null,
      session.permissions?.menus ?? [],
    )
    return { ok: true, email: session.account.email, tenantId: session.active_tenant_id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function installDevAuth() {
  window.__mg_login = mgLogin
}
