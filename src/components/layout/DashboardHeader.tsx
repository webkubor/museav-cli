import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import React, { useState, useEffect } from 'react'
import {
  LuChevronDown,
  LuPlus,
  LuSettings,
  LuGlobe,
  LuLogOut,
  LuUser,
  LuBuilding2,
  LuZap,
} from 'react-icons/lu'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSiteIcon } from '@/config/brand-assets'
import { useLangStore } from '@/store/use-brand-store'
import { getMarketConfig } from '@/config/market'
import { useAuth } from '@/components/auth/use-auth'
import { useAuthStore } from '@/store/auth'
import { switchTenant, getSession } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { createOrganization } from '@/services/organizations'
import { applyTheme, getUserTheme } from '@/lib/theme'
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
  const { account, tenants, activeTenantId, activeWorkspaceId, setAuth, setActiveWorkspaceId } = useAuthStore()
  const { signOut } = useAuth()
  const siteIcon = useSiteIcon()
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
    { key: 'models', label: t('nav.models'), to: '/models/catalog', match: (p) => p.startsWith('/models') },
    { key: 'enterprise', label: t('nav.enterprise'), to: '/settings/organization', match: (p) => p.startsWith('/settings/organization') },
    { key: 'referral', label: t('nav.referral'), to: '/referral', match: (p) => p.startsWith('/referral') },
    { key: 'docs', label: t('nav.docsMenu'), href: marketConfig.docsUrl },
    { key: 'changelog', label: t('common.changelog'), href: `${marketConfig.docsUrl}/changelog` },
  ]
  const navClass = (active: boolean) =>
    cn(
      'relative px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap select-none',
      'transition-all duration-200 active:scale-[0.96]',
      'motion-reduce:transition-none motion-reduce:active:scale-100',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/40',
      active
        ? 'text-brand-base font-semibold'
        : 'text-mg-text-1 hover:text-brand-base hover:bg-brand-base/[0.06]',
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

  // 右上角切换器当前上下文标签：组织显示组织名，个人显示「个人」
  const activeTenant = displayTenants.find((tn) => tn.tenant_id === activeTenantId)
  const activeTenantLabel = isNonPersonal
    ? (activeTenant?.name || activeTenant?.slug || t('header.organizations'))
    : t('header.personalTag')
  // 已作为 owner 创建过企业的账户隐藏「创建企业」入口（一人最多创建 1 个）
  const ownsEnterprise = displayTenants.some(
    (tn) => tn.type === 'enterprise' && (tn as { role?: string }).role === 'tenant_owner',
  )
  const canCreateOrg = tenantsData?.can_create_org ?? !ownsEnterprise

  useEffect(() => {
    if (!account) return
    applyTheme(getUserTheme(account.account_id))
  }, [account])

  const avatarLetter =(account?.display_name || account?.email || 'U').charAt(0).toUpperCase()

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
          className="flex items-center gap-2 cursor-pointer active:scale-[0.97] transition-transform duration-150 select-none"
          onClick={() => navigate('/dashboard')}
          title={t('nav.dashboard')}
        >
          {/* Icon mark with shimmer */}
          <div className="logo-shimmer relative rounded-sm overflow-hidden shrink-0">
            <img 
              src={siteIcon} 
              alt="ModelGo Icon" 
              className="h-5 w-auto object-contain block"
            />
          </div>
          {/* Brand name text */}
          <span className="font-bold text-[16px] tracking-tight text-brand-base leading-none">
            {t(market === 'global' ? 'welcomeBanner.brandNameGlobal' : 'welcomeBanner.brandNameDomestic')}
          </span>
          {/* Live status green dot */}
          <span className="logo-status-dot" />
        </div>

        <button
          type="button"
          onClick={() => setConnectModalVisible(true)}
          title={t('header.quickAccess')}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-base/20 bg-brand-base/[0.06] px-2.5 py-1.5 text-xs font-bold text-brand-base transition-all duration-200 hover:border-brand-base/35 hover:bg-brand-base/[0.1] hover:shadow-sm active:scale-[0.97] md:px-3"
        >
          <LuZap size={12} className="shrink-0" />
          <span className="hidden md:inline">{t('header.quickAccess')}</span>
        </button>
      </div>

      {/* 右侧：功能控制区 + 组织 Switcher + 用户头像 */}
      <div className="flex items-center gap-4">
        {/* 1. 三端同步导航（官网为基准的同一组栏目，#251）；窄屏折叠进头像下拉 */}
        <nav className="hidden md:flex items-center gap-0.5">
          {syncedNav.map((item) => {
            const active = !!item.match?.(location.pathname)
            return item.to ? (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.to!)}
                aria-current={active ? 'page' : undefined}
                className={navClass(active)}
              >
                {item.label}
                {active && (
                  <span className="pointer-events-none absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-base" />
                )}
              </button>
            ) : (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={navClass(false)}
              >
                {item.label}
              </a>
            )
          })}
        </nav>

        {/* 2. 用户头像一站式 Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-mg-border hover:border-brand-base/40 hover:bg-mg-fill-0/60 active:scale-95 transition-all duration-150 select-none">
              <Avatar className="h-7 w-7 border border-brand-light/30 shadow-sm">
                {account?.avatar_url && <AvatarImage src={account.avatar_url} alt={account.display_name} />}
                <AvatarFallback className="bg-brand-pale text-brand-base font-bold text-xs">
                  {avatarLetter}
                </AvatarFallback>
              </Avatar>
              <span className="flex items-center gap-1 max-w-[130px]">
                {isNonPersonal
                  ? <LuBuilding2 size={12} className="text-brand-base shrink-0" />
                  : <LuUser size={12} className="text-mg-text-2 shrink-0" />}
                <span className="text-[12px] font-semibold text-mg-text-0 truncate">{activeTenantLabel}</span>
              </span>
              <LuChevronDown size={13} className="text-mg-text-2 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[230px]">
            {/* 当前登录账户（纯信息头部，不参与切换） */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-mg-border/40 mb-1 select-none">
              <Avatar className="h-7 w-7 border border-brand-light/30 shrink-0">
                {account?.avatar_url && <AvatarImage src={account.avatar_url} alt={account.display_name} />}
                <AvatarFallback className="bg-brand-pale text-brand-base font-bold text-xs">
                  {avatarLetter}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-bold text-[13px] text-mg-text-0 leading-tight truncate">
                  {account?.display_name || '—'}
                </div>
                <div className="text-[11px] text-mg-text-2 truncate">{account?.email}</div>
              </div>
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

            {/* 个人 + 企业：平级可切换列表 */}
            {(() => {
              const personalTenant = displayTenants.find((t) => t.type === 'personal')
              if (!personalTenant) return null
              const isActive = personalTenant.tenant_id === activeTenantId
              return (
                <DropdownMenuItem
                  onClick={() => handleSwitchTenant(personalTenant)}
                  style={{
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--brand-base)' : 'var(--mg-text-1)',
                    backgroundColor: isActive ? 'var(--brand-selected-bg)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5 w-full">
                    <span className="h-6 w-6 rounded-full bg-mg-fill-1 flex items-center justify-center shrink-0">
                      <LuUser size={13} className="text-mg-text-1" />
                    </span>
                    <span className="flex-1 truncate max-w-[100px]">{account?.display_name || t('header.personalTag')}</span>
                    <Badge variant="outline" size="xs" className="shrink-0">
                      {t('header.personalTag')}
                    </Badge>
                  </div>
                </DropdownMenuItem>
              )
            })()}

            {displayTenants.filter((t) => t.type === 'enterprise').map((tenant) => {
              const displayName = tenant.name || tenant.slug || tenant.tenant_id
              const letter = displayName.charAt(0).toUpperCase()
              const isActive = tenant.tenant_id === activeTenantId
              const tenantRole = (tenant as TenantItem).role
              const roleLabel: Record<string, string> = {
                tenant_owner: t('header.roleOwner'),
                tenant_admin: t('header.roleAdmin'),
                tenant_member: t('header.roleMember'),
              }
              // 角色按权限分级着色：所有者最突出 → 管理员 → 成员
              const roleBadgeVariant: Record<string, BadgeVariant> = {
                tenant_owner: 'warning',
                tenant_admin: 'info',
                tenant_member: 'secondary',
              }
              return (
                <DropdownMenuItem
                  key={tenant.tenant_id}
                  onClick={() => handleSwitchTenant(tenant)}
                  style={{
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--brand-base)' : 'var(--mg-text-1)',
                    backgroundColor: isActive ? 'var(--brand-selected-bg)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5 w-full">
                    <Avatar className="h-6 w-6 border-none">
                      {tenant.logo_url && <AvatarImage src={tenant.logo_url} />}
                      <AvatarFallback className="text-[10px] bg-mg-fill-1 text-mg-text-1 font-bold">
                        {letter}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate max-w-[100px]">{displayName}</span>
                    {tenantRole && (
                      <Badge variant={roleBadgeVariant[tenantRole] ?? 'secondary'} size="xs" className="shrink-0">
                        {roleLabel[tenantRole] ?? tenantRole}
                      </Badge>
                    )}
                  </div>
                </DropdownMenuItem>
              )
            })}

            {canCreateOrg && (
              <DropdownMenuItem
                onClick={handleOpenOrgModal}
              >
                <LuPlus size={14} className="mr-2 text-mg-text-2 shrink-0" />
                <span>{t('header.createOrg')}</span>
              </DropdownMenuItem>
            )}

            {/* 系统快捷菜单 */}
            <DropdownMenuSeparator />
            {isNonPersonal && (
              <DropdownMenuItem
                onClick={() => navigate('/settings/organization')}
              >
                <LuSettings size={14} className="mr-2 text-mg-text-2 shrink-0" />
                <span>{t('header.orgSettings')}</span>
              </DropdownMenuItem>
            )}
            {isNonPersonal && (
              <DropdownMenuItem
                onClick={() => navigate('/settings/workspace')}
              >
                <LuGlobe size={14} className="mr-2 text-mg-text-2 shrink-0" />
                <span>{t('header.workspaceMgmt')}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => navigate('/settings/account')}
            >
              <LuSettings size={14} className="mr-2 text-mg-text-2 shrink-0" />
              <span>{t('nav.settings')}</span>
            </DropdownMenuItem>

            {/* 退出登录 */}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-rose-500 focus:text-rose-500"
            >
              <LuLogOut size={14} className="mr-2 shrink-0" />
              <span>{t('common.logout')}</span>
            </DropdownMenuItem>

            {/* 版本号：v版本 · 构建短hash · 构建时间，用于核对线上是否为缓存版本 */}
            <DropdownMenuSeparator />
            <div
              className="px-2 py-1.5 text-[10px] leading-tight text-mg-text-3 select-text"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="font-mono">v{__APP_VERSION__} · {__BUILD_HASH__}</div>
              <div className="font-mono opacity-70">{__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC</div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
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
