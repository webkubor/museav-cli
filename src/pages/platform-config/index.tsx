import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/store/auth'
import { getPlatformConfig } from '@/services/platform'
import { getSession } from '@/services/auth'
import { listTenants } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import { listModels, listModelTags } from '@/services/catalog'
import { listApiKeys } from '@/services/api-keys'

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
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20' 
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
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
        <div className="relative bg-slate-950">
          <div className="absolute top-3 right-3 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
            200 OK
          </div>
          <pre className="m-0 p-5 text-xs font-mono text-slate-300 overflow-x-auto max-h-[360px] leading-relaxed shadow-inner select-all">
            {JSON.stringify(state.data, null, 2)}
          </pre>
        </div>
      )}

      {state?.status === 'error' && (
        <div className="px-5 py-3.5 bg-rose-500/5 border-t border-rose-500/10 flex items-center gap-3">
          <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
            ERROR
          </span>
          <span className="text-xs font-mono text-rose-500 break-all">{state.error}</span>
        </div>
      )}
    </div>
  )
}

function PermissionPanel() {
  const { t } = useTranslation()

  const PERM_SECTIONS = [
    {
      titleKey: 'platformConfig.perm.tenantType',
      color: 'text-violet-500 dark:text-violet-400',
      colorBg: 'bg-violet-500/10 border-violet-500/20',
      borderColor: 'border-violet-500/10',
      rows: [
        { label: 'personal', descKey: 'platformConfig.perm.personal.desc', perms: ['platformConfig.perm.personal.perm1', 'platformConfig.perm.personal.perm2', 'platformConfig.perm.personal.perm3'] },
        { label: 'enterprise', descKey: 'platformConfig.perm.enterprise.desc', perms: ['platformConfig.perm.enterprise.perm1', 'platformConfig.perm.enterprise.perm2', 'platformConfig.perm.enterprise.perm3'] },
      ],
    },
    {
      titleKey: 'platformConfig.perm.tenantRole',
      color: 'text-sky-500 dark:text-sky-400',
      colorBg: 'bg-sky-500/10 border-sky-500/20',
      borderColor: 'border-sky-500/10',
      rows: [
        { label: 'tenant_owner', descKey: 'platformConfig.perm.tenantOwner.desc', perms: ['platformConfig.perm.tenantOwner.perm1', 'platformConfig.perm.tenantOwner.perm2', 'platformConfig.perm.tenantOwner.perm3', 'platformConfig.perm.tenantOwner.perm4', 'platformConfig.perm.tenantOwner.perm5'] },
        { label: 'tenant_admin', descKey: 'platformConfig.perm.tenantAdmin.desc', perms: ['platformConfig.perm.tenantAdmin.perm1', 'platformConfig.perm.tenantAdmin.perm2', 'platformConfig.perm.tenantAdmin.perm3', 'platformConfig.perm.tenantAdmin.perm4', 'platformConfig.perm.tenantAdmin.perm5'] },
        { label: 'tenant_member', descKey: 'platformConfig.perm.tenantMember.desc', perms: ['platformConfig.perm.tenantMember.perm1', 'platformConfig.perm.tenantMember.perm2', 'platformConfig.perm.tenantMember.perm3', 'platformConfig.perm.tenantMember.perm4'] },
      ],
    },
    {
      titleKey: 'platformConfig.perm.wsRole',
      color: 'text-emerald-500 dark:text-emerald-400',
      colorBg: 'bg-emerald-500/10 border-emerald-500/20',
      borderColor: 'border-emerald-500/10',
      rows: [
        { label: 'ws_owner', descKey: 'platformConfig.perm.wsOwner.desc', perms: ['platformConfig.perm.wsOwner.perm1', 'platformConfig.perm.wsOwner.perm2'] },
        { label: 'ws_admin', descKey: 'platformConfig.perm.wsAdmin.desc', perms: ['platformConfig.perm.wsAdmin.perm1', 'platformConfig.perm.wsAdmin.perm2'] },
        { label: 'ws_member', descKey: 'platformConfig.perm.wsMember.desc', perms: ['platformConfig.perm.wsMember.perm1', 'platformConfig.perm.wsMember.perm2'] },
      ],
    },
  ]

  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden mb-6 shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center">
        <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">
          {t('platformConfig.permPanel.title')}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-mg-border">
        {PERM_SECTIONS.map((section) => (
          <div key={section.titleKey} className="p-5 flex flex-col gap-4">
            <div className={`text-[11px] font-bold tracking-wider ${section.color}`}>
              {t(section.titleKey)}
            </div>
            <div className="space-y-4">
              {section.rows.map((row) => (
                <div key={row.label} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${section.color} ${section.colorBg}`}>
                      {row.label}
                    </code>
                    <span className="text-xs text-mg-text-2">{t(row.descKey)}</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    {row.perms.map((p) => (
                      <li key={p} className="text-xs text-mg-text-1 leading-relaxed">{t(p)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ModuleComparisonPanel() {
  const { t } = useTranslation()

  const MATCHED_MODULES = [
    { fe: '概览 (Dashboard)', api: 'overview' },
    { fe: '模型中心 (Models: Explore, Compare, Chat)', api: 'catalog / agent' },
    { fe: '账单/计费 (Billing)', api: 'credits / transaction' },
    { fe: '用量统计 (Usage)', api: 'usage' },
    { fe: '调用日志 (Logs)', api: 'logs' },
    { fe: '可观测性 (Observability)', api: 'observability' },
    { fe: '安全护栏 (Guardrails)', api: 'guardrail' },
    { fe: 'API Keys', api: 'apikey' },
    { fe: '组织管理 (Organization)', api: 'tenant / organization' },
    { fe: '工作区管理 (Workspace)', api: 'workspace' },
    { fe: '成员邀请 (Invitations)', api: 'invitation' },
    { fe: '账号设置/偏好 (Account/Preferences)', api: 'account / preference' },
    { fe: '认证/鉴权 (Auth)', api: 'auth' },
    { fe: '接口调试 (Platform Config)', api: 'platform' },
  ]

  const EXTRA_IN_API = [
    { name: 'docs', desc: '文档站 API (Console 内暂无独立页面)' },
    { name: 'health', desc: '健康检查 (系统内部使用)' },
  ]

  const EXTRA_IN_FRONTEND = [
    { name: 'api-playground', desc: '交互式接口测试工具' },
    { name: 'chat-test', desc: '对话测试工具 (基于 agent API)' },
    { name: 'device', desc: 'CLI 设备流授权页面 (基于 auth API)' },
  ]

  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden mb-6 shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">
          {t('platformConfig.moduleCompare.title')}
        </span>
        <Badge variant="outline" className="text-[10px] opacity-70">
          v1.2 Matcher
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-mg-border">
        {/* 已对齐模块 */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
            <span className="text-xs font-bold text-mg-text-0">{t('platformConfig.moduleCompare.matched')}</span>
            <span className="text-[10px] text-mg-text-2 font-normal italic">
              ({t('platformConfig.moduleCompare.matchedDesc')})
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {MATCHED_MODULES.map((m) => (
              <div key={m.fe} className="flex flex-col gap-0.5 pb-2 border-b border-mg-border/30 last:border-0 sm:last:border-b">
                <span className="text-[11px] font-medium text-mg-text-1 truncate">{m.fe}</span>
                <code className="text-[9px] font-mono text-brand-base/80 uppercase tracking-tight">
                  {m.api}
                </code>
              </div>
            ))}
          </div>
        </div>

        {/* 差异对比 */}
        <div className="p-0 divide-y divide-mg-border">
          {/* API 多出 */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-rose-500">
              <div className="w-1.5 h-4 bg-rose-500 rounded-full" />
              <span className="text-xs font-bold">{t('platformConfig.moduleCompare.extraInApi')}</span>
            </div>
            <div className="space-y-2">
              {EXTRA_IN_API.map((m) => (
                <div key={m.name} className="flex items-center gap-3">
                  <code className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/10">
                    {m.name}
                  </code>
                  <span className="text-[11px] text-mg-text-2">{m.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 前端多出 */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-blue-500">
              <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
              <span className="text-xs font-bold">{t('platformConfig.moduleCompare.extraInFrontend')}</span>
            </div>
            <div className="space-y-2">
              {EXTRA_IN_FRONTEND.map((m) => (
                <div key={m.name} className="flex items-center gap-3">
                  <code className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/10">
                    {m.name}
                  </code>
                  <span className="text-[11px] text-mg-text-2">{m.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlatformConfigPage() {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

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
  ]

  const { states, call } = useEndpointState()

  const groups = [...new Set(endpoints.map((e) => e.group))]

  return (
    <div className="space-y-6">
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

      <ModuleComparisonPanel />

      <PermissionPanel />

      {groups.map((group) => (
        <div key={group} className="space-y-3">
          <div className="text-[11px] font-bold text-mg-text-2 tracking-widest uppercase mb-2">
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
  )
}
