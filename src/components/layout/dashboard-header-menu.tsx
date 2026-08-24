import React from 'react'
import {
  LuBuilding2,
  LuCheck,
  LuChevronDown,
  LuChevronRight,
  LuLogOut,
  LuPlus,
  LuSettings,
  LuUser,
} from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import { cn } from '@/lib/utils'
import type { AccountBrief, TenantBrief } from '@/types'
import type { TenantItem } from '@/types'
import {
  getTenantAvatarFallback,
  getTenantAvatarUrl,
  getTenantDisplayName,
  getTenantRoleLabel,
  getTenantRoleVariant,
  type SyncedNavItem,
} from './dashboard-header-utils'

interface AccountMenuProps {
  account: AccountBrief | null
  avatarLetter: string
  activeTenantId: string | null
  activeTenant?: TenantBrief | TenantItem
  isNonPersonal: boolean
  activeTenantAvatarUrl?: string
  activeTenantFallback: string
  accountRole: string
  syncedNav: SyncedNavItem[]
  onNavClick: (key: string, to: string) => void
  personalMenuTenants: Array<TenantBrief | TenantItem>
  enterpriseMenuTenants: Array<TenantBrief | TenantItem>
  canCreateOrg: boolean
  onSwitchTenant: (tenant: TenantBrief) => void
  onCreateOrg: () => void
  onLogout: () => void
}

