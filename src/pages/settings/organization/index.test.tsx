import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import type { AccountBrief, SessionResult, TenantBrief, TenantDetail, TenantItem } from '@/types'

const switchTenant = vi.fn()
const getSession = vi.fn<() => Promise<SessionResult>>()
const listTenants = vi.fn()
const getTenant = vi.fn()
const listTenantMembers = vi.fn()
const dissolveTenant = vi.fn()
const createOrganization = vi.fn()

vi.mock('@/services/auth', () => ({
  switchTenant: (body: unknown) => switchTenant(body),
  getSession: () => getSession(),
}))

vi.mock('@/services/tenants', () => ({
  listTenants: () => listTenants(),
  getTenant: (tenantId: string) => getTenant(tenantId),
  listTenantMembers: (tenantId: string) => listTenantMembers(tenantId),
  dissolveTenant: (tenantId: string) => dissolveTenant(tenantId),
  updateTenant: vi.fn(),
  uploadTenantLogo: vi.fn(),
}))

vi.mock('@/services/organizations', () => ({
  createOrganization: (body: unknown) => createOrganization(body),
}))

vi.mock('@/services/workspaces', () => ({
  listWorkspaces: () => Promise.resolve({ items: [] }),
}))

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    permissions: [],
    menus: [],
    getMenuActions: () => ({}),
  }),
}))

vi.mock('@/lib/app-toast', () => ({
  appToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import i18n from '@/i18n'
import { useAuthStore } from '@/store/auth'
import OrganizationSettingsPage from '@/pages/settings/organization'

// 页面文案走 i18n，测试统一用中文断言（jsdom 默认 navigator.language 会解析成 en）
i18n.changeLanguage('zh')

const account: AccountBrief = {
  account_id: 'acc_1',
  display_name: 'Alice',
  email: 'alice@modelgo.com',
  avatar_url: null,
}

const personalTenant: TenantBrief = {
  tenant_id: 'tnt_personal',
  name: '个人账户',
  slug: 'personal',
  type: 'personal',
  is_default: true,
}

const orgTenant: TenantBrief = {
  tenant_id: 'tnt_org',
  name: 'Acme Org',
  slug: 'acme-org',
  type: 'enterprise',
  is_default: false,
}

const orgListItem: TenantItem = {
  ...orgTenant,
  role: 'tenant_owner',
  max_workspaces: 1,
  current_workspace_count: 1,
  balance: null,
}

const personalListItem: TenantItem = {
  ...personalTenant,
  role: 'tenant_owner',
  max_workspaces: 1,
  current_workspace_count: 1,
  balance: null,
}

const orgDetail: TenantDetail = {
  tenant_id: orgTenant.tenant_id,
  name: orgTenant.name,
  slug: orgTenant.slug,
  type: orgTenant.type,
  owner_account_id: account.account_id,
  max_workspaces: 1,
  max_members: 10,
  status: 'active',
  created_at: '2026-06-24T00:00:00Z',
  settings: {
    billing_email: '',
    invoice_company_name: '',
    invoice_tax_id: '',
  },
}

function personalSession(): SessionResult {
  return {
    account,
    active_tenant_id: personalTenant.tenant_id,
    active_workspace_id: 'ws_personal',
    tenants: [personalTenant],
    permissions: {
      active_tenant_id: personalTenant.tenant_id,
      active_tenant_type: 'personal',
      active_workspace_id: 'ws_personal',
      region: 'domestic',
      tenant_role: 'tenant_owner',
      workspace_role: 'ws_owner',
      granted: ['dashboard:view'],
      menus: [],
    },
    session: {
      session_id: 'sid_1',
      expires_at: '2026-06-25T00:00:00Z',
      last_seen_at: '2026-06-24T00:00:00Z',
    },
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/organization']}>
        <Routes>
          <Route path="/settings/organization" element={children} />
          <Route path="/dashboard" element={<div>Dashboard Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(<OrganizationSettingsPage />, { wrapper: Wrapper })
}

describe('OrganizationSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({
      account,
      activeTenantId: orgTenant.tenant_id,
      activeWorkspaceId: 'ws_org',
      tenants: [personalTenant, orgTenant],
      permissions: ['dashboard:view', 'org.settings:edit'],
      menus: [],
      isAuthenticated: true,
      isLoading: false,
    })

    let dissolved = false
    listTenants.mockImplementation(async () => ({
      items: dissolved ? [personalListItem] : [personalListItem, orgListItem],
      can_create_org: dissolved,
    }))
    getTenant.mockResolvedValue(orgDetail)
    listTenantMembers.mockResolvedValue({
      items: [{
        account,
        role: 'tenant_owner',
        joined_at: '2026-06-24T00:00:00Z',
        workspace_count: 1,
        api_key_count: 0,
        spend_30d: { amount: '0', currency: 'CNY' },
        status: 'active',
      }],
    })
    dissolveTenant.mockImplementation(async () => {
      dissolved = true
      return null
    })
    switchTenant.mockResolvedValue(null)
    getSession.mockResolvedValue(personalSession())
  })

  it('switches to the personal tenant and returns home after dissolving an organization', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '企业信息' }))
    fireEvent.click(await screen.findByRole('button', { name: '解散组织' }))
    fireEvent.change(screen.getByPlaceholderText(orgTenant.name), { target: { value: orgTenant.name } })
    fireEvent.click(screen.getByRole('button', { name: '确认解散' }))

    await waitFor(() => expect(dissolveTenant).toHaveBeenCalledWith(orgTenant.tenant_id))
    expect(switchTenant).toHaveBeenCalledWith({ tenant_id: personalTenant.tenant_id })
    await screen.findByText('Dashboard Home')

    const state = useAuthStore.getState()
    expect(state.activeTenantId).toBe(personalTenant.tenant_id)
    expect(state.activeWorkspaceId).toBe('ws_personal')
    expect(state.tenants).toEqual([personalTenant])
  })
})
