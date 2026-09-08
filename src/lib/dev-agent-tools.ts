/**
 * Dev/test-only：把控制台能力**尽量多地**暴露到 BOM，供 agent 做 UI 自动化。
 *
 * 原则：只要账户有权限，就把入口给它——agent 直接调方法，不用爬 DOM / 猜 selector / 算坐标。
 *   - pages()   —— 当前账户**有权限进入的所有页面路径**（源：console-routes.ts + 权限过滤）
 *   - menus()   —— 侧边栏可见菜单（源：nav.ts 权限过滤后的分组）
 *   - buttons() —— **当前页面里所有可点元素**（实时扫 DOM，自动编号 + 打标签）
 *   - click(id) —— 点 buttons() 返回的某个元素（派发真 click）
 *   - go(target)—— 按页面/菜单 key 或直接 path 导航
 *
 * 一套核心，两个出口（window.__mg_nav + WebMCP navigator.modelContext），数据源不变，只换暴露层。
 * 仅 VITE_SHOW_DEV_TOOLS 装载，生产构建不挂。WebMCP：register on mount / unregister on unmount。
 */
import type { NavGroup } from '@/config/nav'
import { navConfig } from '@/config/nav'
import { CONSOLE_ROUTES } from '@/config/console-routes'
import { useAuthStore } from '@/store/auth'

export interface ConsoleMenuItem {
  key: string
  text: string
  path: string
  scope: 'tenant' | 'workspace'
  actions: Record<string, boolean>
}
export interface ConsolePage {
  key: string
  path: string
  scope: 'tenant' | 'workspace'
}
export interface ConsoleButton {
  id: string
  label: string
  /** button / a / tab / switch / checkbox / menuitem … */
  kind: string
  href?: string
  disabled?: boolean
}

export interface ConsoleToolsDeps {
  navGroups: NavGroup[]
  activeWorkspaceId: string | null
  navigate: (path: string) => void
}

function resolvePath(key: string, wsId: string | null): string {
  return navConfig.workspaceScopedKeys.has(key) ? `/workspace/${wsId ?? ''}/${key}` : `/${key}`
}

/** buttons() 扫描出的元素暂存于此，click(id) 按 id 取真实元素点击（不重新 query，DOM 变了也能命中）。 */
const scanMap = new Map<string, Element>()
const CLICKABLE = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="checkbox"]',
  'input[type="submit"]',
  'input[type="button"]',
].join(',')

export function buildConsoleTools({ navGroups, activeWorkspaceId, navigate }: ConsoleToolsDeps) {
  const store = useAuthStore.getState()

  function listMenus(): ConsoleMenuItem[] {
    const out: ConsoleMenuItem[] = []
    for (const g of navGroups) {
      for (const it of g.items) {
        out.push({
          key: it.itemKey,
          text: typeof it.text === 'string' ? it.text : it.itemKey,
          path: resolvePath(it.itemKey, activeWorkspaceId),
          scope: g.scope,
          actions: store.getMenuActions(it.itemKey),
        })
      }
    }
    return out
  }

  /** 当前账户有权限进入的所有页面（比侧栏菜单更全，含 observability 等不在侧栏的）。 */
  function listPages(): ConsolePage[] {
    return CONSOLE_ROUTES.filter((r) => !r.permission || store.hasPermission(r.permission)).map((r) => ({
      key: r.key,
      path: resolvePath(r.key, activeWorkspaceId),
      scope: r.scope,
    }))
  }

  /** 导航：target 可是页面/菜单 key，或直接以 '/' 开头的 path。 */
  function navigateTo(target: string): { ok: boolean; path?: string; error?: string } {
    if (target.startsWith('/')) {
      navigate(target)
      return { ok: true, path: target }
    }
    const hit = listPages().find((p) => p.key === target) ?? listMenus().find((m) => m.key === target)
    if (!hit) return { ok: false, error: `未知 key/path: ${target}（用 pages()/menus() 查）` }
    navigate(hit.path)
    return { ok: true, path: hit.path }
  }

  /** 扫描当前页面所有可见、可点的元素，返回带 id 的清单（供 click(id) 用）。 */
  function listButtons(): ConsoleButton[] {
    scanMap.clear()
    const out: ConsoleButton[] = []
    const els = Array.from(document.querySelectorAll(CLICKABLE))
    els.forEach((el, i) => {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return // 不可见跳过
      const he = el as HTMLElement
      const label = (
        el.getAttribute('aria-label') ||
        he.innerText ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        ''
      )
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 60)
      if (!label) return
      const id = `b${i}`
      scanMap.set(id, el)
      out.push({
        id,
        label,
        kind: el.getAttribute('role') || el.tagName.toLowerCase(),
        href: el.getAttribute('href') || undefined,
        disabled: (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' || undefined,
      })
    })
    return out
  }

  /** 点 buttons() 返回的某个元素（派发真 click；<a>/<Link> 会触发 SPA 导航）。 */
  function clickButton(id: string): { ok: boolean; label?: string; error?: string } {
    const el = scanMap.get(id)
    if (!el) return { ok: false, error: `未知按钮 id: ${id}（先调 buttons()）` }
    if (!el.isConnected) return { ok: false, error: `元素已不在 DOM（页面变了，重新 buttons()）` }
    const label = (el as HTMLElement).innerText?.trim().slice(0, 40)
    ;(el as HTMLElement).click()
    return { ok: true, label }
  }

  return { listMenus, listPages, navigateTo, listButtons, clickButton }
}

