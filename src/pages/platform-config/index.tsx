import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/store/auth'
import { getPlatformConfig } from '@/services/platform'
import { apiBaseUrl } from '@/lib/request'
import { getSession } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import { listModels, listModelTags } from '@/services/catalog'
import { listApiKeys } from '@/services/api-keys'
import { getReferralOverview, listReferralInvitees, listRewardRecords, listWithdrawals } from '@/services/referral'
import { appToast } from '@/lib/app-toast'
import { syncMenus } from '@/services/admin'
import { MENUS } from '@/config/menu-sync-data'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface EndpointState {
  status: Status
  data: unknown
  error: string | null
  duration: number | null
}

interface EndpointDef {
  label: string
  method: 'GET' | 'POST'
  path: string
  group: string
  call: () => Promise<unknown>
}

function useEndpointState() {
  const [states, setStates] = useState<Record<string, EndpointState>>({})

  const call = async (key: string, fn: () => Promise<unknown>) => {
    setStates((s) => ({ ...s, [key]: { status: 'loading', data: null, error: null, duration: null } }))
    const t0 = Date.now()
    try {
      const data = await fn()
      setStates((s) => ({ ...s, [key]: { status: 'success', data, error: null, duration: Date.now() - t0 } }))
    } catch (e) {
      setStates((s) => ({ ...s, [key]: { status: 'error', data: null, error: (e as Error).message, duration: Date.now() - t0 } }))
    }
  }

  return { states, call }
}

