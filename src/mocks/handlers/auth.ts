import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'

const PREFIX = '/api/v1'

const MOCK_ACCOUNT = {
  account_id: '01HV3KACCT000000000000001',
  display_name: 'Demo User',
  email: 'demo@modelgo.ai',
  avatar_url: null as string | null,
}

const MOCK_TENANT = {
  tenant_id: '01HV3KTNNT000000000000001',
  name: 'My Workspace',
  slug: 'my-workspace',
  type: 'personal' as const,
  is_default: true,
}

const MOCK_SESSION = {
  account: MOCK_ACCOUNT,
  active_tenant_id: MOCK_TENANT.tenant_id,
  active_workspace_id: '01HV3KWS000000000000001',
  tenants: [MOCK_TENANT],
  permissions: ['read', 'write'],
  session: {
    session_id: 'sess_mock_001',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    last_seen_at: new Date().toISOString(),
  },
}

const MOCK_PREFERENCES = {
  ui: { language: 'zh' },
  notifications: { low_balance_alerts_enabled: true },
}

// mock 内存登录态，避免依赖 cookie 时序（MSW service worker 拦截时 Set-Cookie 可能尚未写入）
let mockSessionActive = false

function sessionCookieName(market: string | null) {
  return market === 'domestic' ? 'mg-session-cn' : 'mg-session-gl'
}

function setSessionCookie(market: string | null) {
  const name = sessionCookieName(market)
  return `${name}=1; Path=/; SameSite=Lax`
}

function clearSessionCookie(market: string | null) {
  const name = sessionCookieName(market)
  return `${name}=; Path=/; Max-Age=0`
}

function isLoggedIn() {
  return mockSessionActive
}

