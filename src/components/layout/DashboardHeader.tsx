import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import React, { useState, useEffect } from 'react'
import {
  LuChevronDown,
  LuLanguages,
  LuSun,
  LuMoon,
  LuPlus,
  LuSettings,
  LuGlobe,
  LuBookOpen,
  LuMonitor
} from 'react-icons/lu'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modelGoIcons } from '@/config/brand-assets'
import { getMarket, type Lang } from '@/lib/market'
import { getMarketConfig } from '@/config/market'
import { useAuthStore } from '@/store/auth'
import { useLangStore } from '@/store/use-brand-store'
import { switchTenant, logout } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { createOrganization } from '@/services/organizations'
import { applyTheme, getUserTheme, saveTheme, type Theme } from '@/lib/theme'
import { useTranslation } from 'react-i18next'
import { listWorkspaces, createWorkspace } from '@/services/workspaces'
import type { TenantBrief, TenantItem, WorkspaceItem } from '@/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

const market = getMarket()
const marketConfig = getMarketConfig(market)

/**
 * 重构后的 DashboardHeader
 */
export const DashboardHeader: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const { account, tenants, activeTenantId, activeWorkspaceId, setAuth, setActiveWorkspaceId, clearAuth } = useAuthStore()
  const activeTenantType = tenants.find((t) => t.tenant_id === activeTenantId)?.type ?? 'personal'
  const isNonPersonal = activeTenantType !== 'personal'
  
  const [currentTheme, setCurrentTheme] = useState<Theme>('light')
  const { setLang: setGlobalLang } = useLangStore()
  
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

  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false)
  const [wsName, setWsName] = useState('')
  const [wsSlug, setWsSlug] = useState('')
  const [wsDesc, setWsDesc] = useState('')

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 60_000,
    initialData: tenants.length > 0 ? () => ({ items: tenants }) : undefined,
  })

  const displayTenants = (() => {
    const map = new Map<string, typeof tenants[0]>()
    tenants.forEach((t) => map.set(t.tenant_id, t))
    if (tenantsData?.items) {
      tenantsData.items.forEach((t) => map.set(t.tenant_id, t))
    }
    return Array.from(map.values())
  })()

  const { data: workspaces = [] } = useQuery<WorkspaceItem[]>({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then(res => res.items || []),
    enabled: !!activeTenantId
  })

  const createWorkspaceMutation = useMutation({
    mutationFn: (vals: { name: string; slug: string; description?: string }) => {
      return createWorkspace({
        name: vals.name,
        slug: vals.slug,
        description: vals.description,
        kind: 'team'
      })
    },
    onSuccess: (newWorkspace) => {
      toast.success(t('header.createWorkspaceSuccess', { name: newWorkspace.name }))
      setActiveWorkspaceId(newWorkspace.workspace_id)
      setWorkspaceModalVisible(false)
      setWsName('')
      setWsSlug('')
      setWsDesc('')
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: any) => {
      toast.error(err?.message || t('header.createWorkspaceError'))
    }
  })

  useEffect(() => {
    const activeTheme = account ? getUserTheme(account.account_id) : 'light'
    setCurrentTheme(activeTheme)
    applyTheme(activeTheme)
  }, [account])

  const activeWorkspace = workspaces.find((w) => w.workspace_id === activeWorkspaceId) || workspaces.find((w) => w.is_default) || workspaces[0]
  const avatarLetter = (account?.display_name || account?.email || 'U').charAt(0).toUpperCase()

  async function handleSwitchTenant(tenant: TenantBrief) {
    if (tenant.tenant_id === activeTenantId) return
    try {
      await switchTenant({ tenant_id: tenant.tenant_id })
      setAuth(account!, tenant.tenant_id, tenants, undefined)
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      try {
        const wsData = await listWorkspaces()
        const wsItems = wsData.items ?? []
        const defaultWs = wsItems.find((w) => w.is_default) ?? wsItems[0]
        setActiveWorkspaceId(defaultWs?.workspace_id ?? '')
      } catch {
        setActiveWorkspaceId('')
      }
      toast.success(t('header.switchedOrg', { name: tenant.name }))
    } catch {
      toast.error(t('switchTenantFailed') || '切换组织失败')
    }
  }

  function handleSwitchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return
    setActiveWorkspaceId(workspaceId)
    const wsMatch = location.pathname.match(/^\/workspace\/[^/]+\/(.+)$/)
    if (wsMatch) {
      navigate(`/workspace/${workspaceId}/${wsMatch[1]}`, { replace: true })
    }
  }

  async function handleLogout() {
    try {
      await logout()
    } finally {
      clearAuth()
      navigate('/login', { replace: true })
    }
  }

  function handleThemeChange(theme: Theme) {
    setCurrentTheme(theme)
    saveTheme(theme, account?.account_id)
    applyTheme(theme)
  }

  function handleLanguageChange(newLang: Lang) {
    setGlobalLang(newLang)
    i18n.changeLanguage(newLang)
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
      } catch {
        // Ignored
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || t('header.createOrgError'))
    },
  })

  const handleOpenOrgModal = () => {
    if (tenants.length >= 5) {
      toast.warning(t('header.maxOrgWarning'))
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

  const handleCreateWorkspaceSubmit = () => {
    if (!wsName.trim()) {
      toast.error(t('header.wsNameRequired'))
      return
    }
    if (!wsSlug.trim()) {
      toast.error(t('header.wsSlugRequired'))
      return
    }
    createWorkspaceMutation.mutate({
      name: wsName.trim(),
      slug: wsSlug.trim(),
      description: wsDesc.trim() || undefined
    })
  }

  return (
    <header className={cn(
      "h-[60px] border-b px-6 flex items-center justify-between z-40 relative select-none transition-all duration-300 ease-out",
      "bg-[rgba(var(--mg-bg-0-rgb),0.85)] border-mg-border/80 backdrop-blur-md",
      scrolled && "bg-[rgba(var(--mg-bg-0-rgb),0.92)] border-mg-border shadow-sm shadow-black/3"
    )}>
      {/* 左侧：Logo & 工作区选择器 */}
      <div className="flex items-center gap-6">
        {/* Logo 展现 */}
        <div 
          className="flex items-center gap-2 cursor-pointer active:scale-[0.97] transition-transform duration-150 select-none"
          onClick={() => navigate('/')}
        >
          {/* Icon mark with shimmer */}
          <div className="logo-shimmer relative rounded-sm overflow-hidden shrink-0">
            <img 
              src={modelGoIcons[market]} 
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

        {/* 一级菜单流光分隔竖线：高颜值主题色流动渐变 */}
        <div className="w-[1.5px] h-4 sidebar-flow-line pointer-events-none rounded-full" />

        {/* 极雅工作区切换选择 Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center gap-2 bg-mg-fill-0/50 hover:bg-mg-bg-0 hover:border-brand-mid/50 px-3.5 py-1.5 rounded-full border border-mg-border text-xs text-mg-text-1 transition-all duration-200 hover:shadow-sm cursor-pointer">
              <span className="font-bold text-mg-text-0">{activeWorkspace?.name ?? t('header.defaultWorkspace')}</span>
              <LuChevronDown size={10} className="text-mg-text-2" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            {workspaces.map((ws) => (
              <DropdownMenuItem
                key={ws.workspace_id}
                onClick={() => handleSwitchWorkspace(ws.workspace_id)}
                style={{
                  fontWeight: ws.workspace_id === activeWorkspaceId ? 700 : 500,
                  color: ws.workspace_id === activeWorkspaceId ? 'var(--brand-base)' : 'var(--mg-text-1)',
                  backgroundColor: ws.workspace_id === activeWorkspaceId ? 'var(--brand-selected-bg)' : undefined,
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span>{ws.name}</span>
                  {ws.is_default && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-mg-fill-1 text-mg-text-2 font-bold tracking-wide uppercase scale-90">
                      {t('header.defaultTag')}
                    </span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setWorkspaceModalVisible(true)}
            >
              <LuPlus size={14} className="mr-2 text-mg-text-2 shrink-0" />
              <span>{t('header.createWorkspace')}</span>
            </DropdownMenuItem>
            {isNonPersonal && (
              <DropdownMenuItem
                onClick={() => navigate('/settings/workspace')}
              >
                <LuSettings size={14} className="mr-2 text-mg-text-2 shrink-0" />
                <span>{t('header.workspaceMgmt')}</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 右侧：功能控制区 + 组织 Switcher + 用户头像 */}
      <div className="flex items-center gap-4">
        {/* 1. 中英文语言切换 Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              icon={<LuLanguages />}
              title={t('common.language') || '语言'}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[120px]">
            <DropdownMenuItem 
              onClick={() => handleLanguageChange('zh')}
              style={{ fontWeight: i18n.language === 'zh' ? 700 : 500 }}
            >
              {t('header.langZh')}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleLanguageChange('en')}
              style={{ fontWeight: i18n.language === 'en' ? 700 : 500 }}
            >
              {t('header.langEn')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 2. 主题切换明暗双系统 Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              icon={currentTheme === 'dark' ? <LuMoon /> : <LuSun />}
              title={t('common.theme') || '主题'}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[130px]">
            <DropdownMenuItem 
              onClick={() => handleThemeChange('light')}
              style={{ fontWeight: currentTheme === 'light' ? 700 : 500 }}
            >
              <LuSun size={13} className="mr-2 text-mg-text-2 shrink-0" />
              <span>{t('common.themeLight')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleThemeChange('dark')}
              style={{ fontWeight: currentTheme === 'dark' ? 700 : 500 }}
            >
              <LuMoon size={13} className="mr-2 text-mg-text-2 shrink-0" />
              <span>{t('common.themeDark')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleThemeChange('system')}
              style={{ fontWeight: currentTheme === 'system' ? 700 : 500 }}
            >
              <LuMonitor size={13} className="mr-2 text-mg-text-2 shrink-0" />
              <span>{t('common.themeSystem')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 3. 官网 & 文档外链 */}
        <div className="flex items-center gap-0.5">
          <a
            href={marketConfig.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-mg-text-1 hover:text-mg-text-0 hover:bg-mg-fill-0/60 transition-all duration-150 select-none"
          >
            <LuGlobe size={13} className="shrink-0" />
            <span>{t('common.website')}</span>
          </a>
          <a
            href={marketConfig.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-mg-text-1 hover:text-mg-text-0 hover:bg-mg-fill-0/60 transition-all duration-150 select-none"
          >
            <LuBookOpen size={13} className="shrink-0" />
            <span>{t('common.docs')}</span>
          </a>
        </div>
        {/* 一级菜单流光分隔竖线：高颜值主题色流动渐变 */}
        <div className="w-[1.5px] h-4 sidebar-flow-line pointer-events-none rounded-full" />

        {/* 4. 用户头像一站式 Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="cursor-pointer active:scale-95 border-2 border-brand-light/30 shadow-sm transition-transform duration-150">
              {account?.avatar_url && <AvatarImage src={account.avatar_url} alt={account.display_name} />}
              <AvatarFallback className="bg-brand-pale text-brand-base font-bold text-sm">
                {avatarLetter}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[230px]">
            {/* 账户信息 + 个人账户 */}
            {(() => {
              const personalTenant = displayTenants.find((t) => t.type === 'personal')
              const isPersonalActive = personalTenant?.tenant_id === activeTenantId
              return (
                <div
                  className="px-3.5 py-2.5 border-b border-mg-border/40 mb-1 select-none cursor-pointer hover:bg-mg-fill-0/40 transition-colors rounded-t-lg"
                  onClick={() => personalTenant && handleSwitchTenant(personalTenant)}
                  style={{
                    backgroundColor: isPersonalActive ? 'var(--brand-selected-bg)' : undefined,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-mg-text-0 leading-none truncate"
                        style={{ color: isPersonalActive ? 'var(--brand-base)' : undefined }}
                      >
                        {account?.display_name || '—'}
                      </div>
                      <div className="text-[11.5px] text-mg-text-2 mt-1 truncate">
                        {account?.email}
                      </div>
                    </div>
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded border bg-mg-fill-0 border-mg-border text-mg-text-2 scale-90 shrink-0">
                      {t('header.personalTag')}
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* 企业列表（仅 enterprise） */}
            {displayTenants.some((t) => t.type === 'enterprise') && (
              <>
                <div className="px-3.5 py-1 text-[10px] font-bold tracking-wider text-mg-text-2/80 uppercase select-none">
                  {t('header.organizations')}
                </div>
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
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded border bg-mg-fill-0 border-mg-border text-mg-text-2 scale-90 shrink-0">
                            {roleLabel[tenantRole] ?? tenantRole}
                          </span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  )
                })}
              </>
            )}

            <DropdownMenuItem
              onClick={handleOpenOrgModal}
            >
              <LuPlus size={14} className="mr-2 text-mg-text-2 shrink-0" />
              <span>{t('header.createOrg')}</span>
            </DropdownMenuItem>

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
              style={{ color: '#ef4444' }}
            >
              <span>{t('logout')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ─── Dialog 1. 创建新组织 ───────────────── */}
      <Dialog open={orgModalVisible} onOpenChange={setOrgModalVisible}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('header.createOrg')}</DialogTitle>
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

      {/* ─── Dialog 2. 创建新工作区 ───────────────── */}
      <Dialog open={workspaceModalVisible} onOpenChange={setWorkspaceModalVisible}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t('header.createWorkspace')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-1">
                {t('header.wsNameLabel')}
              </div>
              <Input
                value={wsName}
                onChange={e => setWsName(e.target.value)}
                placeholder={t('header.wsNamePlaceholder')}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-1">
                {t('header.wsSlugLabel')}
              </div>
              <Input
                value={wsSlug}
                onChange={e => setWsSlug(e.target.value)}
                placeholder={t('header.wsSlugPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-1">
                {t('header.wsDescLabel')}
              </div>
              <Input
                value={wsDesc}
                onChange={e => setWsDesc(e.target.value)}
                placeholder={t('header.wsDescPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWorkspaceModalVisible(false)}>
              {t('apiKeys.createModal.cancel')}
            </Button>
            <Button variant="brand" loading={createWorkspaceMutation.isPending} onClick={handleCreateWorkspaceSubmit}>
              {t('apiKeys.createModal.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  )
}
