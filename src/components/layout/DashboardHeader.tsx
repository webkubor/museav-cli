import React, { useState, useEffect } from 'react'
import { Layout, Button, Dropdown, Avatar, Toast, Modal, Input } from '@douyinfe/semi-ui'
import {
  LuChevronDown,
  LuCircleHelp,
  LuLanguages,
  LuSun,
  LuMoon,
  LuPlus,
  LuSettings,
  LuGlobe
} from 'react-icons/lu'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modelGoLogos } from '@/config/brand-assets'
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
import type { TenantBrief, WorkspaceItem } from '@/types'

const { Header } = Layout
const market = getMarket()
const { companyName } = getMarketConfig(market)

export const DashboardHeader: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const { account, tenants, activeTenantId, activeWorkspaceId, setAuth, setActiveWorkspaceId, clearAuth } = useAuthStore()
  const activeTenantType = tenants.find((t) => t.tenant_id === activeTenantId)?.type ?? 'personal'
  const isNonPersonal = activeTenantType !== 'personal'
  
  // Theme and Lang state
  const [currentTheme, setCurrentTheme] = useState<Theme>('light')
  const { setLang: setGlobalLang } = useLangStore()

  // Modal and Form States
  const [orgModalVisible, setOrgModalVisible] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')

  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false)
  const [wsName, setWsName] = useState('')
  const [wsSlug, setWsSlug] = useState('')
  const [wsDesc, setWsDesc] = useState('')

  // ─── 0. 获取完整的 tenant 列表（含 name），弥补 session tenants 可能缺失名称的问题
  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 60_000,
  })
  // 合并 API 数据与 session 数据：API 可能在特定 org 上下文中不返回 personal tenant，
  // 用 Map 去重（以 tenant_id 为 key），session tenants 作为兜底保底 personal 始终可见
  const displayTenants = (() => {
    const map = new Map<string, typeof tenants[0]>()
    tenants.forEach((t) => map.set(t.tenant_id, t))
    if (tenantsData?.items) {
      tenantsData.items.forEach((t) => map.set(t.tenant_id, t))
    }
    return Array.from(map.values())
  })()

  // ─── 1. TanStack Query 异步获取当前 Tenant 下的工作空间数据 ─────────────────
  const { data: workspaces = [] } = useQuery<WorkspaceItem[]>({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then(res => res.items || []),
    enabled: !!activeTenantId
  })

  // ─── 2. Mutation 创建新工作空间 ─────────────────────
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
      Toast.success(t('header.createWorkspaceSuccess', { name: newWorkspace.name }))
      setActiveWorkspaceId(newWorkspace.workspace_id)
      setWorkspaceModalVisible(false)
      setWsName('')
      setWsSlug('')
      setWsDesc('')
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || t('header.createWorkspaceError'))
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
      // 个人账户可能无工作区，独立 catch 避免影响租户切换
      try {
        const wsData = await listWorkspaces()
        const wsItems = wsData.items ?? []
        const defaultWs = wsItems.find((w) => w.is_default) ?? wsItems[0]
        setActiveWorkspaceId(defaultWs?.workspace_id ?? '')
      } catch {
        setActiveWorkspaceId('')
      }
      Toast.success(t('header.switchedOrg', { name: tenant.name }))
    } catch {
      Toast.error(t('switchTenantFailed') || '切换组织失败')
    }
  }

  function handleSwitchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return
    setActiveWorkspaceId(workspaceId)
    // 如果当前在工作区级路由，URL 同步切换
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
      Toast.success(t('header.createOrgSuccess', { name: org.name }))
      setOrgModalVisible(false)
      setNewOrgName('')
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      // 切换至新创建的组织，并激活其默认工作区
      try {
        await switchTenant({ tenant_id: org.tenant_id })
        setAuth(account!, org.tenant_id, tenants, undefined)
        setActiveWorkspaceId(org.default_workspace_id)
      } catch {
        // 切换失败不影响创建成功的提示
      }
    },
    onError: (err: any) => {
      Toast.error(err?.message || t('header.createOrgError'))
    },
  })

  const handleOpenOrgModal = () => {
    if (tenants.length >= 5) {
      Toast.warning(t('header.maxOrgWarning'))
      return
    }
    setNewOrgName('')
    setOrgModalVisible(true)
  }

  const handleCreateOrgSubmit = () => {
    if (!newOrgName.trim()) {
      Toast.error(t('header.orgNameRequired'))
      return
    }
    createOrgMutation.mutate()
  }

  const handleCreateWorkspaceSubmit = () => {
    if (!wsName.trim()) {
      Toast.error(t('header.wsNameRequired'))
      return
    }
    if (!wsSlug.trim()) {
      Toast.error(t('header.wsSlugRequired'))
      return
    }
    if (!/^[a-z0-9-]+$/.test(wsSlug)) {
      Toast.error(t('header.wsSlugFormatError'))
      return
    }
    createWorkspaceMutation.mutate({ name: wsName, slug: wsSlug, description: wsDesc })
  }

  return (
    <Header style={{
      height: '60px',
      background: 'var(--semi-color-bg-0)',
      borderBottom: '1px solid var(--semi-color-border)',
      boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.02)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      backdropFilter: 'blur(12px) saturate(190%)',
      WebkitBackdropFilter: 'blur(12px) saturate(190%)',
    }}>
      {/* 左侧：Logo + 工作区 Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <img
            src={modelGoLogos[market]}
            alt="ModelGo"
            style={{ width: '30px', height: '30px', objectFit: 'contain' }}
          />
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)', letterSpacing: '-0.02em' }}>
            {companyName}
          </span>
          <span style={{
            fontSize: '13px',
            color: 'var(--semi-color-text-2)',
            borderLeft: '1px solid var(--semi-color-border)',
            paddingLeft: '10px',
            marginLeft: '2px',
            fontWeight: 500,
          }}>
            {t('header.openPlatform')}
          </span>
        </div>

        {/* 工作区切换 Switcher Dropdown */}
        <Dropdown
          trigger="click"
          render={
            <Dropdown.Menu style={{ width: '220px', borderRadius: '10px', padding: '6px' }}>
              <div style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--semi-color-text-2)', fontWeight: 500 }}>
                {t('header.switchWorkspace')}
              </div>
              {workspaces.map((ws) => (
                <Dropdown.Item
                  key={ws.workspace_id}
                  onClick={() => handleSwitchWorkspace(ws.workspace_id)}
                  style={{
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: ws.workspace_id === activeWorkspaceId ? 600 : 400,
                    color: ws.workspace_id === activeWorkspaceId ? 'var(--semi-color-primary)' : 'var(--semi-color-text-1)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span>{ws.name}</span>
                    {ws.is_default && (
                      <span style={{
                        fontSize: '10px',
                        color: 'var(--semi-color-text-2)',
                        background: 'var(--semi-color-fill-0)',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}>
                        {t('header.default')}
                      </span>
                    )}
                  </div>
                </Dropdown.Item>
              ))}
              <Dropdown.Divider />
              <Dropdown.Item
                icon={<LuPlus style={{ fontSize: '14px' }} />}
                onClick={() => setWorkspaceModalVisible(true)}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {t('header.createWorkspace')}
              </Dropdown.Item>
              {isNonPersonal && (
                <Dropdown.Item
                  icon={<LuSettings style={{ fontSize: '14px' }} />}
                  onClick={() => navigate('/settings/workspace')}
                  style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
                >
                  {t('header.workspaceMgmt')}
                </Dropdown.Item>
              )}
            </Dropdown.Menu>
          }
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--semi-color-fill-0)',
            padding: '6px 14px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '12px',
            color: 'var(--semi-color-text-1)',
            border: '1px solid var(--semi-color-border)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--semi-color-bg-0)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(59, 130, 246, 0.5)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.08)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--semi-color-fill-0)'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--semi-color-border)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
          }}
          >
            <span style={{ fontWeight: 600, color: 'var(--semi-color-text-0)' }}>{activeWorkspace?.name ?? t('header.defaultWorkspace')}</span>
            <LuChevronDown style={{ fontSize: '10px', color: 'var(--semi-color-text-1)' }} />
          </div>
        </Dropdown>
      </div>

      {/* 右侧：功能控制区 + 组织 Switcher + 用户头像 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* 1. 中英文语言切换 Dropdown */}
        <Dropdown
          trigger="click"
          position="bottomRight"
          render={
            <Dropdown.Menu style={{ width: '120px', borderRadius: '10px', padding: '6px' }}>
              <Dropdown.Item 
                onClick={() => handleLanguageChange('zh')}
                style={{ borderRadius: '6px', fontSize: '13px', fontWeight: i18n.language === 'zh' ? 600 : 400 }}
              >
                {t('header.langZh')}
              </Dropdown.Item>
              <Dropdown.Item 
                onClick={() => handleLanguageChange('en')}
                style={{ borderRadius: '6px', fontSize: '13px', fontWeight: i18n.language === 'en' ? 600 : 400 }}
              >
                {t('header.langEn')}
              </Dropdown.Item>
            </Dropdown.Menu>
          }
        >
          <Button
            theme="borderless"
            icon={<LuLanguages />}
            style={{ color: 'var(--semi-color-text-1)' }}
            title={t('language') || '语言'}
          />
        </Dropdown>

        {/* 2. 主题切换明暗双系统 Dropdown */}
        <Dropdown
          trigger="click"
          position="bottomRight"
          render={
            <Dropdown.Menu style={{ width: '130px', borderRadius: '10px', padding: '6px' }}>
              <Dropdown.Item 
                onClick={() => handleThemeChange('light')}
                style={{ borderRadius: '6px', fontSize: '13px', fontWeight: currentTheme === 'light' ? 600 : 400 }}
              >
                ☀️ {t('themeLight')}
              </Dropdown.Item>
              <Dropdown.Item 
                onClick={() => handleThemeChange('dark')}
                style={{ borderRadius: '6px', fontSize: '13px', fontWeight: currentTheme === 'dark' ? 600 : 400 }}
              >
                🌙 {t('themeDark')}
              </Dropdown.Item>
              <Dropdown.Item 
                onClick={() => handleThemeChange('system')}
                style={{ borderRadius: '6px', fontSize: '13px', fontWeight: currentTheme === 'system' ? 600 : 400 }}
              >
                💻 {t('themeSystem')}
              </Dropdown.Item>
            </Dropdown.Menu>
          }
        >
          <Button
            theme="borderless"
            icon={currentTheme === 'dark' ? <LuMoon /> : <LuSun />}
            style={{ color: 'var(--semi-color-text-1)' }}
            title={t('theme') || '主题'}
          />
        </Dropdown>

        {/* 3. 帮助中心链接 */}
        <Button
          theme="borderless"
          icon={<LuCircleHelp />}
          style={{ color: 'var(--semi-color-text-1)' }}
          onClick={() => window.open('https://docs.modelgo.com', '_blank')}
          title={t('help') || '帮助'}
        />

        {/* 用户头像 (账户体系与组织管理一站式抽屉) */}
        <Dropdown
          trigger="click"
          position="bottomRight"
          render={
            <Dropdown.Menu style={{ width: '220px', borderRadius: '10px', padding: '6px' }}>
              {/* 1. 账户信息头部 */}
              <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid var(--semi-color-fill-0)', marginBottom: '4px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--semi-color-text-0)' }}>
                  {account?.display_name || '—'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {account?.email}
                </div>
              </div>

              {/* 2. 组织列表切换与就地管理 */}
              <div style={{ padding: '6px 12px 4px', fontSize: '11px', color: 'var(--semi-color-text-2)', fontWeight: 500 }}>
                {t('header.organizations')}
              </div>
              {displayTenants.map((tenant) => {
                const displayName = tenant.name || tenant.slug || tenant.tenant_id
                const letter = displayName.charAt(0).toUpperCase()
                const isActive = tenant.tenant_id === activeTenantId
                const tenantRole = tenantsData?.items?.find((i) => i.tenant_id === tenant.tenant_id)?.role
                const roleLabel: Record<string, string> = {
                  tenant_owner: t('header.roleOwner'),
                  tenant_admin: t('header.roleAdmin'),
                  tenant_member: t('header.roleMember'),
                }
                return (
                  <Dropdown.Item
                    key={tenant.tenant_id}
                    onClick={() => handleSwitchTenant(tenant)}
                    style={{
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--semi-color-primary)' : 'var(--semi-color-text-1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      {/* 组织头像 */}
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
                        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isActive ? 'var(--semi-color-primary-light-hover)' : 'var(--semi-color-fill-0)',
                        border: '1px solid var(--semi-color-fill-0)',
                        fontSize: '11px', fontWeight: 700,
                        color: isActive ? 'var(--semi-color-primary)' : 'var(--semi-color-text-1)',
                      }}>
                        {tenant.logo_url
                          ? <img src={tenant.logo_url} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : letter}
                      </div>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>{displayName}</span>
                      {tenant.type === 'enterprise' && tenantRole && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          flexShrink: 0,
                          backgroundColor: tenantRole === 'tenant_owner'
                            ? 'rgba(var(--semi-color-warning-light-default-rgb), 0.15)'
                            : tenantRole === 'tenant_admin'
                            ? 'rgba(var(--semi-color-primary-light-default-rgb), 0.12)'
                            : 'var(--semi-color-fill-0)',
                          color: tenantRole === 'tenant_owner'
                            ? 'var(--semi-color-warning)'
                            : tenantRole === 'tenant_admin'
                            ? 'var(--semi-color-primary)'
                            : 'var(--semi-color-text-2)',
                          border: '1px solid',
                          borderColor: tenantRole === 'tenant_owner'
                            ? 'rgba(var(--semi-color-warning-light-default-rgb), 0.3)'
                            : tenantRole === 'tenant_admin'
                            ? 'rgba(var(--semi-color-primary-light-default-rgb), 0.25)'
                            : 'var(--semi-color-border)',
                        }}>
                          {roleLabel[tenantRole] ?? tenantRole}
                        </span>
                      )}
                    </div>
                  </Dropdown.Item>
                )
              })}

              <Dropdown.Item
                icon={<LuPlus style={{ fontSize: '14px' }} />}
                onClick={handleOpenOrgModal}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {t('header.createOrg')}
              </Dropdown.Item>

              {/* 3. 系统快捷跳转功能 */}
              <Dropdown.Divider />
              {isNonPersonal && (
                <Dropdown.Item
                  icon={<LuSettings style={{ fontSize: '14px' }} />}
                  onClick={() => navigate('/settings/organization')}
                  style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
                >
                  {t('header.orgSettings')}
                </Dropdown.Item>
              )}
              {isNonPersonal && (
                <Dropdown.Item
                  icon={<LuGlobe style={{ fontSize: '14px' }} />}
                  onClick={() => navigate('/settings/workspace')}
                  style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
                >
                  {t('header.workspaceMgmt')}
                </Dropdown.Item>
              )}
              <Dropdown.Item
                icon={<LuSettings style={{ fontSize: '14px' }} />}
                onClick={() => navigate('/settings/account')}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {t('nav.settings')}
              </Dropdown.Item>

              {/* 4. 退出登录 */}
              <Dropdown.Divider />
              <Dropdown.Item
                onClick={handleLogout}
                style={{ color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}
              >
                {t('logout')}
              </Dropdown.Item>
            </Dropdown.Menu>
          }
        >
          {account?.avatar_url ? (
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
              boxShadow: '0 0 0 2px var(--semi-color-primary-light-hover)',
              backgroundColor: 'var(--semi-color-fill-0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <img
                src={account.avatar_url}
                alt={account.display_name || 'avatar'}
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            </div>
          ) : (
            <Avatar
              size="default"
              style={{
                cursor: 'pointer',
                boxShadow: '0 0 0 2px var(--semi-color-primary-light-hover)',
              }}
            >
              {avatarLetter}
            </Avatar>
          )}
        </Dropdown>
      </div>

      {/* ─── Modal 1. 创建新组织 ───────────────── */}
      <Modal
        title={t('header.createOrg')}
        visible={orgModalVisible}
        onOk={handleCreateOrgSubmit}
        confirmLoading={createOrgMutation.isPending}
        onCancel={() => { setOrgModalVisible(false); setNewOrgName('') }}
        width={420}
        style={{ borderRadius: '12px' }}
        okText={t('apiKeys.createModal.confirm')}
        cancelText={t('apiKeys.createModal.cancel')}
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
            {t('header.orgNameLabel')}
          </div>
          <Input
            value={newOrgName}
            onChange={(val) => setNewOrgName(val)}
            placeholder={t('header.orgNamePlaceholder')}
            style={{ borderRadius: '8px' }}
            autoFocus
          />
        </div>
      </Modal>

      {/* ─── Modal 2. 创建新工作区 ───────────────── */}
      <Modal
        title={t('header.createWorkspace')}
        visible={workspaceModalVisible}
        onOk={handleCreateWorkspaceSubmit}
        onCancel={() => {
          setWorkspaceModalVisible(false)
          setWsName('')
          setWsSlug('')
          setWsDesc('')
        }}
        confirmLoading={createWorkspaceMutation.isPending}
        width={440}
        style={{ borderRadius: '12px' }}
        okText={t('apiKeys.createModal.confirm')}
        cancelText={t('apiKeys.createModal.cancel')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
              {t('header.wsNameLabel')}
            </div>
            <Input
              value={wsName}
              onChange={(val) => setWsName(val)}
              placeholder={t('header.wsNamePlaceholder')}
              style={{ borderRadius: '8px' }}
              autoFocus
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
              {t('header.wsSlugLabel')}
            </div>
            <Input
              value={wsSlug}
              onChange={(val) => setWsSlug(val)}
              placeholder={t('header.wsSlugPlaceholder')}
              style={{ borderRadius: '8px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
              {t('header.wsDescLabel')}
            </div>
            <Input
              value={wsDesc}
              onChange={(val) => setWsDesc(val)}
              placeholder={t('header.wsDescPlaceholder')}
              style={{ borderRadius: '8px' }}
            />
          </div>
        </div>
      </Modal>
    </Header>
  )
}