function EndpointCard({ def, state, onCall }: {
  def: EndpointDef
  state: EndpointState | undefined
  onCall: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden mb-3">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-mg-border/40">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono shrink-0 select-none ${
          def.method === 'GET'
            ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
            : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
        }`}>
          {def.method}
        </span>
        <code className="text-xs font-mono text-mg-text-0 flex-1 truncate select-all">
          {def.path}
        </code>
        <span className="text-xs text-mg-text-2 shrink-0 font-medium">{def.label}</span>
        {state?.duration != null && (
          <span className="text-[10px] font-mono text-mg-text-2 shrink-0">
            {state.duration}ms
          </span>
        )}
        <Button
          size="sm"
          variant={state?.status === 'success' ? 'secondary' : 'default'}
          loading={state?.status === 'loading'}
          onClick={onCall}
          className="font-mono text-xs shrink-0 h-7"
        >
          {state?.status === 'success' ? t('platformConfig.recallBtn') : t('platformConfig.callBtn')}
        </Button>
      </div>

      {state?.status === 'loading' && (
        <div className="py-8 flex justify-center items-center">
          <svg className="animate-spin h-5 w-5 text-brand-base" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {state?.status === 'success' && (
        <div className="relative bg-mg-code-bg overflow-hidden">
          <div className="absolute top-3 right-3 text-[10px] font-bold text-mg-success bg-mg-success/10 border border-mg-success/20 px-2 py-0.5 rounded">
            200 OK
          </div>
          <pre className="m-0 p-5 text-xs font-mono text-mg-text-1 overflow-auto max-h-[360px] leading-relaxed shadow-inner select-all w-full min-w-0">
            {JSON.stringify(state.data, null, 2)}
          </pre>
        </div>
      )}

      {state?.status === 'error' && (
        <div className="px-5 py-3.5 bg-rose-500/5 border-t border-rose-500/10 flex items-center gap-3">
          <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
            ERROR
          </span>
          <span className="text-xs font-mono text-rose-500 break-all">{state.error}</span>
        </div>
      )}
    </div>
  )
}


const SCOPE_LABEL: Record<string, string> = {
  tenant: '组织级',
  workspace: '工作区级',
  settings: '设置级',
}

function MenusSyncPanel() {
  const [syncStatus, setSyncStatus] = useState<Status>('idle')
  const [result, setResult] = useState<{ upserted: number; skipped: number } | null>(null)

  const handleSync = async () => {
    setSyncStatus('loading')
    setResult(null)
    try {
      const data = await syncMenus(MENUS)
      setResult(data)
      setSyncStatus('success')
      appToast.success(`同步成功 — upserted: ${data.upserted}, skipped: ${data.skipped}`)
    } catch (err) {
      setSyncStatus('error')
      appToast.error(`同步失败：${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  const groups = ['tenant', 'workspace', 'settings'] as const

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-mg-text-2">
            将下方菜单列表同步到后端（POST /admin/menus/sync）。共 {MENUS.length} 条。
          </p>
          {syncStatus === 'success' && result && (
            <p className="text-xs text-[var(--mg-success)] mt-1 font-semibold">
              ✓ 上次同步成功 — upserted: {result.upserted}, skipped: {result.skipped}
            </p>
          )}
        </div>
        <Button
          onClick={() => { void handleSync() }}
          disabled={syncStatus === 'loading'}
          size="sm"
        >
          {syncStatus === 'loading' ? '同步中…' : '立即同步'}
        </Button>
      </div>

      {groups.map((scope) => {
        const items = MENUS.filter((m) => m.scope === scope)
        return (
          <div key={scope} className="space-y-2">
            <div className="text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">
              {SCOPE_LABEL[scope]}
            </div>
            <div className="space-y-1.5">
              {items.map((m) => (
                <div
                  key={m.key}
                  className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border px-4 py-2.5 space-y-2"
                >
                  <div className="flex items-center gap-4">
                    <code className="text-xs font-mono text-brand-base shrink-0 w-[180px] truncate">{m.key}</code>
                    <span className="text-xs text-mg-text-1 w-[100px] shrink-0">{m.name}</span>
                    <span className="text-xs text-mg-text-2 shrink-0">{m.name_en}</span>
                    {m.view_permission && (
                      <code className="ml-auto text-[10px] font-mono bg-blue-500/10 text-blue-500 border border-blue-500/20 px-1.5 py-0.5 rounded shrink-0">
                        {m.view_permission}
                      </code>
                    )}
                  </div>
                  {m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-[196px]">
                      {m.actions.map((a) => (
                        <code key={a} className="text-[10px] font-mono bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded">
                          {a}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CustomRequestPanel() {
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')
  const [url, setUrl] = useState('')
  const [state, setState] = useState<EndpointState>({ status: 'idle', data: null, error: null, duration: null })

  async function handleSend() {
    if (!url.trim()) return
    const resolved = url.startsWith('http') ? url : `${apiBaseUrl()}${url.startsWith('/') ? '' : '/'}${url}`
    setState({ status: 'loading', data: null, error: null, duration: null })
    const t0 = Date.now()
    try {
      const res = await fetch(resolved, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => res.text())
      setState({ status: 'success', data, error: null, duration: Date.now() - t0 })
    } catch (e) {
      setState({ status: 'error', data: null, error: (e as Error).message, duration: Date.now() - t0 })
    }
  }

  return (
    <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden mb-6">
      <div className="flex items-center gap-2 p-3 border-b border-mg-border/40 bg-mg-bg-1/30">
        {/* Method toggle */}
        {(['GET', 'POST'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={[
              'text-[11px] font-bold font-mono px-2.5 py-1 rounded-md border transition-all duration-150 shrink-0',
              method === m
                ? m === 'GET'
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-500'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                : 'border-mg-border text-mg-text-2 hover:border-mg-border/80',
            ].join(' ')}
          >
            {m}
          </button>
        ))}

        {/* URL input */}
        <input
          className="flex-1 bg-transparent text-sm font-mono text-mg-text-0 placeholder:text-mg-text-2/60 outline-none border-none min-w-0"
          placeholder="粘贴路径或完整 URL，例如 /api/v1/auth/session"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
          spellCheck={false}
        />

        {state.duration != null && (
          <span className="text-[10px] font-mono text-mg-text-2 shrink-0">{state.duration}ms</span>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={state.status === 'loading' || !url.trim()}
          className="shrink-0 px-4 h-8 rounded-lg text-xs font-bold bg-brand-base text-white hover:bg-brand-deep transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.status === 'loading' ? '...' : 'Send'}
        </button>
      </div>

      {state.status === 'success' && (
        <div className="relative bg-mg-code-bg overflow-hidden">
          <div className="absolute top-3 right-3 text-[10px] font-bold text-mg-success bg-mg-success/10 border border-mg-success/20 px-2 py-0.5 rounded z-10">
            OK
          </div>
          <pre className="m-0 p-5 text-xs font-mono text-mg-text-1 overflow-auto max-h-[400px] w-full min-w-0 leading-relaxed select-all">
            {JSON.stringify(state.data, null, 2)}
          </pre>
        </div>
      )}
      {state.status === 'error' && (
        <div className="px-5 py-3.5 bg-rose-500/5 border-t border-rose-500/10 flex items-center gap-3">
          <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">ERROR</span>
          <span className="text-xs font-mono text-rose-500 break-all">{state.error}</span>
        </div>
      )}
    </div>
  )
}

// ─── 认证 / OAuth URL 透传参数速查（每条均基于代码核实）────────────
interface UrlParamRow {
  param: string
  module: string
  usage: string
  why: string
}

const URL_PARAM_ROWS: UrlParamRow[] = [
  {
    param: '?redirect=<path>',
    module: '登录回跳（认证守卫 + 登录/注册/OAuth/设备）',
    usage: 'toLoginWithRedirect() 写、getRedirectTarget() 读（默认 /dashboard）；登录/注册/auth-callback 成功后跳到它',
    why: '未登录访问受保护页被拦到 /login，登录后回到原本要去的页，而非固定首页',
  },
  {
    param: '?email=<email>',
    module: '两步登录 → 注册 / 忘记密码',
    usage: 'email/check 返回未注册 → /signup?email=；也用于 /forgot-password?email=，目标页预填邮箱',
    why: '用户已输入邮箱，跳转后不用重输，降低流失',
  },
  {
    param: '?invitation=<token>',
    module: '组织邀请 → 注册',
    usage: '被邀请页“免费注册”链接带 token；注册时作为 register 请求体 invitation_token',
    why: '新用户经邀请注册时，注册即加入邀请所属组织，免去注册后再单独接受',
  },
  {
    param: '?aff=<邀请码>',
    module: '推荐计划（专属邀请链接）',
    usage: '推荐计划「我的专属邀请链接」signup?aff=<邀请码>；注册时作为 register 请求体 referral_code',
    why: '被邀请人经此链接注册后，其后续消费的返佣自动归属邀请人（消费分润）',
  },
  {
    param: '/invitations/:token',
    module: '组织邀请接受页',
    usage: 'path 参数，previewInvitation / acceptInvitation 使用；兼容旧 ?token= query',
    why: '标识具体邀请（组织级）。工作区成员是从组织内现有成员直接添加，不经此链接',
  },
  {
    param: '?user_code=<code>',
    module: 'CLI 设备码登录 /device',
    usage: 'CLI 打开 /device?user_code= 展示码；未登录经 toLoginWithRedirect 回带；登录后 deviceApprove(user_code, tenant_id)',
    why: 'OAuth 设备授权流：用户在浏览器确认 CLI 登录并绑定到某租户',
  },
  {
    param: 'OAuth redirect',
    module: '第三方登录（Google / GitHub / 微信）',
    usage: 'oauthAuthorizeUrl(provider, `${origin}/auth/callback?redirect=<目标>`)；回跳 /auth/callback 拉 session 再落地',
    why: 'OAuth 回调在 API 域处理，必须带完整控制台域 URL 才能跳回；走专用回调页保证 session 落地时序',
  },
]

function UrlParamsPanel() {
  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
        <div className="text-sm font-bold text-mg-text-0">认证 / OAuth URL 透传参数</div>
        <div className="text-[11px] text-mg-text-2 mt-0.5">注册 / 登录 / 邀请 / 设备授权各入口需要兼容携带的 URL 参数（均基于代码核实）</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-mg-border bg-mg-bg-1/40">
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">参数</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">业务 · 模块</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">怎么用</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">为什么</th>
            </tr>
          </thead>
          <tbody>
            {URL_PARAM_ROWS.map((row) => (
              <tr key={row.param} className="border-b border-mg-border/40 hover:bg-mg-fill-0/20 transition-colors align-top">
                <td className="py-3 px-5 font-mono text-xs text-brand-base whitespace-nowrap">{row.param}</td>
                <td className="py-3 px-5 text-xs text-mg-text-1 min-w-[160px]">{row.module}</td>
                <td className="py-3 px-5 text-xs text-mg-text-0 leading-relaxed min-w-[260px]">{row.usage}</td>
                <td className="py-3 px-5 text-xs text-mg-text-2 leading-relaxed min-w-[240px]">{row.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 自动注入请求头速查 ──────────────────────────────────────────
interface HeaderRow {
  name: string
  source: string
  scope: string
  purpose: string
}

const HEADER_ROWS: HeaderRow[] = [
  { name: 'X-Tenant-Id', source: 'localStorage 当前活跃租户', scope: '所有请求', purpose: '多租户路由 / 鉴权' },
  { name: 'X-CSRF-Token', source: 'cookie modelgo_csrf', scope: '仅非 GET', purpose: '写操作防护，40302 自动刷新后重试' },
  { name: 'Accept-Language', source: 'zh-CN / en-US（按 html lang）', scope: '所有请求', purpose: '后端内容本地化' },
  { name: 'X-Origin', source: 'modelgo.com / modelgo.ai', scope: '所有请求', purpose: '双端品牌 / 区域识别' },
  { name: 'X-App-Version', source: 'package.json 版本号', scope: '所有请求', purpose: '前端版本上报' },
  { name: 'traceparent', source: 'W3C 链路追踪 ID', scope: '所有请求', purpose: 'OpenTelemetry 分布式追踪' },
  { name: 'credentials: include', source: 'session / CSRF cookie', scope: '所有请求', purpose: '跨子域携带凭证' },
]

function HeadersPanel() {
  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
        <div className="text-sm font-bold text-mg-text-0">自动注入请求头</div>
        <div className="text-[11px] text-mg-text-2 mt-0.5">request-headers.ts 在 beforeRequest 钩子统一注入，业务代码无需手动携带</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-mg-border bg-mg-bg-1/40">
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">请求头</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">值来源</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">范围</th>
              <th className="py-2.5 px-5 font-bold text-mg-text-2 text-[11px] uppercase tracking-wider">作用</th>
            </tr>
          </thead>
          <tbody>
            {HEADER_ROWS.map((row) => (
              <tr key={row.name} className="border-b border-mg-border/40 hover:bg-mg-fill-0/20 transition-colors align-top">
                <td className="py-3 px-5 font-mono text-xs text-brand-base whitespace-nowrap">{row.name}</td>
                <td className="py-3 px-5 text-xs text-mg-text-1">{row.source}</td>
                <td className="py-3 px-5 text-xs text-mg-text-2 whitespace-nowrap">{row.scope}</td>
                <td className="py-3 px-5 text-xs text-mg-text-0 leading-relaxed">{row.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PlatformConfigPage() {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  const endpoints: EndpointDef[] = [
    {
      group: 'Auth',
      label: t('platformConfig.endpoints.session'),
      method: 'GET',
      path: '/api/v1/auth/session',
      call: getSession,
    },
    {
      group: 'Platform',
      label: t('platformConfig.endpoints.platformConfig'),
      method: 'GET',
      path: '/api/v1/platform-config',
      call: getPlatformConfig,
    },
    {
      group: 'Tenant',
      label: t('platformConfig.endpoints.tenants'),
      method: 'GET',
      path: '/api/v1/tenants',
      call: listTenants,
    },
    {
      group: 'Workspace',
      label: t('platformConfig.endpoints.workspaces'),
      method: 'GET',
      path: '/api/v1/workspaces',
      call: listWorkspaces,
    },
    ...(activeWorkspaceId ? [{
      group: 'API Keys',
      label: t('platformConfig.endpoints.apiKeys'),
      method: 'GET' as const,
      path: `/api/v1/workspaces/${activeWorkspaceId}/api-keys`,
      call: () => listApiKeys(activeWorkspaceId),
    }] : []),
    {
      group: 'Catalog',
      label: t('platformConfig.endpoints.models'),
      method: 'GET',
      path: '/api/v1/catalog/models',
      call: () => listModels({ limit: 10 }),
    },
    {
      group: 'Catalog',
      label: t('platformConfig.endpoints.modelTags'),
      method: 'GET',
      path: '/api/v1/catalog/model-tags',
      call: listModelTags,
    },
    ...(activeTenantId ? [
      {
        group: 'Referral',
        label: '推荐计划总览',
        method: 'GET' as const,
        path: `/api/v1/tenants/${activeTenantId}/referral/overview`,
        call: () => getReferralOverview(activeTenantId),
      },
      {
        group: 'Referral',
        label: '被邀请人列表',
        method: 'GET' as const,
        path: `/api/v1/tenants/${activeTenantId}/referral/invitees`,
        call: () => listReferralInvitees(activeTenantId),
      },
      {
        group: 'Referral',
        label: '奖励记录',
        method: 'GET' as const,
        path: `/api/v1/tenants/${activeTenantId}/referral/reward-records`,
        call: () => listRewardRecords(activeTenantId),
      },
      {
        group: 'Referral',
        label: '提现记录',
        method: 'GET' as const,
        path: `/api/v1/tenants/${activeTenantId}/referral/withdrawals`,
        call: () => listWithdrawals(activeTenantId),
      },
    ] : []),
  ]

  const { states, call } = useEndpointState()

  const groups = [...new Set(endpoints.map((e) => e.group))]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">
            {t('platformConfig.title')}
          </h1>
          <p className="text-sm text-mg-text-1 mt-1.5">
            {t('platformConfig.desc')}
          </p>
        </div>
        <Badge variant="warning" className="uppercase font-bold tracking-wide text-[10px] select-none h-6 px-2.5">
          DEV ONLY
        </Badge>
      </div>

        <Tabs defaultValue="endpoints">
          <TabsList>
            <TabsTrigger value="endpoints">{t('platformConfig.tab.endpoints')}</TabsTrigger>
            <TabsTrigger value="public-routes">公共路由</TabsTrigger>
            <TabsTrigger value="menus-sync">菜单同步</TabsTrigger>
            <TabsTrigger value="url-params">回跳参数</TabsTrigger>
            <TabsTrigger value="headers">请求头</TabsTrigger>
          </TabsList>

        <TabsContent value="endpoints">
          <div className="space-y-6 pt-2">
            <CustomRequestPanel />
            {groups.map((group) => (
              <div key={group} className="space-y-3">
                <div className="text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">
                  {group}
                </div>
                <div className="space-y-3">
                  {endpoints.filter((e) => e.group === group).map((def) => {
                    const key = def.path
                    return (
                      <EndpointCard
                        key={key}
                        def={def}
                        state={states[key]}
                        onCall={() => call(key, def.call)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="public-routes">
          <div className="space-y-3 pt-2">
            <p className="text-xs text-mg-text-2">无需登录即可访问的页面路由，点击复制完整 URL</p>
            {([
              { path: '/login', desc: '邮箱密码登录' },
              { path: '/signup', desc: '新用户注册' },
              { path: '/forgot-password', desc: '忘记密码（发送重置邮件）' },
              { path: '/reset-password?token=xxx', desc: '重置密码（邮件链接带 token）' },
              { path: '/auth/callback?redirect=/dashboard', desc: 'OAuth 回调（GitHub/Google/WeChat）' },
              { path: '/invitations', desc: '邀请列表' },
              { path: '/invitations/:token', desc: '邀请详情（链接带 token）' },
              { path: '/device', desc: 'CLI 设备码授权' },
            ] as const).map((r) => {
              const full = `${window.location.origin}${r.path}`
              return (
                <div
                  key={r.path}
                  className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border px-5 py-3 flex items-center gap-4 cursor-pointer hover:border-brand-base/30 transition-colors"
                  onClick={() => { navigator.clipboard.writeText(full); appToast.success(`已复制 ${r.path}`) }}
                >
                  <code className="text-xs font-mono text-brand-base shrink-0 select-all">{r.path}</code>
                  <span className="text-xs text-mg-text-2">—</span>
                  <span className="text-xs text-mg-text-1">{r.desc}</span>
                  <span className="ml-auto text-[10px] text-mg-text-2 shrink-0">点击复制</span>
                </div>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="menus-sync">
          <MenusSyncPanel />
        </TabsContent>

        <TabsContent value="url-params">
          <div className="space-y-4 pt-2">
            <UrlParamsPanel />
          </div>
        </TabsContent>

        <TabsContent value="headers">
          <div className="space-y-4 pt-2">
            <HeadersPanel />
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}
