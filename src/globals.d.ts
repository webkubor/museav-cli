declare const __APP_VERSION__: string
declare const __BUILD_TAG__: string
declare const __BUILD_COMMIT__: string
declare const __BUILD_TIME__: string

interface Window {
  /** Dev-only：注入认证状态，供 Playwright MCP / browser-harness 调用，绕过登录页 UI。仅开发构建存在。 */
  __mg_login?: (email: string, password: string) => Promise<
    | { ok: true; email: string; tenantId: string }
    | { ok: false; error: string }
  >
  /** Umami 分析脚本（index.html 注入）。自定义事件走 umami.track；脚本未加载时为 undefined。 */
  umami?: {
    track: (event: string, data?: Record<string, unknown>) => void
  }
}
