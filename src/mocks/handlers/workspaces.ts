import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'

const PREFIX = '/api/v1'

const MOCK_WORKSPACES = [
  {
    workspace_id: '01HV3KWS000000000000001',
    tenant_id: '01HV3KTNNT000000000000001',
    name: 'Default',
    slug: 'default',
    kind: 'team' as const,
    is_default: true,
    description: '默认生产工作区',
    owner: {
      account_id: '01HV3KACCT000000000000001',
      display_name: 'Demo User',
      email: 'demo@modelgo.ai',
      avatar_url: null,
    },
    member_count: 3,
    api_key_count: 2,
    spend_7d: { amount: '42.180000', currency: 'USD' },
    created_at: new Date(Date.now() - 90 * 86400_000).toISOString(),
    my_role: 'ws_owner' as const,
  },
]

type MemberRole = 'ws_owner' | 'ws_admin' | 'ws_member'

const MOCK_MEMBERS: Record<
  string,
  Array<{
    account: { account_id: string; display_name: string; email: string; avatar_url: null }
    role: MemberRole
    joined_at: string
    last_active_at: string
  }>
> = {
  '01HV3KWS000000000000001': [
    {
      account: {
        account_id: '01HV3KACCT000000000000001',
        display_name: 'Demo User',
        email: 'demo@modelgo.ai',
        avatar_url: null,
      },
      role: 'ws_owner',
      joined_at: new Date(Date.now() - 90 * 86400_000).toISOString(),
      last_active_at: new Date().toISOString(),
    },
    {
      account: {
        account_id: '01HV3KACCT000000000000002',
        display_name: 'Alice Chen',
        email: 'alice@modelgo.ai',
        avatar_url: null,
      },
      role: 'ws_admin',
      joined_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
      last_active_at: new Date(Date.now() - 2 * 86400_000).toISOString(),
    },
    {
      account: {
        account_id: '01HV3KACCT000000000000003',
        display_name: 'Bob Wang',
        email: 'bob@modelgo.ai',
        avatar_url: null,
      },
      role: 'ws_member',
      joined_at: new Date(Date.now() - 10 * 86400_000).toISOString(),
      last_active_at: new Date(Date.now() - 86400_000).toISOString(),
    },
  ],
}

export const workspaceHandlers = [
  http.get(`${PREFIX}/workspaces`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { items: MOCK_WORKSPACES },
    })
  }),

  http.post(`${PREFIX}/workspaces`, async ({ request }) => {
    const body = (await request.json()) as { name: string; slug?: string; description?: string }
    const ws = {
      workspace_id: uuid(),
      tenant_id: '01HV3KTNNT000000000000001',
      name: body.name,
      slug: body.slug ?? body.name.toLowerCase().replace(/\s+/g, '-'),
      kind: 'team' as const,
      is_default: false,
      description: body.description ?? '',
      owner: {
        account_id: '01HV3KACCT000000000000001',
        display_name: 'Demo User',
        email: 'demo@modelgo.ai',
        avatar_url: null,
      },
      member_count: 1,
      api_key_count: 0,
      spend_7d: { amount: '0.000000', currency: 'USD' },
      created_at: new Date().toISOString(),
      my_role: 'ws_owner' as const,
    }
    MOCK_WORKSPACES.push(ws)
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        ...ws,
        no_api_keys_yet: ws.api_key_count === 0,
        usage_7d: { spend: ws.spend_7d, requests: 0, tokens: 0 },
        status: 'active',
      },
    })
  }),

  http.get(`${PREFIX}/workspaces/:workspaceId`, ({ params }) => {
    const ws = MOCK_WORKSPACES.find((w) => w.workspace_id === params.workspaceId)
    if (!ws) {
      return HttpResponse.json({
        code: 40401,
        msg: '工作空间不存在',
        data: null,
        request_id: uuid(),
      })
    }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        ...ws,
        no_api_keys_yet: ws.api_key_count === 0,
        usage_7d: { spend: ws.spend_7d, requests: 3847, tokens: 2_310_000 },
        status: 'active',
      },
    })
  }),

  http.patch(`${PREFIX}/workspaces/:workspaceId`, async ({ request, params }) => {
    const body = (await request.json()) as { name?: string; description?: string }
    const idx = MOCK_WORKSPACES.findIndex((w) => w.workspace_id === params.workspaceId)
    if (idx >= 0) MOCK_WORKSPACES[idx] = { ...MOCK_WORKSPACES[idx], ...body }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: MOCK_WORKSPACES[idx]
        ? {
            ...MOCK_WORKSPACES[idx],
            no_api_keys_yet: MOCK_WORKSPACES[idx].api_key_count === 0,
            usage_7d: { spend: MOCK_WORKSPACES[idx].spend_7d, requests: 3847, tokens: 2_310_000 },
            status: 'active',
          }
        : null,
    })
  }),

  http.delete(`${PREFIX}/workspaces/:workspaceId`, ({ params }) => {
    const idx = MOCK_WORKSPACES.findIndex((w) => w.workspace_id === params.workspaceId)
    if (idx >= 0) MOCK_WORKSPACES.splice(idx, 1)
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  http.get(`${PREFIX}/workspaces/:workspaceId/members`, ({ params }) => {
    const members = MOCK_MEMBERS[params.workspaceId as string] ?? []
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { items: members, next_cursor: null, total: members.length },
    })
  }),

  http.patch(
    `${PREFIX}/workspaces/:workspaceId/members/:accountId`,
    async ({ request, params }) => {
      const body = (await request.json()) as { role?: MemberRole }
      const members = MOCK_MEMBERS[params.workspaceId as string]
      if (members && body.role) {
        const idx = members.findIndex((m) => m.account.account_id === params.accountId)
        if (idx >= 0) members[idx] = { ...members[idx], role: body.role }
      }
      return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
    }
  ),

  http.delete(`${PREFIX}/workspaces/:workspaceId/members/:accountId`, ({ params }) => {
    const members = MOCK_MEMBERS[params.workspaceId as string]
    if (members) {
      const idx = members.findIndex((m) => m.account.account_id === params.accountId)
      if (idx >= 0) members.splice(idx, 1)
    }
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),
]
