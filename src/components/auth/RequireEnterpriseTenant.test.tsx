import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RequireEnterpriseTenant } from './RequireEnterpriseTenant'
import { useAuthStore } from '@/store/auth'
import type { TenantBrief } from '@/types/account'

const personalTenant: TenantBrief = {
  tenant_id: 't-personal',
  name: '个人组织',
  slug: 'personal',
  type: 'personal',
  is_default: true,
}
const enterpriseTenant: TenantBrief = {
  tenant_id: 't-enterprise',
  name: '企业组织',
  slug: 'enterprise',
  type: 'enterprise',
  is_default: false,
}

function renderGuard() {
  return render(
    <MemoryRouter>
      <RequireEnterpriseTenant>
        <div>企业管理页</div>
      </RequireEnterpriseTenant>
    </MemoryRouter>,
  )
}

describe('RequireEnterpriseTenant', () => {
  beforeEach(() => {
    useAuthStore.setState({ tenants: [], activeTenantId: null })
  })

  it('租户未就绪时只显示加载态，不渲染受保护页面', () => {
    renderGuard()
    expect(screen.queryByText('企业管理页')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: '租户加载中' })).toBeInTheDocument()
  })

  it('个人租户深链直达时渲染 403，不渲染企业管理', () => {
    useAuthStore.setState({ tenants: [personalTenant], activeTenantId: personalTenant.tenant_id })
    renderGuard()
    expect(screen.queryByText('企业管理页')).not.toBeInTheDocument()
  })

  it('企业租户正常渲染受保护页面', () => {
    useAuthStore.setState({ tenants: [enterpriseTenant], activeTenantId: enterpriseTenant.tenant_id })
    renderGuard()
    expect(screen.getByText('企业管理页')).toBeInTheDocument()
  })
})
