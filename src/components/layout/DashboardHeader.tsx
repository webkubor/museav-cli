import React, { useState, useEffect } from 'react'
import { Layout, Button, Dropdown, Avatar, Toast, Modal, Input } from '@douyinfe/semi-ui'
import {
  IconChevronDown,
  IconHelpCircle,
  IconLanguage,
  IconSun,
  IconMoon,
  IconPlus,
  IconSetting,
  IconGlobe
} from '@douyinfe/semi-icons'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modelGoLogos } from '@/config/brand-assets'
import { getMarket, type Lang } from '@/lib/market'
import { getMarketConfig } from '@/config/market'
import { useAuthStore } from '@/store/auth'
import { useLangStore } from '@/store/use-brand-store'
import { switchTenant, logout } from '@/services/auth'
import { createTenant, listTenants } from '@/services/tenants'
import { applyTheme, getUserTheme, saveTheme, type Theme } from '@/lib/theme'
import { useTranslation } from 'react-i18next'
import { listWorkspaces, createWorkspace } from '@/services/workspaces'
import type { TenantBrief, WorkspaceItem } from '@/types'

const { Header } = Layout
const market = getMarket()
const { companyName } = getMarketConfig(market)

export const DashboardHeader: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const { account, tenants, activeTenantId, activeWorkspaceId, setAuth, setActiveWorkspaceId, clearAuth } = useAuthStore()
  const activeTenantType = tenants.find((t) => t.tenant_id === activeTenantId)?.type ?? 'personal'
  const isEnterprise = activeTenantType === 'enterprise'
  
  // Theme and Lang state
  const [currentTheme, setCurrentTheme] = useState<Theme>('light')
  const { setLang: setGlobalLang } = useLangStore()

  // Modal and Form States
  const [orgModalVisible, setOrgModalVisible] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgSlug, setNewOrgSlug] = useState('')

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
      setActiveWorkspaceId('')
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      Toast.success(t('header.switchedOrg', { name: tenant.name }))
    } catch {
      Toast.error(t('switchTenantFailed') || '切换组织失败')
    }
  }

  async function handleManageTenant(tenant: TenantBrief) {
    if (tenant.tenant_id !== activeTenantId) {
      try {
        await switchTenant({ tenant_id: tenant.tenant_id })
        setAuth(account!, tenant.tenant_id, tenants, undefined)
        setActiveWorkspaceId('')
        queryClient.invalidateQueries({ queryKey: ['tenants'] })
        queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      } catch {
        Toast.error(t('switchTenantFailed') || '切换组织失败')
        return
      }
    }
    navigate('/settings/organization')
  }

  function handleSwitchWorkspace(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return
    setActiveWorkspaceId(workspaceId)
    const targetWs = workspaces.find((w) => w.workspace_id === workspaceId)
    Toast.success(t('header.switchedWorkspace', { name: targetWs?.name || workspaceId }))
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
    Toast.success(`${t('theme')} -> ${theme === 'light' ? t('themeLight') : theme === 'dark' ? t('themeDark') : t('themeSystem')}`)
  }

  function handleLanguageChange(newLang: Lang) {
    setGlobalLang(newLang)
    i18n.changeLanguage(newLang)
    Toast.success(newLang === 'zh' ? '已切换至 简体中文' : 'Switched to English')
  }

  const createOrgMutation = useMutation({
    mutationFn: () => createTenant({
      name: newOrgName.trim(),
      slug: newOrgSlug.trim(),
      type: 'enterprise',
    }),
    onSuccess: async (org) => {
      Toast.success(t('header.createOrgSuccess', { name: org.name }))
      setOrgModalVisible(false)
      setNewOrgName('')
      setNewOrgSlug('')
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      // 切换至新创建的组织
      try {
        await switchTenant({ tenant_id: org.tenant_id })
        setAuth(account!, org.tenant_id, tenants, undefined)
        setActiveWorkspaceId('')
      } catch {
        // 切换失败不影响创建成功的提示
      }
    },
    onError: (err: any) => {
      Toast.error(err?.message || t('header.createOrgError'))
    },
  })

  function slugFromName(name: string) {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 32)
  }

  const handleOpenOrgModal = () => {
    if (tenants.length >= 5) {
      Toast.warning(t('header.maxOrgWarning'))
      return
    }
    setNewOrgName('')
    setNewOrgSlug('')
    setOrgModalVisible(true)
  }

  const handleCreateOrgSubmit = () => {
    if (!newOrgName.trim()) {
      Toast.error(t('header.orgNameRequired'))
      return
    }
    if (!newOrgSlug.trim()) {
      Toast.error(t('header.orgSlugRequired'))
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
                icon={<IconPlus style={{ fontSize: '14px' }} />}
                onClick={() => setWorkspaceModalVisible(true)}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {t('header.createWorkspace')}
              </Dropdown.Item>
              {isEnterprise && (
                <Dropdown.Item
                  icon={<IconSetting style={{ fontSize: '14px' }} />}
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
            <span style={{ color: 'var(--semi-color-text-1)', fontWeight: 400 }}>{t('header.workspaceLabel')}</span>
            <span style={{ fontWeight: 600, color: 'var(--semi-color-text-0)' }}>{activeWorkspace?.name ?? t('header.defaultWorkspace')}</span>
            <IconChevronDown style={{ fontSize: '10px', color: 'var(--semi-color-text-1)' }} />
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
            icon={<IconLanguage />}
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
            icon={currentTheme === 'dark' ? <IconMoon /> : <IconSun />}
            style={{ color: 'var(--semi-color-text-1)' }}
            title={t('theme') || '主题'}
          />
        </Dropdown>

        {/* 3. 帮助中心链接 */}
        <Button
          theme="borderless"
          icon={<IconHelpCircle />}
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
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{displayName}</span>
                      {tenant.type === 'enterprise' && (
                        <Button
                          size="small"
                          theme="borderless"
                          type="tertiary"
                          icon={<IconSetting style={{ fontSize: '13px', color: 'var(--semi-color-text-2)' }} />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleManageTenant(tenant)
                          }}
                          style={{ padding: '2px 4px', height: '20px', flexShrink: 0 }}
                          title={t('header.manageOrg')}
                        />
                      )}
                    </div>
                  </Dropdown.Item>
                )
              })}

              <Dropdown.Item
                icon={<IconPlus style={{ fontSize: '14px' }} />}
                onClick={handleOpenOrgModal}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {t('header.createOrg')}
              </Dropdown.Item>

              {/* 3. 系统快捷跳转功能 */}
              <Dropdown.Divider />
              {isEnterprise && (
                <Dropdown.Item
                  icon={<IconSetting style={{ fontSize: '14px' }} />}
                  onClick={() => navigate('/settings/organization')}
                  style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
                >
                  {t('header.orgSettings')}
                </Dropdown.Item>
              )}
              {isEnterprise && (
                <Dropdown.Item
                  icon={<IconGlobe style={{ fontSize: '14px' }} />}
                  onClick={() => navigate('/settings/workspace')}
                  style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
                >
                  {t('header.workspaceMgmt')}
                </Dropdown.Item>
              )}
              <Dropdown.Item
                icon={<IconSetting style={{ fontSize: '14px' }} />}
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
        onCancel={() => { setOrgModalVisible(false); setNewOrgName(''); setNewOrgSlug('') }}
        width={420}
        style={{ borderRadius: '12px' }}
        okText={t('apiKeys.createModal.confirm')}
        cancelText={t('apiKeys.createModal.cancel')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
              {t('header.orgNameLabel')}
            </div>
            <Input
              value={newOrgName}
              onChange={(val) => {
                setNewOrgName(val)
                setNewOrgSlug(slugFromName(val))
              }}
              placeholder={t('header.orgNamePlaceholder')}
              style={{ borderRadius: '8px' }}
              autoFocus
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
              {t('header.orgSlugLabel')}
            </div>
            <Input
              value={newOrgSlug}
              onChange={(val) => setNewOrgSlug(val)}
              placeholder="my-team"
              style={{ borderRadius: '8px' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--semi-color-text-2)', marginTop: '4px' }}>
              {t('header.orgSlugHint')}
            </div>
          </div>
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
