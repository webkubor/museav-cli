import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import React, { useState, useEffect } from 'react'
import { LuMenu, LuZap } from 'react-icons/lu'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Brand } from '@/components/brand/Brand'
import { useLangStore } from '@/store/use-brand-store'
import { getMarketConfig } from '@/config/market'
import { useAuth } from '@/components/auth/use-auth'
import { useAuthStore } from '@/store/auth'
import { switchTenant, getSession } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { createOrganization } from '@/services/organizations'
import { applyTheme, getUserTheme, saveTheme } from '@/lib/theme'
import { refreshSession } from '@/lib/auth/refresh-session'
import { useTranslation } from 'react-i18next'
import { listWorkspaces } from '@/services/workspaces'
import { getGatewayEndpoints } from '@/config/gateway'
import type { TenantBrief, TenantItem, SessionResult } from '@/types'
import type { TenantListResponse } from '@/interfaces'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/track'
import { useTrackContext } from '@/hooks/use-track-context'
import { toast } from 'sonner'
import { ConnectModal } from '@/pages/api-keys/ConnectModal'
import { useConnectModalStore } from '@/store/use-connect-modal-store'
import { Modal } from '@/components/ui/Modal'
import {
  buildSyncedNav,
  getTenantAvatarFallback,
  getTenantAvatarUrl,
  getTenantDisplayName,
  getTenantRoleLabel,
  matchConsoleRoute,
} from './dashboard-header-utils'
import { DashboardHeaderNav } from './dashboard-header-nav'
import { AccountMenu } from './dashboard-header-menu'
import { LanguageSwitcher } from './LanguageSwitcher'

/**
 * 重构后的 DashboardHeader
 */
