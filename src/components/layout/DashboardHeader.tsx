import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import React, { useState, useEffect, useRef } from 'react'
import {
  LuPlus,
  LuSettings,
  LuLogOut,
  LuZap,
  LuBuilding2,
  LuCheck,
  LuShield,
  LuChevronRight,
} from 'react-icons/lu'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSiteLogo } from '@/config/brand-assets'
import { useLangStore } from '@/store/use-brand-store'
import { getMarketConfig } from '@/config/market'
import { useAuth } from '@/components/auth/use-auth'
import { useAuthStore } from '@/store/auth'
import { switchTenant, getSession } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { createOrganization } from '@/services/organizations'
import { applyTheme, getUserTheme, saveTheme, appendThemeParam } from '@/lib/theme'
import { useTranslation } from 'react-i18next'
import { listWorkspaces } from '@/services/workspaces'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import type { TenantBrief, TenantItem, SessionResult } from '@/types'
import type { TenantListResponse } from '@/interfaces'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ConnectModal } from '@/pages/api-keys/ConnectModal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu'

/**
 * 重构后的 DashboardHeader
 */
export const DashboardHeader: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const market = useLangStore((s) => s.market)
  const marketConfig = getMarketConfig(market)

  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { account, tenants, activeTenantId, activeWorkspaceId, setAuth, setActiveWorkspaceId, isAuthenticated } = useAuthStore()
  const { signOut } = useAuth()
  const siteLogo = useSiteLogo()
  const activeTenantType = tenants.find((t) => t.tenant_id === activeTenantId)?.type ?? 'personal'
  const isNonPersonal = activeTenantType !== 'personal'

  // 三端同步导航（#251）：与官网右上角同一组栏目，「有本端页跳本端、无则跨端跳官网/文档」。
  // 最右槽位仍是头像下拉（app 专属），不进这套同步菜单。
  const syncedNav: Array<{
    key: string
    label: string
    to?: string
    href?: string
    match?: (path: string) => boolean
  }> = [
    // 站内 dashboard 由左上角 logo 承担；这里第一项给「官网」外链（与官网右上角风格统一的入口）
    { key: 'website', label: t('common.website'), href: marketConfig.siteUrl },
    { key: 'models', label: t('nav.models'), to: '/models', match: (p) => p.startsWith('/models') },
    { key: 'enterprise', label: t('nav.enterprise'), to: '/settings/organization', match: (p) => p.startsWith('/settings/organization') },
    { key: 'referral', label: t('nav.referral'), to: '/referral', match: (p) => p.startsWith('/referral') },
    { key: 'docs', label: t('nav.docsMenu'), href: appendThemeParam(marketConfig.docsUrl) },
    { key: 'changelog', label: t('common.changelog'), href: appendThemeParam(`${marketConfig.docsUrl}/changelog`) },
  ]
  const navRef = useRef<HTMLDivElement>(null)
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({
    left: 0,
    width: 0,
    opacity: 0,
  })

  const updateSlider = (el: HTMLElement) => {
    if (!el) return
    setSliderStyle({
      left: el.offsetLeft,
      width: el.offsetWidth,
      opacity: 1,
    })
  }

  // 与官网一致：静止时滑块隐藏（active 仅靠品牌色+粗体体现），pill 仅 hover 滑入
  const resetSlider = () => {
    setSliderStyle((prev) => ({ ...prev, opacity: 0 }))
  }

  const navClass = (active: boolean) =>
    cn(
      'relative px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap select-none',
      'transition-all duration-200 active:scale-[0.96]',
      'motion-reduce:transition-none motion-reduce:active:scale-100',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/40',
      active
        ? 'text-brand-base font-semibold'
        : 'text-mg-text-1 hover:text-brand-base',
    )

  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let mainEl = document.querySelector('main')
    const handleScroll = () => {
      if (mainEl) {
        setScrolled(mainEl.scrollTop > 15)
      }
    }
    
    if (mainEl) {
      mainEl.addEventListener('scroll', handleScroll)
    } else {
      const timer = setTimeout(() => {
        mainEl = document.querySelector('main')
        if (mainEl) {
          mainEl.addEventListener('scroll', handleScroll)
        }
      }, 100)
      return () => clearTimeout(timer)
    }

    return () => {
      if (mainEl) mainEl.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const [orgModalVisible, setOrgModalVisible] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')

  const [connectModalVisible, setConnectModalVisible] = useState(false)

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 60_000,
    enabled: isAuthenticated, // 匿名（公开广场）不拉租户，避免 401

    // session 的 tenants 不含 role，仅作即时占位；placeholderData 不写缓存、仍会拉取带 role 的真实列表
    // 占位数据是 TenantBrief（缺 role 等字段），断言为完整类型；role 由真实请求补全
    placeholderData: tenants.length > 0 ? ({ items: tenants } as TenantListResponse) : undefined,
  })

  const displayTenants = (() => {
    const map = new Map<string, TenantBrief | TenantItem>()
    tenants.forEach((t) => map.set(t.tenant_id, t))
    if (tenantsData?.items) {
      tenantsData.items.forEach((t) => map.set(t.tenant_id, t))
    }
    return Array.from(map.values())
  })()

  // 当前所在租户：个人上下文直接复用账号头像；企业上下文才使用组织 logo。
  const activeTenant = displayTenants.find((tn) => tn.tenant_id === activeTenantId)
  const avatarLetter = (account?.display_name || account?.email || 'U').charAt(0).toUpperCase()

  function getTenantAvatarUrl(tenant?: TenantBrief | TenantItem | null) {
    if (!tenant) return undefined
    if (tenant.type === 'personal') return account?.avatar_url ?? undefined
    return tenant.logo_url ?? undefined
  }

  function getTenantAvatarFallback(tenant?: TenantBrief | TenantItem | null) {
    if (!tenant) return avatarLetter
    if (tenant.type === 'personal') return avatarLetter
    return (tenant.name || tenant.slug || 'O').charAt(0).toUpperCase()
  }

  const activeTenantAvatarUrl = getTenantAvatarUrl(activeTenant)
  const activeTenantFallback = getTenantAvatarFallback(activeTenant)

  // 已作为 owner 创建过企业的账户隐藏「创建企业」入口（一人最多创建 1 个）
  const ownsEnterprise = displayTenants.some(
    (tn) => tn.type === 'enterprise' && (tn as { role?: string }).role === 'tenant_owner',
  )
  const canCreateOrg = tenantsData?.can_create_org ?? !ownsEnterprise
  const accountRole = activeTenant?.type === 'personal'
    ? t('header.personalTag')
    : getTenantRoleLabel((activeTenant as TenantItem | undefined)?.role)
  const menuTenants = [...displayTenants].sort((a, b) => {
    if (a.tenant_id === activeTenantId) return -1
    if (b.tenant_id === activeTenantId) return 1
    if (a.type === 'enterprise' && b.type !== 'enterprise') return -1
    if (a.type !== 'enterprise' && b.type === 'enterprise') return 1
    return getTenantDisplayName(a).localeCompare(getTenantDisplayName(b))
  })
  const personalMenuTenants = menuTenants.filter((tenant) => tenant.type === 'personal')
  const enterpriseMenuTenants = menuTenants.filter((tenant) => tenant.type === 'enterprise')

  function getTenantDisplayName(tenant: TenantBrief | TenantItem) {
    if (tenant.type === 'personal') {
      return account?.display_name || t('header.personalTag')
    }
    return tenant.name || tenant.slug || tenant.tenant_id
  }

  function getTenantRoleLabel(role?: string) {
    const roleLabel: Record<string, string> = {
      tenant_owner: t('header.roleOwner'),
      tenant_admin: t('header.roleAdmin'),
      tenant_member: t('header.roleMember'),
    }
    return role ? (roleLabel[role] ?? role) : t('header.roleMember')
  }

  function getTenantRoleVariant(role?: string): BadgeVariant {
    const roleBadgeVariant: Record<string, BadgeVariant> = {
      tenant_owner: 'warning',
      tenant_admin: 'info',
      tenant_member: 'secondary',
    }
    return role ? (roleBadgeVariant[role] ?? 'secondary') : 'secondary'
  }

  useEffect(() => {
    if (!account) return
    // 若本次是从文档站带 ?theme= 跳转进来的，让该主题成为此用户的偏好（否则会被 getUserTheme 覆盖）
    const fromUrl = sessionStorage.getItem('mg:theme_from_url')
    if (fromUrl === 'dark' || fromUrl === 'light') {
      sessionStorage.removeItem('mg:theme_from_url')
      saveTheme(fromUrl, account.account_id)
      applyTheme(fromUrl)
      return
    }
    applyTheme(getUserTheme(account.account_id))
  }, [account])

  // 会话重拉后完整回写 store：granted + menus + tenants 身份，与登录时的 setAuth 对齐。
  // 仅缺 granted 时旧逻辑会漏掉新组织的 menus 和 enterprise 身份，导致企业管理不出现。
  // expectedTenantId 守卫：重拉期间用户若再次切换组织则放弃落库，避免竞态覆盖。
  function applyRefreshedSession(s: SessionResult, expectedTenantId: string) {
    if (useAuthStore.getState().activeTenantId !== expectedTenantId) return
    setAuth(
      s.account,
      s.active_tenant_id,
      s.tenants,
      useAuthStore.getState().activeWorkspaceId ?? s.active_workspace_id,
      s.permissions?.granted ?? null,
      s.permissions?.menus ?? []
    )
  }

  async function handleSwitchTenant(tenant: TenantBrief) {
    if (tenant.tenant_id === activeTenantId) return
    try {
      await switchTenant({ tenant_id: tenant.tenant_id })
      setAuth(account!, tenant.tenant_id, tenants, undefined)
      getSession()
        .then((s) => applyRefreshedSession(s, tenant.tenant_id))
        .catch((err) => console.warn('[permissions] 切换组织后会话重拉失败，使用本地矩阵回退', err))
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      queryClient.removeQueries({ queryKey: ['api-keys'] })
      queryClient.removeQueries({ queryKey: ['guardrails'] })
      queryClient.removeQueries({ queryKey: ['observability'] })
      queryClient.removeQueries({ queryKey: ['billing'] })
      queryClient.removeQueries({ queryKey: ['referral'] })
      queryClient.removeQueries({ queryKey: ['usage'] })
      queryClient.removeQueries({ queryKey: ['logs'] })
      try {
        const wsItems = await queryClient.fetchQuery({
          queryKey: ['workspaces', tenant.tenant_id],
          queryFn: () => listWorkspaces().then(res => res.items || []),
          staleTime: 0,
        })
        const defaultWs = wsItems.find((w) => w.is_default) ?? wsItems[0]
        setActiveWorkspaceId(defaultWs?.workspace_id ?? '')
      } catch {
        setActiveWorkspaceId('')
      }
      navigate('/dashboard', { replace: true })
      toast.success(t('header.switchedOrg', { name: tenant.name }))
    } catch {
      toast.error(t('switchTenantFailed') || '切换组织失败')
    }
  }

  function handleCreateApiKeyFromConnect() {
    setConnectModalVisible(false)
    navigate(activeWorkspaceId ? `/workspace/${activeWorkspaceId}/api-keys` : '/dashboard')
  }

  async function handleLogout() {
    await signOut()
  }

  const createOrgMutation = useMutation({
    mutationFn: () => createOrganization({ name: newOrgName.trim() }),
    onSuccess: async (org) => {
      toast.success(t('header.createOrgSuccess', { name: org.name }))
      setOrgModalVisible(false)
      setNewOrgName('')
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      try {
        await switchTenant({ tenant_id: org.tenant_id })
        setAuth(account!, org.tenant_id, tenants, undefined)
        setActiveWorkspaceId(org.default_workspace_id)
        getSession()
          .then((s) => applyRefreshedSession(s, org.tenant_id))
          .catch((err) => console.warn('[permissions] 新建组织后会话重拉失败，使用本地矩阵回退', err))
      } catch {
        // Ignored
      }
    },
    onError: (err: unknown) => {
      // 服务端权威校验的错误码映射（web-api 40903/40904 ← permissions 4091/4092）
      const code = (err as { code?: number })?.code
      if (code === 40903) {
        toast.error(t('header.orgOwnerLimitWarning'))
        return
      }
      if (code === 40904) {
        toast.error(t('header.orgMemberLimitWarning'))
        return
      }
      toast.error((err as { message?: string })?.message || t('header.createOrgError'))
    },
  })

  const handleOpenOrgModal = () => {
    // #85 前端预检（服务端是权威，这里只是体验优化）：
    // 约束 2 — 每账户最多创建并拥有 1 个企业组织；
    // 约束 1 — 每账户最多关联 5 个企业组织（owner 也占名额）。
    const items = tenantsData?.items ?? []
    const ownsEnterprise = items.some(
      (it) => it.type === 'enterprise' && (it as { role?: string }).role === 'tenant_owner',
    )
    const canCreateOrg = tenantsData?.can_create_org ?? !ownsEnterprise
    if (!canCreateOrg) {
      toast.warning(t('header.orgOwnerLimitWarning'))
      return
    }
    const enterpriseCount = items.filter((it) => it.type === 'enterprise').length
    if (enterpriseCount >= 5) {
      toast.warning(t('header.orgMemberLimitWarning'))
      return
    }
    setNewOrgName('')
    setOrgModalVisible(true)
  }

  const handleCreateOrgSubmit = () => {
    if (!newOrgName.trim()) {
      toast.error(t('header.orgNameRequired'))
      return
    }
    createOrgMutation.mutate()
  }

  function renderTenantMenuItem(tenant: TenantBrief | TenantItem) {
    const displayName = getTenantDisplayName(tenant)
    const isActive = tenant.tenant_id === activeTenantId
    const tenantRole = (tenant as TenantItem).role
    const tenantAvatarUrl = getTenantAvatarUrl(tenant)
    const tenantAvatarFallback = getTenantAvatarFallback(tenant)

    return (
      <DropdownMenuItem
        key={tenant.tenant_id}
        onClick={() => handleSwitchTenant(tenant)}
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
          className="shrink-0 border-[var(--account-menu-border)] bg-[var(--account-menu-panel-strong)] px-2 py-0.5 text-[10px] text-[var(--account-menu-text-1)]"
        >
          {tenant.type === 'personal' ? t('header.personalTag') : getTenantRoleLabel(tenantRole)}
        </Badge>
        {isActive && <LuCheck size={18} className="text-brand-base shrink-0" />}
      </DropdownMenuItem>
    )
  }

  return (
    <header className={cn(
      "h-[60px] border-b px-6 flex items-center justify-between z-40 relative select-none transition-all duration-300 ease-out",
      "bg-[rgba(var(--mg-bg-0-rgb),0.45)] border-mg-border/30 backdrop-blur-xl saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
      scrolled && "bg-[rgba(var(--mg-bg-0-rgb),0.85)] border-mg-border/80 shadow-md shadow-black/5"
    )}>
      {/* 左侧：Logo & 工作区选择器 */}
      <div className="flex items-center gap-6">
        {/* Logo 展现 */}
        <div
          className="group flex items-center gap-2.5 cursor-pointer active:scale-[0.97] transition-transform duration-150 select-none"
          onClick={() => navigate(isAuthenticated ? '/dashboard' : '/models')}
          title={t('nav.dashboard')}
        >
          {/* Logo：32px，漂浮 + 品牌色光晕呼吸（对齐官网 LogoPremiumM） */}
          <span className="brand-logo-premium shrink-0" style={{ width: 32, height: 32 }}>
            <img src={siteLogo} alt="ModelGo" className="h-8 w-auto object-contain block" />
          </span>
          {/* Wordmark：双色品牌字 + 脉冲（对齐官网 BrandWordmark） */}
          {market === 'global' ? (
            <span className="brand-wordmark brand-wordmark-global text-base">
              <span className="brand-wordmark-global-base">Model</span>
              <span className="brand-wordmark-global-go">Go</span>
              <span className="brand-wordmark-pulse" aria-hidden />
            </span>
          ) : (
            <span className="brand-wordmark brand-wordmark-domestic text-base">
              <span>词元共生</span>
              <span className="brand-wordmark-pulse" aria-hidden />
            </span>
          )}
        </div>

        {isAuthenticated && (
          <button
            type="button"
            onClick={() => setConnectModalVisible(true)}
            title={t('header.quickAccess')}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-base/20 bg-brand-base/[0.06] px-2.5 py-1.5 text-xs font-bold text-brand-base transition-all duration-200 hover:border-brand-base/35 hover:bg-brand-base/[0.1] hover:shadow-sm active:scale-[0.97] md:px-3"
          >
            <LuZap size={12} className="shrink-0" />
            <span className="hidden md:inline">{t('header.quickAccess')}</span>
          </button>
        )}
      </div>

      {/* 右侧：功能控制区 + 组织 Switcher + 用户头像 */}
      <div className="flex items-center gap-4">
        {/* 1. 三端同步导航（官网为基准的同一组栏目，#251）；窄屏折叠进头像下拉 */}
        <nav
          ref={navRef}
          onMouseLeave={resetSlider}
          className="hidden md:flex items-center gap-0.5 relative"
        >
          {/* 磁性悬浮滑块（胶囊气泡） */}
          <div
            style={sliderStyle}
            className="pointer-events-none absolute top-1.5 bottom-1.5 rounded-lg bg-brand-base/[0.08] transition-all duration-[380ms] ease-[cubic-bezier(0.25,1,0.33,1)]"
          />

          {syncedNav.map((item) => {
            const active = !!item.match?.(location.pathname)
            return item.to ? (
              <button
                key={item.key}
                type="button"
                onMouseEnter={(e) => updateSlider(e.currentTarget)}
                onClick={() => navigate(item.to!)}
                aria-current={active ? 'page' : undefined}
                className={navClass(active)}
              >
                {item.label}
              </button>
            ) : (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={(e) => updateSlider(e.currentTarget)}
                className={navClass(false)}
              >
                {item.label}
              </a>
            )
          })}
        </nav>

        {/* 2. 用户头像一站式 Dropdown（匿名 → 登录/注册入口） */}
        {!isAuthenticated ? (
          <Button variant="brand" size="sm" onClick={() => navigate('/login')}>
            {t('common.login', '登录 / 注册')}
          </Button>
        ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full outline-none ring-2 ring-mg-border/70 transition-all duration-200 select-none hover:ring-brand-base/60 hover:shadow-[0_0_0_4px_var(--brand-selected-bg)] focus-visible:ring-brand-base active:scale-[0.93]"
              title={isNonPersonal ? (activeTenant?.name || t('header.organizations')) : (account?.display_name || t('header.personalTag'))}
            >
              <Avatar className="h-9 w-9 block">
                {activeTenantAvatarUrl && (
                  <AvatarImage
                    src={activeTenantAvatarUrl}
                    alt={isNonPersonal ? (activeTenant?.name || '') : (account?.display_name || '')}
                  />
                )}
                <AvatarFallback className="bg-brand-pale text-brand-base font-bold text-sm">
                  {activeTenantFallback}
                </AvatarFallback>
              </Avatar>
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
                className="shrink-0 border-brand-base/25 bg-brand-base/[0.11] px-2.5 py-1 text-[11px] text-brand-base"
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
                      ? navigate(item.to)
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
                <div className="px-2 pb-2 pt-3 text-[12px] font-semibold text-mg-text-2 select-none">
                  {t('header.personalSpace')}
                </div>
                <div className="overflow-hidden rounded-lg border border-[var(--account-menu-border)] bg-[var(--account-menu-panel)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  {personalMenuTenants.map(renderTenantMenuItem)}
                </div>
              </>
            )}

            <div className="px-2 pb-2 pt-3 text-[12px] font-semibold text-mg-text-2 select-none">
              {t('header.organizations')}
            </div>
            <div className="overflow-hidden rounded-lg border border-[var(--account-menu-border)] bg-[var(--account-menu-panel)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {enterpriseMenuTenants.map(renderTenantMenuItem)}
              {canCreateOrg && (
                <DropdownMenuItem
                  onClick={handleOpenOrgModal}
                  className="h-14 rounded-none px-3 text-[14px] font-bold text-[var(--account-menu-text-1)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--account-menu-panel-strong)] text-[var(--account-menu-text-2)] shrink-0">
                    <LuPlus size={18} />
                  </span>
                  <span className="flex-1">{t('header.createOrg')}</span>
                </DropdownMenuItem>
              )}
            </div>

            <div className="px-2 pb-1.5 pt-4 text-[12px] font-semibold text-mg-text-2 select-none">
              {t('nav.account')}
            </div>
            <DropdownMenuItem
              onClick={() => navigate('/settings/account')}
              className="h-11 px-2.5 text-[14px] font-bold text-[var(--account-menu-text-0)]"
            >
              <LuSettings size={18} className="text-[var(--account-menu-text-2)] shrink-0" />
              <span className="flex-1">{t('nav.account')}</span>
              <LuChevronRight size={15} className="text-[var(--account-menu-text-3)] shrink-0" />
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigate('/settings/account?tab=security')}
              className="h-11 px-2.5 text-[14px] font-bold text-[var(--account-menu-text-0)]"
            >
              <LuShield size={18} className="text-[var(--account-menu-text-2)] shrink-0" />
              <span className="flex-1">{t('account.tabs.security')}</span>
              <LuChevronRight size={15} className="text-[var(--account-menu-text-3)] shrink-0" />
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="h-12 px-2.5 text-[14px] font-bold text-[var(--account-menu-danger)] focus:text-[var(--account-menu-danger)] hover:text-[var(--account-menu-danger)]"
            >
              <LuLogOut size={18} className="shrink-0" />
              <span>{t('common.logout')}</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <div
              className="px-2.5 pb-2 pt-1.5 text-[11px] leading-relaxed text-mg-text-3/80 select-text"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-mono">v{__APP_VERSION__} · {__BUILD_HASH__} · DEV</div>
              <div className="font-mono opacity-70">{__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC</div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>

      {/* ─── Dialog 1. 创建新组织 ───────────────── */}
      <Dialog open={orgModalVisible} onOpenChange={setOrgModalVisible}>
        <DialogContent className="max-w-[400px] modal-glow-flow">
          <DialogHeader>
            <DialogTitle>{t('header.createOrg')}</DialogTitle>
            <DialogDescription className="sr-only">{t('header.createOrg')}</DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-2">
            <div className="text-xs font-bold text-mg-text-1">
              {t('header.orgNameLabel')}
            </div>
            <Input
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              placeholder={t('header.orgNamePlaceholder')}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOrgModalVisible(false)}>
              {t('apiKeys.createModal.cancel')}
            </Button>
            <Button variant="brand" loading={createOrgMutation.isPending} onClick={handleCreateOrgSubmit}>
              {t('apiKeys.createModal.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConnectModal
        open={connectModalVisible}
        onClose={() => setConnectModalVisible(false)}
        openAIBaseUrl={GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''}
        anthropicBaseUrl={GATEWAY_ENDPOINTS[1]?.baseUrl ?? GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''}
        createdKeyText=""
        docsUrl={marketConfig.docsUrl}
        onCreateKey={handleCreateApiKeyFromConnect}
      />
    </header>
  )
}
