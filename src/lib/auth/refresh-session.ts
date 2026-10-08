/**
 * 会话权限热刷新（非 React 上下文可用）。
 *
 * 权限码/菜单由 /auth/session 一次性下发进 store（AuthProvider 挂载时）；
 * 之后任何**改变当前用户权限面的操作**（设为空间负责人、企业角色变更、
 * 移交所有权等）成功后必须调用本函数重拉会话——否则侧栏菜单、页内 tab、
 * 按钮 gating 全部停留在旧权限，需要手动刷新页面才更新。
 *
 * 与 AuthProvider 首拉共用同一套落 store 逻辑（工作区恢复 localStorage 优先）。
 */
import { getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { storageKeys } from '@/lib/storage'
import type { SessionResult } from '@/types'

/** 把 /auth/session 结果落进 auth store（AuthProvider 首拉与热刷新共用，空间以接口下发为准，prd46#1207） */
export function applySessionToStore(result: SessionResult): void {
  useAuthStore.getState().setAuth(
    result.account,
    result.active_tenant_id,
    result.tenants,
    result.active_workspace_id,
    result.permissions?.granted ?? null,
    result.permissions?.menus ?? [],
  )
}

/**
 * 获取首拉或刷新会话时的空间参数：
 * 若当前处于具体空间专属路由（/workspace/:workspaceId/*），以 URL 指定的空间优先；
 * 否则不传显式参数，由后端 /auth/session 按当前账号在该租户的默认空间偏好返回（prd46#1207）。
 */
export function getSessionWorkspaceIdFromLocation(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const match = window.location.pathname.match(/^\/workspace\/([^/]+)/)
  return match?.[1] || undefined
}

/** 重拉会话刷新权限码/菜单。失败静默（下次整页刷新自然纠正），不打断业务操作的成功反馈。 */
/** 从 localStorage 读当前活跃空间 id（key 按租户隔离，需先有活跃租户）。 */
function activeWorkspaceIdFromStorage(): string | undefined {
  const tenantId = localStorage.getItem(storageKeys.activeTenantId())
  if (!tenantId) return undefined
  return localStorage.getItem(storageKeys.activeWorkspaceId(tenantId)) || undefined
}

/**
 * 页面加载/刷新时的会话拉取：
 * 非空间专属页面不传参，由后端 /auth/session 决定默认空间落点；专属路由按 URL 传参（prd46#1207）。
 */
export function getInitialSession(): Promise<SessionResult> {
  return getSession(getSessionWorkspaceIdFromLocation())
}

/**
 * 按「当前活跃空间」解析会话（带 workspace_id）。用于主动切换空间或明确按指定空间刷新权限。
 */
export function getSessionForActiveWorkspace(): Promise<SessionResult> {
  const explicitWs = getSessionWorkspaceIdFromLocation() || activeWorkspaceIdFromStorage()
  return getSession(explicitWs)
}

export async function refreshSession(): Promise<void> {
  try {
    applySessionToStore(await getSessionForActiveWorkspace())
  } catch {
    /* 权限热刷新失败不阻断业务；旧权限顶多保守（fail-closed 由各 gate 兜底） */
  }
}

/**
 * 切换活跃空间：先持久化选择，再按新空间重拉会话权限，
 * 使 tab / 侧栏 / 按钮 gating 随所在空间即时更新（需求方#255、#216）。
 */
export async function switchActiveWorkspace(workspaceId: string): Promise<void> {
  useAuthStore.getState().setActiveWorkspaceId(workspaceId)
  await refreshSession()
}

/**
 * 「只看不切」：按所看空间重解析权限码/菜单，**不改活跃空间、不写 localStorage**。
 *
 * 为什么要和 switchActiveWorkspace 分开（prd46#1207 ②）：
 * 空间管理页是单页列表 + 详情（选卡片不跳路由），进页默认选中列表第一张卡。此前详情挂载时
 * 调 switchActiveWorkspace，等于「看一眼别人的空间 = 把自己的当前空间改成它」，于是：
 * 打开空间管理 → 当前空间被改写成列表第一个（Default）→ 刷新时这个值又被当成显式参数
 * 发给 /auth/session，而显式参数优先于默认空间偏好 ⇒ 用户设的默认空间永远落不回去。
 *
 * 但权限码是「按 租户×工作区」解析的全局量（见 hooks/use-permissions），详情页的 4 个 tab
 * 显隐依赖它。若只删掉挂载副作用而不补重解析，非默认空间的负责人进自有空间会重新看不到
 * 设置/成员 tab —— 那正是需求方#255 修过的 bug。所以这里保留「重解析权限」，只去掉「改写活跃空间」。
 */
/**
 * 「最新一次请求胜出」令牌：空间管理页点卡片不跳路由，连点 A→B 会并发两次重解析。
 * 没有这道闸时，A 的慢响应可能后到并覆盖 B 的权限，页面显示的是 B、权限却是 A 的
 * （tab 多了或少了，且不可复现）。只认最后一次发起的请求，旧响应直接丢弃。
 */
let latestPermissionsRequest = 0

export async function resolvePermissionsForWorkspace(workspaceId: string): Promise<void> {
  const token = ++latestPermissionsRequest
  try {
    const result = await getSession(workspaceId)
    // 期间已有更新的请求发出 ⇒ 本次是过期响应，丢弃，不许回写
    if (token !== latestPermissionsRequest) return
    const store = useAuthStore.getState()
    // 只落权限面；activeWorkspaceId / localStorage 一律不动
    store.setPermissions(result.permissions?.granted ?? null)
    store.setMenus(result.permissions?.menus ?? [])
  } catch {
    /* 失败静默：维持现有权限（fail-closed 由各 gate 兜底），不阻断查看详情 */
  }
}
