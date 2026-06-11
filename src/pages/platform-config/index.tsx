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
          <TabsTrigger value="endpoints">{t('platformConfig.tab.endpoints')}</TabsTrigger>
          <TabsTrigger value="public-routes">公共路由</TabsTrigger>
          <TabsTrigger value="menus-sync">菜单同步</TabsTrigger>
          <TabsTrigger value="url-params">回跳参数</TabsTrigger>
          <TabsTrigger value="headers">请求头</TabsTrigger>
          <TabsTrigger value="requirements">我的问题</TabsTrigger>
          <TabsTrigger value="swagger">Swagger</TabsTrigger>
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
          </div>
        </TabsContent>

        <TabsContent value="public-routes">
          <div className="space-y-3 pt-2">
            <p className="text-xs text-mg-text-2">无需登录即可访问的页面路由，点击复制完整 URL</p>
            {PUBLIC_ROUTES.map((r) => {
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

        <TabsContent value="requirements">
          <RequirementsPanel />
        </TabsContent>

        <TabsContent value="swagger">
          <div className="pt-2">
            <SwaggerPanel />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
