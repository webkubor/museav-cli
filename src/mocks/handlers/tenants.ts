import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'

const PREFIX = '/api/v1'

let orgInviteLink = {
  token: 'org-link-demo-abc123',
  created_at: new Date().toISOString(),
  created_by: 'Demo User',
}

const MOCK_TENANT = {
  tenant_id: '01HV3KTNNT000000000000001',
  name: 'My Workspace',
  slug: 'my-workspace',
  type: 'personal' as const,
  owner_account_id: '01HV3KACCT000000000000001',
  status: 'active' as const,
  is_default: true,
  role: 'tenant_owner' as const,
  max_workspaces: 10,
  max_members: 20,
  current_workspace_count: 1,
  balance: { amount: '110.000000', currency: 'USD' },
  created_at: new Date(Date.now() - 90 * 86400_000).toISOString(),
  settings: {
    billing_email: 'finance@modelgo.ai',
    invoice_company_name: 'ModelGo Demo Inc.',
    invoice_tax_id: 'DEMO-TAX-ID',
  },
}

const MOCK_TENANT_MEMBERS = [
  {
    account: {
      account_id: '01HV3KACCT000000000000001',
      display_name: 'Demo User',
      email: 'demo@modelgo.ai',
      avatar_url: null,
    },
    role: 'tenant_owner' as const,
    joined_at: new Date(Date.now() - 90 * 86400_000).toISOString(),
    workspace_count: 1,
    api_key_count: 2,
    spend_30d: { amount: '12.340000', currency: 'USD' },
    status: 'active' as const,
  },
]

export const tenantHandlers = [
  http.get(`${PREFIX}/tenants`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { items: [MOCK_TENANT] },
    })
  }),

  http.get(`${PREFIX}/tenants/:tenantId`, () => {
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: MOCK_TENANT })
  }),

  http.patch(`${PREFIX}/tenants/:tenantId`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; settings?: typeof MOCK_TENANT.settings }
    if (body.name) MOCK_TENANT.name = body.name
    if (body.settings) MOCK_TENANT.settings = { ...MOCK_TENANT.settings, ...body.settings }
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: MOCK_TENANT })
  }),

  http.get(`${PREFIX}/tenants/:tenantId/members`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { items: MOCK_TENANT_MEMBERS, next_cursor: null, total: 1 },
    })
  }),

  http.post(`${PREFIX}/tenants/:tenantId/members`, async ({ request }) => {
    const body = (await request.json()) as {
      emails?: string[]
      role?: 'tenant_admin' | 'tenant_member'
    }
    const items = (body.emails ?? []).map((email) => ({
      email,
      invitation_id: uuid(),
      status: 'pending',
    }))
    return HttpResponse.json({ code: 0, msg: 'ok', data: { items }, request_id: uuid() })
  }),

  http.patch(`${PREFIX}/tenants/:tenantId/members/:accountId`, () => {
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  http.delete(`${PREFIX}/tenants/:tenantId/members/:accountId`, () => {
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  http.get(`${PREFIX}/tenants/:tenantId/invite-link`, () =>
    HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: orgInviteLink })
  ),

  http.post(`${PREFIX}/tenants/:tenantId/invite-link/reset`, () => {
    orgInviteLink = {
      ...orgInviteLink,
      token: `org-link-${uuid()}`,
      created_at: new Date().toISOString(),
    }
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: orgInviteLink })
  }),
]
