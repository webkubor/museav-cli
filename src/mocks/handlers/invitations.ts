import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'
import type { InvitationItem } from '@/types'

const PREFIX = '/api/v1'

const invitations: InvitationItem[] = [
  {
    invitation_id: '01HV3KINV000000000000001',
    email: 'engineer@example.com',
    role: 'ws_member',
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    invited_by: 'Demo User',
  },
]

let inviteLink = {
  token: 'link-demo-abc123',
  role: 'ws_member' as 'ws_member' | 'ws_admin',
  created_at: new Date().toISOString(),
  created_by: 'Demo User',
}

export const invitationHandlers = [
  http.get(`${PREFIX}/workspaces/:workspaceId/invitations`, ({ request }) => {
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    const items =
      status === 'all' ? invitations : invitations.filter((item) => item.status === status)
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: { items } })
  }),

  http.post(`${PREFIX}/workspaces/:workspaceId/invitations`, async ({ request }) => {
    const body = (await request.json()) as {
      invites?: Array<{ email: string; role: 'ws_member' | 'ws_admin' }>
      expires_in_hours?: number
    }
    const expiresAt = new Date(
      Date.now() + (body.expires_in_hours ?? 168) * 3_600_000
    ).toISOString()
    const items = (body.invites ?? []).map((invite) => ({
      invitation_id: uuid(),
      email: invite.email,
      role: invite.role,
      status: 'pending' as const,
      expires_at: expiresAt,
      invited_by: 'Demo User',
    }))
    invitations.unshift(...items)
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: { items } })
  }),

  http.delete(`${PREFIX}/invitations/:invitationId`, ({ params }) => {
    const idx = invitations.findIndex((item) => item.invitation_id === params.invitationId)
    if (idx !== -1) invitations[idx] = { ...invitations[idx], status: 'revoked' }
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: null })
  }),

  http.get(`${PREFIX}/workspaces/:workspaceId/invite-link`, () => {
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: inviteLink })
  }),

  http.post(`${PREFIX}/workspaces/:workspaceId/invite-link/reset`, async ({ request }) => {
    const body = (await request.json()) as { role: 'ws_member' | 'ws_admin' }
    inviteLink = {
      ...inviteLink,
      token: `link-${uuid()}`,
      role: body.role,
      created_at: new Date().toISOString(),
    }
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: inviteLink })
  }),

  http.get(`${PREFIX}/invitations/:token`, ({ params }) => {
    const token = params.token as string
    if (token === 'expired-token') {
      return HttpResponse.json(
        { code: 40010, msg: 'Invitation expired', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    const isOrgLink = token.startsWith('org-link-')
    const isWsLink = token.startsWith('link-')
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        invitation_id: token,
        ...(!isOrgLink && !isWsLink ? { email: 'engineer@example.com' } : {}),
        role: isWsLink ? inviteLink.role : 'ws_member',
        invited_by: {
          account_id: '01HV3KACCT000000000000001',
          display_name: 'Demo User',
        },
        ...(isOrgLink
          ? {
              tenant: {
                tenant_id: '01HV3KTNNT000000000000001',
                name: 'My Workspace',
                slug: 'my-workspace',
                type: 'personal',
                is_default: true,
              },
              workspace: { workspace_id: '', name: '' },
              workspaces: [
                { workspace_id: '01HV3KWS000000000000001', name: 'ModelGo AI Engineering' },
                { workspace_id: '01HV3KWS000000000000002', name: 'Data Platform' },
              ],
            }
          : {
              workspace: {
                workspace_id: '01HV3KWS000000000000001',
                name: 'ModelGo AI Engineering',
              },
            }),
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      },
    })
  }),

  http.post(`${PREFIX}/invitations/:token/accept`, ({ params }) => {
    const token = params.token as string
    if (token === 'invalid-token') {
      return HttpResponse.json(
        { code: 40011, msg: 'Invalid invitation token', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        workspace_id: '01HV3KWS000000000000001',
      },
    })
  }),
]
