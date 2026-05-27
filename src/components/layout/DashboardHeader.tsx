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
  const { account, tenants, activeTenantId, activeWorkspaceId, setAuth, addTenant, setActiveWorkspaceId, clearAuth } = useAuthStore()
  
  // Theme and Lang state
  const [currentTheme, setCurrentTheme] = useState<Theme>('light')
  const { lang, setLang } = useLangStore()

  // Modal and Form States
  const [orgModalVisible, setOrgModalVisible] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')

  const [workspaceModalVisible, setWorkspaceModalVisible] = useState(false)
  const [wsName, setWsName] = useState('')
  const [wsSlug, setWsSlug] = useState('')
  const [wsDesc, setWsDesc] = useState('')

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
      Toast.success(lang === 'zh' ? `工作区 "${newWorkspace.name}" 创建成功` : `Workspace "${newWorkspace.name}" created`)
      setActiveWorkspaceId(newWorkspace.workspace_id)
      setWorkspaceModalVisible(false)
      setWsName('')
      setWsSlug('')
      setWsDesc('')
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || (lang === 'zh' ? '创建工作区失败' : 'Failed to create workspace'))
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
      // 切换租户后将 activeWorkspace 设为空，以便自动拉取该租户下的工作区
      setActiveWorkspaceId('')
      Toast.success(lang === 'zh' ? `已切换至组织: ${tenant.name}` : `Switched to organization: ${tenant.name}`)
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
    Toast.success(lang === 'zh' ? `已切换至工作区: ${targetWs?.name || workspaceId}` : `Switched to workspace: ${targetWs?.name || workspaceId}`)
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
    setLang(newLang)
    i18n.changeLanguage(newLang)
    Toast.success(newLang === 'zh' ? '已切换至 简体中文' : 'Switched to English')
  }

  const handleOpenOrgModal = () => {
    if (tenants.length >= 5) {
      Toast.warning(lang === 'zh' ? '您最多只能关联 5 个组织' : 'You can associate up to 5 organizations')
      return
    }
    setOrgModalVisible(true)
  }

  const handleCreateOrgSubmit = () => {
    if (!newOrgName.trim()) {
      Toast.error(lang === 'zh' ? '组织名称不能为空' : 'Organization name cannot be empty')
      return
    }
    const newTenant: TenantBrief = {
      tenant_id: `tenant-${Date.now()}`,
      name: newOrgName.trim(),
      slug: `slug-${Date.now()}`,
      type: 'enterprise',
      is_default: false
    }
    addTenant(newTenant)
    Toast.success(lang === 'zh' ? `组织 "${newOrgName}" 创建成功` : `Organization "${newOrgName}" created`)
    setOrgModalVisible(false)
    setNewOrgName('')
    // 乐观地直接切换至新创建的组织
    handleSwitchTenant(newTenant)
  }

  const handleCreateWorkspaceSubmit = () => {
    if (!wsName.trim()) {
      Toast.error(lang === 'zh' ? '工作区名称不能为空' : 'Workspace name cannot be empty')
      return
    }
    if (!wsSlug.trim()) {
      Toast.error(lang === 'zh' ? '唯一标识不能为空' : 'Unique identifier (slug) cannot be empty')
      return
    }
    if (!/^[a-z0-9-]+$/.test(wsSlug)) {
      Toast.error(lang === 'zh' ? '唯一标识仅支持小写字母、数字和连字符' : 'Slug only supports lowercase letters, numbers, and hyphens')
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
            开放平台
          </span>
        </div>

        {/* 工作区切换 Switcher Dropdown */}
        <Dropdown
          trigger="click"
          render={
            <Dropdown.Menu style={{ width: '220px', borderRadius: '10px', padding: '6px' }}>
              <div style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--semi-color-text-2)', fontWeight: 500 }}>
                {lang === 'zh' ? '切换工作区' : 'Switch Workspace'}
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
                        {lang === 'zh' ? '默认' : 'Default'}
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
                {lang === 'zh' ? '创建工作区' : 'Create Workspace'}
              </Dropdown.Item>
              <Dropdown.Item
                icon={<IconSetting style={{ fontSize: '14px' }} />}
                onClick={() => navigate('/settings/workspace')}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {lang === 'zh' ? '工作区管理' : 'Workspace Mgmt'}
              </Dropdown.Item>
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
            <span style={{ color: 'var(--semi-color-text-1)', fontWeight: 400 }}>{lang === 'zh' ? '工作区' : 'Workspace'}</span>
            <span style={{ fontWeight: 600, color: 'var(--semi-color-text-0)' }}>{activeWorkspace?.name ?? (lang === 'zh' ? '默认工作区' : 'Default Workspace')}</span>
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
                style={{ borderRadius: '6px', fontSize: '13px', fontWeight: lang === 'zh' ? 600 : 400 }}
              >
                简体中文
              </Dropdown.Item>
              <Dropdown.Item 
                onClick={() => handleLanguageChange('en')}
                style={{ borderRadius: '6px', fontSize: '13px', fontWeight: lang === 'en' ? 600 : 400 }}
              >
                English
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
                {lang === 'zh' ? '组织' : 'Organizations'}
              </div>
              {tenants.map((tenant) => (
                <Dropdown.Item
                  key={tenant.tenant_id}
                  onClick={() => handleSwitchTenant(tenant)}
                  style={{
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: tenant.tenant_id === activeTenantId ? 600 : 400,
                    color: tenant.tenant_id === activeTenantId ? 'var(--semi-color-primary)' : 'var(--semi-color-text-1)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{tenant.name}</span>
                    <Button
                      size="small"
                      theme="borderless"
                      type="tertiary"
                      icon={<IconSetting style={{ fontSize: '13px', color: 'var(--semi-color-text-2)' }} />}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleManageTenant(tenant)
                      }}
                      style={{ padding: '2px 4px', height: '20px' }}
                      title={lang === 'zh' ? '管理此组织' : 'Manage this organization'}
                    />
                  </div>
                </Dropdown.Item>
              ))}

              <Dropdown.Item
                icon={<IconPlus style={{ fontSize: '14px' }} />}
                onClick={handleOpenOrgModal}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {lang === 'zh' ? '创建组织' : 'Create Organization'}
              </Dropdown.Item>

              {/* 3. 系统快捷跳转功能 */}
              <Dropdown.Divider />
              <Dropdown.Item
                icon={<IconSetting style={{ fontSize: '14px' }} />}
                onClick={() => navigate('/settings/organization')}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {lang === 'zh' ? '组织设置' : 'Organization Settings'}
              </Dropdown.Item>
              <Dropdown.Item
                icon={<IconGlobe style={{ fontSize: '14px' }} />}
                onClick={() => navigate('/settings/workspace')}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {lang === 'zh' ? '工作区管理' : 'Workspace Mgmt'}
              </Dropdown.Item>
              <Dropdown.Item
                icon={<IconSetting style={{ fontSize: '14px' }} />}
                onClick={() => navigate('/settings/account')}
                style={{ borderRadius: '6px', fontSize: '13px', color: 'var(--semi-color-text-1)' }}
              >
                {lang === 'zh' ? '设置' : 'Settings'}
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
          <Avatar
            src={account?.avatar_url ?? undefined}
            size="default"
            style={{
              cursor: 'pointer',
              backgroundColor: 'transparent',
              boxShadow: '0 0 0 2px var(--semi-color-primary-light-hover)',
            }}
            imgAttr={{
              style: {
                objectFit: 'cover',
                width: '100%',
                height: '100%'
              }
            }}
          >
            {avatarLetter}
          </Avatar>
        </Dropdown>
      </div>

      {/* ─── Modal 1. 创建新组织 ───────────────── */}
      <Modal
        title={lang === 'zh' ? '创建组织' : 'Create Organization'}
        visible={orgModalVisible}
        onOk={handleCreateOrgSubmit}
        onCancel={() => {
          setOrgModalVisible(false)
          setNewOrgName('')
        }}
        width={400}
        style={{ borderRadius: '12px' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 0' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)' }}>
            {lang === 'zh' ? '组织名称' : 'Organization Name'}
          </div>
          <Input
            value={newOrgName}
            onChange={(val) => setNewOrgName(val)}
            placeholder={lang === 'zh' ? '请输入组织名称' : 'Enter organization name'}
            style={{ borderRadius: '8px' }}
            autoFocus
          />
        </div>
      </Modal>

      {/* ─── Modal 2. 创建新工作区 ───────────────── */}
      <Modal
        title={lang === 'zh' ? '创建工作区' : 'Create Workspace'}
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
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
              {lang === 'zh' ? '工作区名称' : 'Workspace Name'}
            </div>
            <Input
              value={wsName}
              onChange={(val) => setWsName(val)}
              placeholder={lang === 'zh' ? '如：生产环境应用区' : 'e.g. Production Env'}
              style={{ borderRadius: '8px' }}
              autoFocus
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
              {lang === 'zh' ? '唯一标识 (Slug)' : 'Unique Identifier (Slug)'}
            </div>
            <Input
              value={wsSlug}
              onChange={(val) => setWsSlug(val)}
              placeholder={lang === 'zh' ? '如：prod-app' : 'e.g. prod-app'}
              style={{ borderRadius: '8px' }}
            />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)', marginBottom: '6px' }}>
              {lang === 'zh' ? '工作区描述 (选填)' : 'Description (Optional)'}
            </div>
            <Input
              value={wsDesc}
              onChange={(val) => setWsDesc(val)}
              placeholder={lang === 'zh' ? '简述该工作区的用途...' : 'Describe the purpose...'}
              style={{ borderRadius: '8px' }}
            />
          </div>
        </div>
      </Modal>
    </Header>
  )
}
