/**
 * Dev/test-only：把控制台导航能力暴露成 **agent 可调工具**，做 UI 自动化。
 *
 * 一套核心（listMenus / navigateTo），两个出口——数据源不变，只换暴露层：
 *   1. `window.__mg_nav`      —— 今天就能用：ego-lite / CDP `eval` 直接调，不依赖浏览器 WebMCP 支持。
 *   2. `navigator.modelContext` —— WebMCP：浏览器支持时（Edge 147+ / Chrome OT）自动注册标准 tools，
 *                                 供 WebMCP 客户端 agent 调用。不支持则静默跳过。
 *
 * 只在 `VITE_SHOW_DEV_TOOLS === 'true'` 时装载（DashboardLayout 里门控），生产构建不挂。
 * WebMCP 契约：registerTool({name, description, inputSchema, execute})；provideContext 已废（2026-03），
 * 页面状态直接写进各 tool 的 description。register on mount / unregister on unmount。
 */
import type { NavGroup } from '@/config/nav'
import { navConfig } from '@/config/nav'
import { useAuthStore } from '@/store/auth'

export interface ConsoleMenuItem {
  key: string
  text: string
  /** 路由 path（工作区级菜单已拼 /workspace/<id>/<key>） */
  path: string
  scope: 'tenant' | 'workspace'
  /** 该菜单的操作开关（后端 session menus 下发） */
  actions: Record<string, boolean>
}

export interface ConsoleToolsDeps {
  /** 权限过滤后的可见分组（DashboardLayout 已算好） */
  navGroups: NavGroup[]
  activeWorkspaceId: string | null
  /** react-router 的 navigate（跳 path） */
  navigate: (path: string) => void
}

function resolvePath(key: string, wsId: string | null): string {
  return navConfig.workspaceScopedKeys.has(key) ? `/workspace/${wsId ?? ''}/${key}` : `/${key}`
}

/** 核心工具函数（纯逻辑，唯一实现，两个出口共用）。 */
export function buildConsoleTools({ navGroups, activeWorkspaceId, navigate }: ConsoleToolsDeps) {
  const getMenuActions = useAuthStore.getState().getMenuActions

  function listMenus(): ConsoleMenuItem[] {
    const out: ConsoleMenuItem[] = []
    for (const g of navGroups) {
      for (const it of g.items) {
        out.push({
          key: it.itemKey,
          text: typeof it.text === 'string' ? it.text : it.itemKey,
          path: resolvePath(it.itemKey, activeWorkspaceId),
          scope: g.scope,
          actions: getMenuActions(it.itemKey),
        })
      }
    }
    return out
  }

  function navigateTo(key: string): { ok: boolean; path?: string; error?: string } {
    const item = listMenus().find((m) => m.key === key)
    if (!item) return { ok: false, error: `未知菜单 key: ${key}` }
    navigate(item.path)
    return { ok: true, path: item.path }
  }

  return { listMenus, navigateTo }
}

interface ModelContextLike {
  registerTool?: (t: { name: string; description: string; inputSchema: unknown; execute: (args: never) => unknown }) => void
  unregisterTool?: (name: string) => void
}

/**
 * 装载两个出口，返回 cleanup（组件卸载时调，遵守 WebMCP register/unregister on mount/unmount）。
 */
export function installAgentTools(deps: ConsoleToolsDeps): () => void {
  const tools = buildConsoleTools(deps)

  // 出口 1：window.__mg_nav —— ego/CDP 今天可调
  window.__mg_nav = {
    list: () => tools.listMenus(),
    go: (key: string) => tools.navigateTo(key),
  }

  // 出口 2：WebMCP —— 浏览器支持时注册标准 tools
  const mc = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext
  const registered: string[] = []
  if (mc?.registerTool) {
    mc.registerTool({
      name: 'console_list_menus',
      description:
        '列出当前登录账户在 ModelGo 控制台可见的所有菜单（导航项），含路由 path、scope（tenant/workspace）和可用操作 actions。' +
        '先调它拿到菜单及其 key，再用 console_navigate 跳转。可见范围已按当前账户角色/权限过滤。',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ menus: tools.listMenus() }),
    })
    mc.registerTool({
      name: 'console_navigate',
      description:
        '把 ModelGo 控制台导航到指定菜单。参数 key 来自 console_list_menus 返回的 menus[].key（如 dashboard / api-keys / usage）。',
      inputSchema: { type: 'object', properties: { key: { type: 'string', description: '菜单 key' } }, required: ['key'] },
      execute: async ({ key }: { key: string }) => tools.navigateTo(key),
    })
    registered.push('console_list_menus', 'console_navigate')
  }

  return () => {
    delete window.__mg_nav
    if (mc?.unregisterTool) registered.forEach((n) => mc.unregisterTool!(n))
  }
}
