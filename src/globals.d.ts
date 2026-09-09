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
  /** Dev/test-only：控制台 agent 自动化工具（WebMCP 前身/降级出口）。仅 VITE_SHOW_DEV_TOOLS 时存在。 */
  __mg_nav?: {
    /** 当前账户有权限进入的所有页面（key/path/scope） */
    pages: () => Array<{ key: string; path: string; scope: 'tenant' | 'workspace' }>
    /** 侧边栏可见菜单（key/text/path/scope/actions） */
    menus: () => Array<{ key: string; text: string; path: string; scope: 'tenant' | 'workspace'; actions: Record<string, boolean> }>
    /** 当前页面所有可见可点元素（id/label/kind/href/disabled） */
    buttons: () => Array<{ id: string; label: string; kind: string; href?: string; disabled?: boolean }>
    /** 点击 buttons() 返回的某个元素 */
    click: (id: string) => { ok: boolean; label?: string; error?: string }
    /** 按页面/菜单 key 或 path 导航 */
    go: (target: string) => { ok: boolean; path?: string; error?: string }
  }
}