interface ModelContextLike {
  registerTool?: (t: { name: string; description: string; inputSchema: unknown; execute: (args: never) => unknown }) => void
  unregisterTool?: (name: string) => void
}

/** 装载两个出口，返回 cleanup（组件卸载调）。 */
export function installAgentTools(deps: ConsoleToolsDeps): () => void {
  const t = buildConsoleTools(deps)

  // 出口 1：window.__mg_nav —— ego / Chrome CDP `eval` 今天可调
  window.__mg_nav = {
    pages: () => t.listPages(),
    menus: () => t.listMenus(),
    buttons: () => t.listButtons(),
    click: (id: string) => t.clickButton(id),
    go: (target: string) => t.navigateTo(target),
  }

  // 出口 2：WebMCP —— 浏览器支持时注册标准 tools（provideContext 已废，context 写进 description）
  //
  // 入口优先 document.modelContext：Chrome 已把 WebMCP 迁过去，navigator 那个是
  // deprecated shim（控制台常驻一条 "navigator.modelContext is deprecated" 警告）。
  const mc = (document as unknown as { modelContext?: ModelContextLike }).modelContext
    ?? (navigator as unknown as { modelContext?: ModelContextLike }).modelContext
  const registered: string[] = []
  if (mc?.registerTool) {
    // 注册必须幂等，且失败不能抛出去。三件事叠在一起会把整个控制台打崩：
    //   ① main.tsx 开了 StrictMode，effect 走「挂载 → 卸载 → 再挂载」
    //   ② 下面 cleanup 里的 unregisterTool 是**可选**的，对方没实现就静默不清理
    //   ③ 于是第二次挂载重复注册同名 tool，registerTool 抛
    //      InvalidStateError: Duplicate tool name
    // 这个异常在 effect 里抛出后没人接，React 把它当渲染错误处理，
    // DashboardLayout 整棵子树被 error boundary 接管 —— 用户看到的是页面挂了，
    // 硬刷新又"好了"（重新走首次挂载），很容易误判成缓存问题。
    // 2026-09-07 测试环境实际发生。
    //
    // 这是 dev/自动化工具的旁路，坏了顶多是 agent 用不了导航能力，
    // 绝不该影响任何一个真实用户能不能打开控制台。
    const reg = (name: string, description: string, inputSchema: unknown, execute: (a: never) => unknown) => {
      try {
        mc.unregisterTool?.(name)   // 先清同名：不依赖 cleanup 一定跑过、也不依赖对方一定实现了它
      } catch { /* 没注册过就是没注册过，忽略 */ }
      try {
        mc.registerTool!({ name, description, inputSchema, execute })
        registered.push(name)
      } catch (e) {
        console.warn('[agent-tools] WebMCP registerTool 失败，跳过该工具:', name, e)
      }
    }
    reg('console_list_pages',
      '列出当前登录账户在 ModelGo 控制台**有权限进入的所有页面**（key + 路由 path + scope）。已按账户角色/权限过滤。',
      { type: 'object', properties: {} },
      async () => ({ pages: t.listPages() }))
    reg('console_navigate',
      '导航控制台到指定页面。target 传 console_list_pages/console_list_menus 的 key（如 usage/api-keys），或直接传 / 开头的 path。',
      { type: 'object', properties: { target: { type: 'string', description: '页面 key 或 path' } }, required: ['target'] },
      async ({ target }: { target: string }) => t.navigateTo(target))
    reg('console_list_buttons',
      '列出**当前页面**所有可见可点的元素（按钮/链接/页签/开关…），每个带 id + label。点某个用 console_click 传 id。',
      { type: 'object', properties: {} },
      async () => ({ buttons: t.listButtons() }))
    reg('console_click',
      '点击 console_list_buttons 返回的某个元素。id 来自 buttons()。点链接/页签会触发页面跳转或切换。',
      { type: 'object', properties: { id: { type: 'string', description: '来自 console_list_buttons 的按钮 id' } }, required: ['id'] },
      async ({ id }: { id: string }) => t.clickButton(id))
  }

  return () => {
    delete window.__mg_nav
    // 同理：卸载失败也不能抛 —— cleanup 抛异常会打断 React 的卸载流程
    registered.forEach((n) => {
      try { mc?.unregisterTool?.(n) } catch { /* 清不掉就算了，reg 那边有幂等兜底 */ }
    })
  }
}