export const authHandlers = [
  http.post(`${PREFIX}/auth/email/check`, async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    if (!body.email) {
      return HttpResponse.json(
        { code: 40001, msg: '邮箱不能为空', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    const registered = body.email.trim().toLowerCase() === MOCK_ACCOUNT.email
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: { registered, password_login_enabled: registered },
      request_id: uuid(),
    })
  }),

  http.post(`${PREFIX}/auth/email-code/send`, async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    if (!body.email) {
      return HttpResponse.json(
        { code: 40001, msg: '邮箱不能为空', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    if (body.email.trim().toLowerCase() === MOCK_ACCOUNT.email) {
      return HttpResponse.json(
        { code: 40901, msg: '邮箱已注册', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: { expires_in: 300 },
      request_id: uuid(),
    })
  }),

  http.post(`${PREFIX}/auth/email-code/verify`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; code?: string }
    if (!body.email || !body.code) {
      return HttpResponse.json(
        { code: 40001, msg: '参数不完整', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  http.post(`${PREFIX}/auth/email/check`, async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    if (!body.email) {
      return HttpResponse.json(
        { code: 40001, msg: '邮箱不能为空', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    const email = body.email.trim().toLowerCase()
    const registered = !email.startsWith('new@')
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: {
        registered,
        password_login_enabled: registered,
      },
      request_id: uuid(),
    })
  }),

  http.post(`${PREFIX}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as {
      email?: string
      password?: string
      display_name?: string
      email_code?: string
    }
    if (!body.email || !body.password || !body.email_code) {
      return HttpResponse.json(
        { code: 40001, msg: '邮箱、密码和验证码不能为空', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    const market = request.headers.get('X-Market')
    mockSessionActive = true
    return HttpResponse.json(
      {
        code: 0,
        msg: 'ok',
        data: {
          account: {
            ...MOCK_ACCOUNT,
            email: body.email,
            display_name: body.display_name ?? body.email.split('@')[0],
          },
          default_tenant_id: MOCK_TENANT.tenant_id,
          default_workspace_id: '01HV3KWS000000000000001',
        },
        request_id: uuid(),
      },
      { headers: { 'Set-Cookie': setSessionCookie(market) } }
    )
  }),

  http.post(`${PREFIX}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }
    if (!body.email || !body.password) {
      return HttpResponse.json(
        { code: 40001, msg: '邮箱和密码不能为空', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    const market = request.headers.get('X-Market')
    mockSessionActive = true
    return HttpResponse.json(
      {
        code: 0,
        msg: 'ok',
        data: {
          account: { ...MOCK_ACCOUNT, email: body.email },
          active_tenant_id: MOCK_TENANT.tenant_id,
          active_workspace_id: '01HV3KWS000000000000001',
          tenants: [MOCK_TENANT],
        },
        request_id: uuid(),
      },
      { headers: { 'Set-Cookie': setSessionCookie(market) } }
    )
  }),

  http.post(`${PREFIX}/auth/logout`, ({ request }) => {
    const market = request.headers.get('X-Market')
    mockSessionActive = false
    return HttpResponse.json(
      { code: 0, msg: 'ok', data: null, request_id: uuid() },
      { headers: { 'Set-Cookie': clearSessionCookie(market) } }
    )
  }),

  http.put(`${PREFIX}/account/avatar`, async () => {
    // MSW 无法真实存储文件，返回固定占位 URL
    MOCK_ACCOUNT.avatar_url = `https://api.dicebear.com/9.x/initials/svg?seed=Demo`
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { avatar_url: MOCK_ACCOUNT.avatar_url },
    })
  }),

  http.get(`${PREFIX}/account/profile`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        ...MOCK_ACCOUNT,
        email_verified_at: new Date(Date.now() - 30 * 86400_000).toISOString(),
        created_at: new Date(Date.now() - 90 * 86400_000).toISOString(),
        connected_oauth: [],
      },
    })
  }),

  http.patch(`${PREFIX}/account/profile`, async ({ request }) => {
    const body = (await request.json()) as { display_name?: string }
    if (body.display_name) MOCK_ACCOUNT.display_name = body.display_name
    return HttpResponse.json({ code: 0, msg: 'ok', request_id: uuid(), data: { ...MOCK_ACCOUNT } })
  }),

  http.post(`${PREFIX}/account/password`, () => {
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  http.post(`${PREFIX}/account/connect/:provider`, ({ params }) => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        authorize_url: `/dashboard/settings?oauth_provider=${params.provider}&mock=1`,
      },
    })
  }),

  http.delete(`${PREFIX}/account/connect/:provider`, () => {
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  http.get(`${PREFIX}/account/preferences`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: MOCK_PREFERENCES,
    })
  }),

  http.patch(`${PREFIX}/account/preferences`, async ({ request }) => {
    const body = (await request.json()) as {
      ui?: { language?: string }
      notifications?: { low_balance_alerts_enabled?: boolean }
    }
    if (body.ui?.language) MOCK_PREFERENCES.ui.language = body.ui.language
    if (body.notifications?.low_balance_alerts_enabled !== undefined) {
      MOCK_PREFERENCES.notifications.low_balance_alerts_enabled =
        body.notifications.low_balance_alerts_enabled
    }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: MOCK_PREFERENCES,
    })
  }),

  http.post(`${PREFIX}/account/active-tenant`, async ({ request }) => {
    const body = (await request.json()) as { tenant_id?: string }
    if (body.tenant_id) MOCK_SESSION.active_tenant_id = body.tenant_id
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  http.post(`${PREFIX}/account/delete-request`, async ({ request }) => {
    const body = (await request.json()) as { password?: string; reason?: string }
    if (!body.password) {
      return HttpResponse.json(
        { code: 40001, msg: '密码不能为空', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    const deletionScheduledAt = new Date(Date.now() + 30 * 86400_000).toISOString()
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { deletion_scheduled_at: deletionScheduledAt },
    })
  }),

  http.get(`${PREFIX}/auth/session`, () => {
    if (!isLoggedIn()) {
      return HttpResponse.json(
        { code: 40101, msg: '未登录', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: MOCK_SESSION,
      request_id: uuid(),
    })
  }),

  http.post(`${PREFIX}/auth/password/forgot`, async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    if (!body.email) {
      return HttpResponse.json(
        { code: 40001, msg: '邮箱不能为空', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      data: { expires_in: 1800 },
      request_id: uuid(),
    })
  }),

  http.post(`${PREFIX}/auth/password/reset`, async ({ request }) => {
    const body = (await request.json()) as { token?: string; password?: string }
    if (!body.token || !body.password) {
      return HttpResponse.json(
        { code: 40001, msg: '参数不完整', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    if (body.token === 'expired') {
      return HttpResponse.json(
        { code: 40401, msg: '重置链接已过期', data: null, request_id: uuid() },
        { status: 200 }
      )
    }
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  http.get(`${PREFIX}/auth/oauth/wechat/authorize`, ({ request }) => {
    const market = request.headers.get('X-Market')
    const url = new URL(request.url)
    const redirect = url.searchParams.get('redirect') || '/dashboard'
    return new HttpResponse(null, {
      status: 302,
      headers: {
        Location: `/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        'Set-Cookie': setSessionCookie(market),
      },
    })
  }),

  http.get(`${PREFIX}/auth/oauth/:provider/authorize`, ({ request }) => {
    const market = request.headers.get('X-Market')
    const url = new URL(request.url)
    const redirect = url.searchParams.get('redirect') || '/dashboard'

    // 模拟授权成功后的重定向到前端回调页，带上最终去向
    return new HttpResponse(null, {
      status: 302,
      headers: {
        Location: `/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        'Set-Cookie': setSessionCookie(market),
      },
    })
  }),
]