export const DashboardHeader: React.FC<{ onMenuClick?: () => void }> = ({ onMenuClick }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const trackCtx = useTrackContext()
  const market = useLangStore((s) => s.market)
  const marketConfig = getMarketConfig(market)
  // 网关接入地址跟着 store 的 market 走（dev 工具栏切国内/海外不刷新页面），#376
  const gatewayEndpoints = getGatewayEndpoints(market)

  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const { account, tenants, activeTenantId, activeWorkspaceId, setAuth, setActiveWorkspaceId, isAuthenticated } = useAuthStore()
  const { signOut } = useAuth()
  const activeTenantType = tenants.find((t) => t.tenant_id === activeTenantId)?.type ?? 'personal'
  const isNonPersonal = activeTenantType !== 'personal'

  // 顶栏站内导航（模型广场/模型体验/控制台）点击埋点：与侧栏同事件名，source 区分 topnav
  const handleTopNavClick = (navKey: string, to: string) => {
    trackEvent(
      'console_nav_click',
      { ...trackCtx, nav_key: navKey, nav_group: 'topnav', target_route: to, scope_type: 'tenant' },
      { source: 'topnav' },
    )
    navigate(to)
  }

  const syncedNav = buildSyncedNav(t, marketConfig, market, i18n.language)

  // 顶栏三段式毛玻璃：贴顶=实地（不透明，强调品牌/导航基准态）；滚动中（离开顶部但未触底）=
  // 磨砂毛玻璃（半透明+模糊，兼顾可读性与轻盈感）；贴底=透明（内容看完，顶栏视觉上让位）。
  // 内容不够一屏（无法有效滚动）时按贴顶处理，不做"悬浮透明"这种脱离滚动语境的观感。
  const [scrollZone, setScrollZone] = useState<'top' | 'scrolling' | 'bottom'>('top')
  const TOP_THRESHOLD = 15
  const BOTTOM_THRESHOLD = 24

  useEffect(() => {
    let mainEl = document.querySelector('main')
    const handleScroll = () => {
      if (!mainEl) return
      const { scrollTop, scrollHeight, clientHeight } = mainEl
      const scrollable = scrollHeight - clientHeight
      if (scrollable <= TOP_THRESHOLD + BOTTOM_THRESHOLD) {
        setScrollZone('top')
      } else if (scrollTop <= TOP_THRESHOLD) {
        setScrollZone('top')
      } else if (scrollHeight - scrollTop - clientHeight <= BOTTOM_THRESHOLD) {
        setScrollZone('bottom')
      } else {
        setScrollZone('scrolling')
      }
    }

    if (mainEl) {
      handleScroll()
      mainEl.addEventListener('scroll', handleScroll)
    } else {
      const timer = setTimeout(() => {
        mainEl = document.querySelector('main')
        if (mainEl) {
          handleScroll()
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

  // 开关提到 store：新手指南第 4 步「去接入」要打开的就是这一个弹窗（规格 §7.3
  // 「不建设两套配置界面」），而气泡在侧栏、跟顶栏不在同一棵树里。
  const connectModalVisible = useConnectModalStore((s) => s.isOpen)
  const openConnectModal = useConnectModalStore((s) => s.open)
  const closeConnectModal = useConnectModalStore((s) => s.close)

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

  const activeTenantAvatarUrl = getTenantAvatarUrl(activeTenant, account)
  const activeTenantFallback = getTenantAvatarFallback(activeTenant, avatarLetter)

  // 已作为 owner 创建过企业的账户隐藏「创建企业」入口（一人最多创建 1 个）
  const ownsEnterprise = displayTenants.some(
    (tn) => tn.type === 'enterprise' && (tn as { role?: string }).role === 'tenant_owner',
  )
  const canCreateOrg = tenantsData?.can_create_org ?? !ownsEnterprise
  const accountRole = activeTenant?.type === 'personal'
    ? t('header.personalTag')
    : getTenantRoleLabel((activeTenant as TenantItem | undefined)?.role, t)
  const menuTenants = [...displayTenants].sort((a, b) => {
    if (a.tenant_id === activeTenantId) return -1
    if (b.tenant_id === activeTenantId) return 1
    if (a.type === 'enterprise' && b.type !== 'enterprise') return -1
    if (a.type !== 'enterprise' && b.type === 'enterprise') return 1
    return getTenantDisplayName(a, account, t).localeCompare(getTenantDisplayName(b, account, t))
  })
  const personalMenuTenants = menuTenants.filter((tenant) => tenant.type === 'personal')
  const enterpriseMenuTenants = menuTenants.filter((tenant) => tenant.type === 'enterprise')

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
      // 新会话 granted 用于判断「当前页在目标租户是否可访问」——故 await 后再决定跳转（原为 fire-and-forget）
      let grantedNew: string[] = []
      try {
        const s = await getSession()
        applyRefreshedSession(s, tenant.tenant_id)
        grantedNew = s.permissions?.granted ?? []
      } catch (err) {
        console.warn('[permissions] 切换组织后会话重拉失败，使用本地矩阵回退', err)
      }
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      ;(['api-keys', 'guardrails', 'observability', 'billing', 'referral', 'usage', 'logs'] as const)
        .forEach((k) => queryClient.removeQueries({ queryKey: [k] }))
      let defaultWs: { workspace_id: string; name?: string } | undefined
      try {
        const wsItems = await queryClient.fetchQuery({
          queryKey: ['workspaces', tenant.tenant_id],
          queryFn: () => listWorkspaces(),
          staleTime: 0,
        })
        defaultWs = wsItems.find((w) => w.is_default) ?? wsItems[0]
        setActiveWorkspaceId(defaultWs?.workspace_id ?? '')
      } catch {
        setActiveWorkspaceId('')
      }

      // 跳转决策（#470）：当前页在目标租户可访问就别无脑跳首页
      // - 租户级页且有权限 → 留在原页（数据靠 tenant-id-keyed query 自动刷新），不跳
      // - 工作空间级页 → 切到目标租户默认空间的同类页 + 提示（需求 B+提示）
      // - 无权限/无法归类/无可用空间 → 回退首页兜底
      const entry = matchConsoleRoute(location.pathname)
      // 会话拉取失败 → grantedNew 为空 → 判为不可访问 → 回退首页（保守）
      const accessible = !!entry && (!entry.permission || grantedNew.includes(entry.permission))
      if (entry && accessible && entry.scope === 'workspace') {
        if (defaultWs?.workspace_id) {
          navigate(`/workspace/${defaultWs.workspace_id}/${entry.path}`, { replace: true })
          toast.success(t('header.switchedOrgToSpace', { org: tenant.name, space: defaultWs.name || t('common.defaultWorkspace') }))
        } else {
          navigate('/dashboard', { replace: true })
          toast.success(t('header.switchedOrg', { name: tenant.name }))
        }
      } else if (entry && accessible) {
        // 租户级页可访问：留在原页，不跳转
        toast.success(t('header.switchedOrg', { name: tenant.name }))
      } else {
        navigate('/dashboard', { replace: true })
        toast.success(t('header.switchedOrg', { name: tenant.name }))
      }
    } catch (err) {
      // 需求方#676：切换失败常因本地列表已过期（被移出组织/组织已删 → 40301/40401），
      // 而切换器展示的是 store tenants ∪ ['tenants'] 查询的并集——两边都刷新，失效项才会消失，
      // 否则用户会拿着旧列表反复点同一个已失效的租户（与 #216 同根因）
      const code = (err as { code?: number })?.code
      toast.error(
        code === 40301 || code === 40401
          ? t('header.switchTenantStale')
          : t('header.switchTenantFailed'),
      )
      void refreshSession()
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
    }
  }

  function handleCreateApiKeyFromConnect() {
    closeConnectModal()
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
    trackEvent('org:create') // 组织创建无对应 permission_id（自助创建），沿用冒号约定 key
    createOrgMutation.mutate()
  }

  return (
    <header className={cn(
      "h-[60px] px-6 flex items-center justify-between z-[var(--mg-z-header)] relative select-none transition-all duration-300 ease-out shadow-[0_2px_10px_rgba(16,24,40,0.06)]",
      scrollZone === 'top' &&
        "mg-glass-bar",
      scrollZone === 'scrolling' &&
        "mg-glass-bar-strong",
      scrollZone === 'bottom' &&
        "mg-glass-bar"   /* 滚到底也保留玻璃：原为全透明，白底时看不出来，
           改成画布后一透明内容就直接穿过导航（2026-08-06） */
    )}>
      {/* 左侧：Logo & 工作区选择器 */}
      <div className="flex items-center gap-6">
        {/* 窄屏（<md）汉堡：打开侧栏抽屉 */}
        {isAuthenticated && onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={t('nav.openMenu')}
            title={t('nav.openMenu')}
            className="md:hidden -ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-mg-text-2 transition-colors duration-200 hover:bg-mg-fill-0/50 hover:text-mg-text-1 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/40"
          >
            <LuMenu size={20} />
          </button>
        )}
        {/* Logo 展现 */}
        <div
          className="group flex items-center gap-2.5 cursor-pointer active:scale-[0.97] transition-transform duration-150 select-none"
          onClick={() => navigate(isAuthenticated ? '/dashboard' : '/models')}
          title={t('nav.dashboard')}
        >
          {/* 品牌锁定区：全站复用同一组件，按 market 切换 */}
          <Brand />
        </div>

        {isAuthenticated && (
          <button
            type="button"
            onClick={openConnectModal}
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
        <DashboardHeaderNav items={syncedNav} onNavClick={handleTopNavClick} />

        {/* 2. 语言切换：地球图标直达，原深藏于 设置→账号→偏好设置 的入口太深（需求方反馈） */}
        <LanguageSwitcher />

        {/* 3. 用户头像一站式 Dropdown（匿名 → 登录/注册入口） */}
        {!isAuthenticated ? (
          <Button variant="brand" size="sm" onClick={() => navigate('/login')}>
            {t('common.login')}
          </Button>
        ) : (
          <AccountMenu
            account={account}
            avatarLetter={avatarLetter}
            activeTenantId={activeTenantId}
            activeTenant={activeTenant}
            isNonPersonal={isNonPersonal}
            activeTenantAvatarUrl={activeTenantAvatarUrl}
            activeTenantFallback={activeTenantFallback}
            accountRole={accountRole}
            syncedNav={syncedNav}
            onNavClick={handleTopNavClick}
            personalMenuTenants={personalMenuTenants}
            enterpriseMenuTenants={enterpriseMenuTenants}
            canCreateOrg={canCreateOrg}
            onSwitchTenant={handleSwitchTenant}
            onCreateOrg={handleOpenOrgModal}
            onLogout={handleLogout}
          />
        )}
      </div>

      {/* ─── Dialog 1. 创建新组织 ───────────────── */}
      <Modal
        open={orgModalVisible}
        onClose={() => setOrgModalVisible(false)}
        size="sm"
        className="modal-glow-flow"
        title={t('header.createOrg')}
        footer={
          <>
            {/* 顶栏是全局的，文案只能用核心 namespace（common/header 静态导入）。
                原先借用 apiKeys.createModal.*，而 apiKeys 是路由级懒加载 → 在总览等页面
                点「创建企业」按钮会显示 raw key（同 #375 根因）。 */}
            <Button variant="ghost" onClick={() => setOrgModalVisible(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="brand" loading={createOrgMutation.isPending} onClick={handleCreateOrgSubmit}>
              {t('header.createOrgSubmit')}
            </Button>
          </>
        }
      >
        <div className="py-4 flex flex-col gap-2">
          <div className="text-xs font-bold text-mg-text-2">
            {t('header.orgNameLabel')}
          </div>
          <Input
            value={newOrgName}
            onChange={e => setNewOrgName(e.target.value)}
            placeholder={t('header.orgNamePlaceholder')}
            autoFocus
          />
        </div>
      </Modal>

      <ConnectModal
        open={connectModalVisible}
        onClose={closeConnectModal}
        openAIBaseUrl={gatewayEndpoints[0]?.baseUrl ?? ''}
        anthropicBaseUrl={gatewayEndpoints[1]?.baseUrl ?? gatewayEndpoints[0]?.baseUrl ?? ''}
        createdKeyText=""
        docsUrl={marketConfig.docsUrl}
        onCreateKey={handleCreateApiKeyFromConnect}
      />
    </header>
  )
}
