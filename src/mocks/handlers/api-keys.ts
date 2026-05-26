import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'
import type { ApiKeyItem } from '@/types'

const PREFIX = '/api/v1'

const now = new Date().toISOString()

const mockKeys: ApiKeyItem[] = [
  {
    api_key_id: '01HV3KKEY000000000000001',
    name: 'Production',
    prefix: 'sk-live',
    masked: 'sk-live-****wX9k',
    env: 'live',
    status: 'active',
    owner: {
      account_id: '01HV3KACCT000000000000001',
      display_name: 'Demo User',
      email: 'demo@modelgo.ai',
    },
    expires_at: null,
    last_used_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    usage_30d: { amount: '12.340000', currency: 'USD' },
    limit: { amount: '100.000000', currency: 'USD', period: 'monthly' },
    created_at: now,
  },
  {
    api_key_id: '01HV3KKEY000000000000002',
    name: 'Development',
    prefix: 'sk-test',
    masked: 'sk-test-****mK2j',
    env: 'test',
    status: 'active',
    owner: {
      account_id: '01HV3KACCT000000000000001',
      display_name: 'Demo User',
      email: 'demo@modelgo.ai',
    },
    expires_at: null,
    last_used_at: null,
    usage_30d: { amount: '0.000000', currency: 'USD' },
    limit: { amount: '10.000000', currency: 'USD', period: 'monthly' },
    created_at: now,
  },
]

export const apiKeyHandlers = [
  http.get(`${PREFIX}/workspaces/:workspaceId/api-keys`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: { items: mockKeys, next_cursor: null, total: mockKeys.length },
      request_id: uuid(),
    })
  }),

  http.post(`${PREFIX}/workspaces/:workspaceId/api-keys`, async ({ request }) => {
    const body = (await request.json()) as { name: string; env?: string }
    const env = (body.env ?? 'live') as 'live' | 'test'
    const prefix = env === 'live' ? 'sk-live' : 'sk-test'
    const rand = Math.random().toString(36).slice(2, 10)
    const fullKey = `${prefix}-${uuid().replace(/-/g, '').slice(0, 32)}`

    const created: ApiKeyItem & { key: string } = {
      api_key_id: uuid(),
      name: body.name,
      prefix,
      masked: `${prefix}-****${rand.slice(-4)}`,
      key: fullKey,
      env,
      status: 'active',
      owner: {
        account_id: '01HV3KACCT000000000000001',
        display_name: 'Demo User',
        email: 'demo@modelgo.ai',
      },
      expires_at: null,
      last_used_at: null,
      usage_30d: { amount: '0.000000', currency: 'USD' },
      limit: { amount: '100.000000', currency: 'USD', period: 'monthly' },
      created_at: new Date().toISOString(),
    }
    mockKeys.unshift(created)
    return HttpResponse.json({ code: 0, msg: 'ok', data: created, request_id: uuid() })
  }),

  http.patch(`${PREFIX}/workspaces/:workspaceId/api-keys/:keyId`, async ({ request, params }) => {
    const body = (await request.json()) as {
      name?: string
      expires_at?: string | null
      spending_limit?: ApiKeyItem['limit']
    }
    const idx = mockKeys.findIndex((k) => k.api_key_id === params.keyId)
    if (idx !== -1) {
      mockKeys[idx] = {
        ...mockKeys[idx],
        name: body.name ?? mockKeys[idx].name,
        expires_at: body.expires_at ?? mockKeys[idx].expires_at,
        limit: body.spending_limit ?? mockKeys[idx].limit,
      }
    }
    return HttpResponse.json({ code: 0, msg: 'ok', data: mockKeys[idx], request_id: uuid() })
  }),

  http.delete(`${PREFIX}/workspaces/:workspaceId/api-keys/:keyId`, ({ params }) => {
    const idx = mockKeys.findIndex((k) => k.api_key_id === params.keyId)
    if (idx !== -1) mockKeys[idx] = { ...mockKeys[idx], status: 'revoked' }
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),
]
