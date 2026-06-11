import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { useAuthStore } from '@/store/auth'
import { getPlatformConfig } from '@/services/platform'
import { getSession } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import { listModels, listModelTags } from '@/services/catalog'
import { listApiKeys } from '@/services/api-keys'
import { getReferralOverview, listReferralInvitees, listRewardRecords, listWithdrawals } from '@/services/referral'
import { appToast } from '@/lib/app-toast'
import { useCopy } from '@/hooks/use-copy'
import { useEndpointState } from './use-endpoint-state'
import { EndpointCard } from './EndpointCard'
import { CustomRequestPanel } from './CustomRequestPanel'
import { MenusSyncPanel } from './MenusSyncPanel'
import { UrlParamsPanel } from './UrlParamsPanel'
import { HeadersPanel } from './HeadersPanel'
import { SwaggerPanel } from './SwaggerPanel'
import { RequirementsPanel } from './RequirementsPanel'
import type { EndpointDef } from './types'

const PUBLIC_ROUTES = [
  { path: '/login', desc: '邮箱密码登录' },
  { path: '/signup', desc: '新用户注册' },
  { path: '/forgot-password', desc: '忘记密码（发送重置邮件）' },
  { path: '/reset-password?token=xxx', desc: '重置密码（邮件链接带 token）' },
  { path: '/auth/callback?redirect=/dashboard', desc: 'OAuth 回调（GitHub/Google/WeChat）' },
  { path: '/invitations', desc: '邀请列表' },
  { path: '/invitations/:token', desc: '邀请详情（链接带 token）' },
  { path: '/device', desc: 'CLI 设备码授权' },
] as const

export default function PlatformConfigPage() {
  const { t } = useTranslation()
  const { copy } = useCopy()
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
      call: () => listModels({ page_size: 10 }),
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
        <Badge variant="warning" size="sm" className="uppercase tracking-wide select-none">
          DEV ONLY
        </Badge>
      </div>

      <Tabs defaultValue="endpoints">
        <TabsList>
          <TabsTrigger value="endpoints">接口 / Swagger</TabsTrigger>
          <TabsTrigger value="routes-menus">路由 / 菜单</TabsTrigger>
          <TabsTrigger value="url-params">回跳参数</TabsTrigger>
          <TabsTrigger value="headers">请求头</TabsTrigger>
          <TabsTrigger value="requirements">我的问题</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints">
          <div className="space-y-8 pt-2">
            <section className="space-y-6">
              <div>
                <h2 className="text-base font-bold text-mg-text-0">接口调试</h2>
                <p className="mt-1 text-xs text-mg-text-2">本地调用常用接口，查看真实返回和错误日志。</p>
              </div>
              <CustomRequestPanel />
              {groups.map((group) => (
                <div key={group} className="space-y-3">
                  <div className="text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">
                    {group}
                  </div>
                  <div className="space-y-3">
                    {endpoints.filter((e) => e.group === group).map((def) => (
                      <EndpointCard
                        key={def.path}
                        def={def}
                        state={states[def.path]}
                        onCall={() => call(def.path, def.call)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-base font-bold text-mg-text-0">Swagger</h2>
                <p className="mt-1 text-xs text-mg-text-2">同一个接口入口里检索 Swagger 契约，避免在多个 tab 间来回切换。</p>
              </div>
              <SwaggerPanel />
            </section>
          </div>
        </TabsContent>

        <TabsContent value="routes-menus">
          <div className="space-y-8 pt-2">
            <section className="space-y-3">
              <div>
                <h2 className="text-base font-bold text-mg-text-0">公共路由</h2>
                <p className="mt-1 text-xs text-mg-text-2">无需登录即可访问的页面路由，点击复制完整 URL。</p>
              </div>
              {PUBLIC_ROUTES.map((r) => {
                const full = `${window.location.origin}${r.path}`
                return (
                  <div
                    key={r.path}
                    className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border px-5 py-3 flex items-center gap-4 cursor-pointer hover:border-brand-base/30 transition-colors"
                    onClick={async () => { if (await copy(full)) appToast.success(`已复制 ${r.path}`) }}
                  >
                    <code className="text-xs font-mono text-brand-base shrink-0 select-all">{r.path}</code>
                    <span className="text-xs text-mg-text-2">—</span>
                    <span className="text-xs text-mg-text-1">{r.desc}</span>
                    <span className="ml-auto text-[10px] text-mg-text-2 shrink-0">点击复制</span>
                  </div>
                )
              })}
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-base font-bold text-mg-text-0">菜单同步</h2>
                <p className="mt-1 text-xs text-mg-text-2">查看当前菜单声明并同步到后端权限菜单。</p>
              </div>
              <MenusSyncPanel />
            </section>
          </div>
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

        <TabsContent value="requirements">
          <RequirementsPanel />
        </TabsContent>

      </Tabs>
    </div>
  )
}
