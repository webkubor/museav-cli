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
  /** Dev/test-only：控制台导航的 agent 工具（WebMCP 前身/降级出口）。仅 VITE_SHOW_DEV_TOOLS 时存在。 */
  __mg_nav?: {
    /** 列出当前账户可见菜单（key/text/path/scope/actions） */
    list: () => Array<{ key: string; text: string; path: string; scope: 'tenant' | 'workspace'; actions: Record<string, boolean> }>
    /** 按菜单 key 导航 */
    go: (key: string) => { ok: boolean; path?: string; error?: string }
  }
  /** Umami 分析脚本（index.html 注入）。自定义事件走 umami.track；脚本未加载时为 undefined。 */
  umami?: {
    track: (event: string, data?: Record<string, unknown>) => void
  }
}
