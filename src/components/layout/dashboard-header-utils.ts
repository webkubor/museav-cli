import type { BadgeVariant } from '@/components/ui/Badge'
import { CONSOLE_ROUTES, type ConsoleRouteMeta } from '@/config/console-routes'
import type { MarketConfig } from '@/config/market'
import { appendThemeParam } from '@/lib/theme'
import type { AccountBrief, TenantBrief } from '@/types'
import type { TenantItem } from '@/types'
import type { TFunction } from 'i18next'

/** 顶栏同步导航条目：to=站内页；href=跨端外链（无 match）。 */
export interface SyncedNavItem {
  key: string
  label: string
  to?: string
  href?: string
  match?: (path: string) => boolean
}

/** 当前 pathname → CONSOLE_ROUTES 条目（工作空间页取 /workspace/:id/ 之后的段匹配）。用于切租户后判当前页可否留。 */
export function matchConsoleRoute(pathname: string): ConsoleRouteMeta | undefined {
  const ws = pathname.match(/^\/workspace\/[^/]+\/(.+)$/)
  if (ws) {
    const sub = ws[1]
    return CONSOLE_ROUTES.find((r) => r.scope === 'workspace' && (sub === r.path || sub.startsWith(r.path + '/')))
  }
  const p = pathname.replace(/^\//, '')
  return CONSOLE_ROUTES.find((r) => r.scope === 'tenant' && (p === r.path || p.startsWith(r.path + '/')))
}

/** 顶栏导航收敛（#360）：对齐 PRD 原型 console 顶栏的 5 项，顺序固定。
 *  「首页 / 说明文档」跨端外链，「模型广场 / 模型体验 / 控制台」为站内页。
 *  企业治理 / 推荐计划 / 更新日志 已从顶栏移除（前两者在侧栏可达，更新日志归站点导航）。 */
export function buildSyncedNav(t: TFunction, marketConfig: MarketConfig): SyncedNavItem[] {
  return [
    { key: 'home', label: t('nav.home'), href: marketConfig.siteUrl },
    { key: 'models', label: t('nav.models'), to: '/models', match: (p) => p.startsWith('/models') && !p.startsWith('/models/playground') && !p.startsWith('/models/compare') },
    { key: 'modelExplore', label: t('nav.modelExplore'), to: '/models/playground', match: (p) => p.startsWith('/models/playground') || p.startsWith('/models/compare') },
    { key: 'docs', label: t('nav.docsMenu'), href: appendThemeParam(marketConfig.docsUrl) },
    // 控制台：回到站内；在非 models/playground 的控制台页高亮
    { key: 'console', label: t('nav.console'), to: '/dashboard', match: (p) => !p.startsWith('/models') },
  ]
}

/** 租户展示名：个人上下文用账号名，企业用 name/slug/tenant_id 兜底。 */
export function getTenantDisplayName(
  tenant: TenantBrief | TenantItem,
  account: AccountBrief | null,
  t: TFunction,
): string {
  if (tenant.type === 'personal') {
    return account?.display_name || t('header.personalTag')
  }
  return tenant.name || tenant.slug || tenant.tenant_id
}

/** 租户角色文案（仅企业租户存在角色徽标）。 */
export function getTenantRoleLabel(role: string | undefined, t: TFunction): string {
  const roleLabel: Record<string, string> = {
    tenant_owner: t('header.roleOwner'),
    tenant_admin: t('header.roleAdmin'),
    tenant_member: t('header.roleMember'),
  }
  return role ? (roleLabel[role] ?? role) : t('header.roleMember')
}

/** 租户角色 → 徽标配色。 */
export function getTenantRoleVariant(role?: string): BadgeVariant {
  const roleBadgeVariant: Record<string, BadgeVariant> = {
    tenant_owner: 'warning',
    tenant_admin: 'info',
    tenant_member: 'secondary',
  }
  return role ? (roleBadgeVariant[role] ?? 'secondary') : 'secondary'
}

/** 租户头像：个人上下文复用账号头像，企业用组织 logo。 */
export function getTenantAvatarUrl(
  tenant: TenantBrief | TenantItem | null | undefined,
  account: AccountBrief | null | undefined,
): string | undefined {
  if (!tenant) return undefined
  if (tenant.type === 'personal') return account?.avatar_url ?? undefined
  return tenant.logo_url ?? undefined
}

/** 租户头像兜底字母：个人=账号首字母，企业=组织名首字母。 */
export function getTenantAvatarFallback(
  tenant: TenantBrief | TenantItem | null | undefined,
  avatarLetter: string,
): string {
  if (!tenant) return avatarLetter
  if (tenant.type === 'personal') return avatarLetter
  return (tenant.name || tenant.slug || 'O').charAt(0).toUpperCase()
}