/** 用户头像一站式 Dropdown：账户信息 + 租户切换 + 设置/登出。 */
export const AccountMenu: React.FC<AccountMenuProps> = ({
  account,
  avatarLetter,
  activeTenantId,
  activeTenant,
  isNonPersonal,
  activeTenantAvatarUrl,
  activeTenantFallback,
  accountRole,
  syncedNav,
  onNavClick,
  personalMenuTenants,
  enterpriseMenuTenants,
  canCreateOrg,
  onSwitchTenant,
  onCreateOrg,
  onLogout,
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /** 胶囊入口的完整名称（供 aria-label 与悬停气泡）：企业=租户名，个人=显示名 */
  const pillLabel = isNonPersonal
    ? activeTenant?.name || t('header.organizations')
    : account?.display_name || t('header.personalTag')

  function renderTenantMenuItem(tenant: TenantBrief | TenantItem) {
    const displayName = getTenantDisplayName(tenant, account, t)
    const isActive = tenant.tenant_id === activeTenantId
    const tenantRole = (tenant as TenantItem).role
    const tenantAvatarUrl = getTenantAvatarUrl(tenant, account)
    const tenantAvatarFallback = getTenantAvatarFallback(tenant, avatarLetter)

    return (
      <DropdownMenuItem
        key={tenant.tenant_id}
        onClick={() => onSwitchTenant(tenant)}
        data-track="header:switch_tenant"
        data-tenant-id={tenant.tenant_id}
        className={cn(
          'h-14 rounded-none px-3 text-[14px] font-bold',
          'border-b border-[var(--account-menu-border)] last:border-b-0',
          'text-[var(--account-menu-text-0)] hover:bg-[var(--account-menu-panel-strong)] focus:bg-[var(--account-menu-panel-strong)]',
          isActive && 'bg-brand-base/[0.09] hover:bg-brand-base/[0.11] focus:bg-brand-base/[0.11]',
        )}
      >
        <Avatar className="h-9 w-9 rounded-lg border-none shrink-0">
          {tenantAvatarUrl && <AvatarImage src={tenantAvatarUrl} alt={displayName} />}
          <AvatarFallback className="rounded-lg bg-brand-base/[0.13] text-brand-base">
            {tenant.type === 'personal' ? tenantAvatarFallback : <LuBuilding2 size={18} />}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        <Badge
          variant={tenant.type === 'personal' ? 'secondary' : getTenantRoleVariant(tenantRole)}
          size="xs"
          className="shrink-0 border-[var(--account-menu-border)] bg-[var(--account-menu-panel-strong)] px-2 py-0.5 text-xs text-[var(--account-menu-text-1)]"
        >
          {tenant.type === 'personal' ? t('header.personalTag') : getTenantRoleLabel(tenantRole, t)}
        </Badge>
        {isActive && <LuCheck size={18} className="text-brand-base shrink-0" />}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* #304：右上角胶囊显式带「企业/个人」标识——头像 + 类型图标(企业=楼宇/个人=人) + 当前租户名 + 下拉箭头 */}
        {/* prd#828：原生 title 气泡跟着光标弹、正好压住胶囊里的组织名。
            换成下方自绘气泡（按钮末尾的 tooltip span），位置可控、与组织名同读。 */}
        <button
          data-track="header:tenant_switcher_open"
          className={cn(
            'group relative flex items-center gap-2 rounded-full py-1 pl-1 pr-1.5 outline-none select-none md:pr-2.5',
            'border border-mg-border/70 bg-[rgba(var(--mg-bg-0-rgb),0.4)] transition-all duration-200',
            'hover:border-brand-base/55 hover:bg-brand-base/[0.05] hover:shadow-sm',
            'focus-visible:ring-2 focus-visible:ring-brand-base active:scale-[0.97]',
          )}
          aria-label={pillLabel}
        >
          <Avatar className="h-7 w-7 block shrink-0">
            {activeTenantAvatarUrl && (
              <AvatarImage
                src={activeTenantAvatarUrl}
                alt={isNonPersonal ? (activeTenant?.name || '') : (account?.display_name || '')}
              />
            )}
            <AvatarFallback className="bg-brand-pale text-brand-base font-bold text-xs">
              {activeTenantFallback}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 items-center gap-1.5 md:flex">
            {isNonPersonal ? (
              <LuBuilding2 size={15} className="shrink-0 text-brand-base" aria-label={t('header.organizations')} />
            ) : (
              <LuUser size={15} className="shrink-0 text-brand-base" aria-label={t('header.personalTag')} />
            )}
            <span className="max-w-[140px] truncate text-[13px] font-semibold text-mg-text-1">
              {activeTenant ? getTenantDisplayName(activeTenant, account, t) : (account?.display_name || t('header.personalTag'))}
            </span>
            <LuChevronDown size={15} className="shrink-0 text-mg-text-3" />
          </span>
          {/* 悬停气泡：贴按钮下缘、右对齐（入口在屏幕右上角，右对齐不越界），
              永不遮挡胶囊本体；菜单展开时隐藏，别和下拉面板叠在一起 */}
          <span
            role="tooltip"
            className={cn(
              'pointer-events-none absolute right-0 top-[calc(100%+8px)] z-[var(--mg-z-tooltip)]',
              'w-max max-w-[240px] truncate rounded-[var(--mg-tooltip-radius)] border border-mg-border bg-mg-bg-3',
              'px-[var(--mg-tooltip-pad-x)] py-[var(--mg-tooltip-pad-y)] mg-text-caption font-medium text-mg-text-2 shadow-lg',
              'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-300',
              'group-aria-expanded:hidden',
            )}
          >
            {pillLabel}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          'w-[332px] rounded-lg border p-3',
          'border-[var(--account-menu-border)] bg-[linear-gradient(180deg,var(--account-menu-bg-2)_0%,var(--account-menu-bg)_100%)]',
          'shadow-[0_24px_72px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.08)]',
        )}
      >
        <div className="flex items-center gap-3.5 rounded-lg px-2.5 pb-3 pt-2 select-none">
          <div className="relative shrink-0">
            <Avatar className="h-12 w-12 ring-1 ring-[var(--account-menu-border)] shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
              {account?.avatar_url && <AvatarImage src={account.avatar_url} alt={account.display_name} />}
              <AvatarFallback className="bg-brand-pale text-brand-base font-bold text-sm">
                {avatarLetter}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[var(--account-menu-bg-2)] bg-mg-success shadow-sm shadow-[rgba(15,23,42,0.14)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold leading-tight text-[var(--account-menu-text-0)]">
              {account?.display_name || '—'}
            </div>
            <div className="mt-1 truncate text-[12px] leading-none text-[var(--account-menu-text-2)]">{account?.email}</div>
          </div>
          <Badge
            variant={activeTenant?.type === 'personal' ? 'secondary' : getTenantRoleVariant((activeTenant as TenantItem | undefined)?.role)}
            size="sm"
            className="shrink-0 border-brand-base/25 bg-brand-base/[0.11] px-2.5 py-1 text-xs text-brand-base"
          >
            {accountRole}
          </Badge>
        </div>

        {/* 窄屏兜底：≥md 顶栏直接展示的同步导航，在 <md 折叠进此处 */}
        <div className="md:hidden">
          {syncedNav.map((item) => (
            <DropdownMenuItem
              key={item.key}
              onClick={() =>
                item.to
                  ? onNavClick(item.key, item.to)
                  : window.open(item.href, '_blank', 'noopener,noreferrer')
              }
            >
              <span className="flex-1 truncate">{item.label}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
        </div>

        {personalMenuTenants.length > 0 && (
          <>
            <div className="px-2 pb-2 pt-3 text-[12px] font-semibold text-mg-text-3 select-none">
              {t('header.personalSpace')}
            </div>
            <div className="overflow-hidden rounded-lg border border-[var(--account-menu-border)] bg-[var(--account-menu-panel)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {personalMenuTenants.map(renderTenantMenuItem)}
            </div>
          </>
        )}

        <div className="px-2 pb-2 pt-3 text-[12px] font-semibold text-mg-text-3 select-none">
          {t('header.organizations')}
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--account-menu-border)] bg-[var(--account-menu-panel)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {enterpriseMenuTenants.map(renderTenantMenuItem)}
          {canCreateOrg && (
            <DropdownMenuItem
              onClick={onCreateOrg}
              className="h-14 rounded-none px-3 text-[14px] font-bold text-[var(--account-menu-text-1)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--account-menu-panel-strong)] text-[var(--account-menu-text-2)] shrink-0">
                <LuPlus size={18} />
              </span>
              <span className="flex-1">{t('header.createOrg')}</span>
            </DropdownMenuItem>
          )}
        </div>

        <DropdownMenuItem
          onClick={() => navigate('/settings/account')}
          className="mt-1.5 h-11 px-2.5 text-[14px] font-bold text-[var(--account-menu-text-0)]"
        >
          <LuSettings size={18} className="text-[var(--account-menu-text-2)] shrink-0" />
          <span className="flex-1">{t('nav.settings')}</span>
          <LuChevronRight size={15} className="text-[var(--account-menu-text-3)] shrink-0" />
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onLogout}
          className="h-12 px-2.5 text-[14px] font-bold text-[var(--account-menu-danger)] focus:text-[var(--account-menu-danger)] hover:text-[var(--account-menu-danger)]"
        >
          <LuLogOut size={18} className="shrink-0" />
          <span>{t('common.logout')}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <div
          className="px-2.5 pb-2 pt-1.5 text-xs leading-relaxed text-mg-text-4/80 select-text"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-mono">v{__APP_VERSION__} · {__BUILD_TAG__ || __BUILD_COMMIT__}{import.meta.env.MODE === 'production' ? '' : import.meta.env.MODE === 'test' ? ' · TEST' : ' · DEV'}</div>
          <div className="font-mono opacity-70">{__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC</div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
