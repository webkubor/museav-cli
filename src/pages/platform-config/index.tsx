import { useState } from 'react'
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
  return (
    <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-semi-color-border overflow-hidden mb-3">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-semi-color-border/40">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono shrink-0 select-none ${
          def.method === 'GET' 
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20' 
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
        }`}>
          {def.method}
        </span>
        <code className="text-xs font-mono text-semi-color-text-0 flex-1 truncate select-all">
          {def.path}
        </code>
        <span className="text-xs text-semi-color-text-2 shrink-0 font-medium">{def.label}</span>
        {state?.duration != null && (
          <span className="text-[10px] font-mono text-semi-color-text-2 shrink-0">
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
          {state?.status === 'success' ? '重新调用' : '调用'}
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

const PERM_SECTIONS = [
  {
    title: '租户类型 (Tenant Type)',
    color: 'text-violet-500 dark:text-violet-400',
    colorBg: 'bg-violet-500/10 border-violet-500/20',
    borderColor: 'border-violet-500/10',
    rows: [
      { label: 'personal', desc: '个人账户', perms: ['侧边栏无邀请管理', 'Header 无工作区管理入口', 'Header 无组织设置'] },
      { label: 'enterprise', desc: '企业/组织', perms: ['侧边栏显示邀请管理', 'Header 显示工作区管理', 'Header 显示组织设置'] },
    ],
  },
  {
    title: '组织角色 (Tenant Role)',
    color: 'text-sky-500 dark:text-sky-400',
    colorBg: 'bg-sky-500/10 border-sky-500/20',
    borderColor: 'border-sky-500/10',
    rows: [
      { label: 'tenant_owner', desc: '拥有者', perms: ['查看账户余额', '邀请成员 Tab', '域名配置 Tab', '修改成员角色', '移除成员'] },
      { label: 'tenant_admin', desc: '管理员', perms: ['查看账户余额', '邀请成员 Tab', '域名配置 Tab', '修改成员角色', '移除成员'] },
      { label: 'tenant_member', desc: '普通成员', perms: ['余额不可见 (null)', '无邀请成员 Tab', '无域名配置 Tab', '无角色/移除操作'] },
    ],
  },
  {
    title: '工作区角色 (Workspace Role)',
    color: 'text-emerald-500 dark:text-emerald-400',
    colorBg: 'bg-emerald-500/10 border-emerald-500/20',
    borderColor: 'border-emerald-500/10',
    rows: [
      { label: 'ws_owner', desc: '拥有者', perms: ['可撤销任意邀请', '可修改任意成员角色'] },
      { label: 'ws_admin', desc: '管理员', perms: ['可撤销任意邀请', '可修改任意成员角色'] },
      { label: 'ws_member', desc: '普通成员', perms: ['仅撤销自己发出的邀请', '不可修改成员角色'] },
    ],
  },
]

function PermissionPanel() {
  return (
    <div className="card-shadow-adaptive border border-semi-color-border bg-card-bg rounded-xl overflow-hidden mb-6 shadow-sm">
      <div className="px-5 py-3 border-b border-semi-color-border bg-semi-color-bg-1/40 flex items-center">
        <span className="text-[11px] font-bold tracking-widest text-semi-color-text-2 uppercase">
          权限速查
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-semi-color-border">
        {PERM_SECTIONS.map((section) => (
          <div key={section.title} className="p-5 flex flex-col gap-4">
            <div className={`text-[11px] font-bold tracking-wider ${section.color}`}>
              {section.title}
            </div>
            <div className="space-y-4">
              {section.rows.map((row) => (
                <div key={row.label} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${section.color} ${section.colorBg}`}>
                      {row.label}
                    </code>
                    <span className="text-xs text-semi-color-text-2">{row.desc}</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    {row.perms.map((p) => (
                      <li key={p} className="text-xs text-semi-color-text-1 leading-relaxed">{p}</li>
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

export default function PlatformConfigPage() {
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const endpoints: EndpointDef[] = [
    {
      group: 'Auth',
      label: '当前会话',
      method: 'GET',
      path: '/api/v1/auth/session',
      call: getSession,
    },
    {
      group: 'Platform',
      label: '平台配置',
      method: 'GET',
      path: '/api/v1/platform-config',
      call: getPlatformConfig,
    },
    {
      group: 'Tenant',
      label: '我的组织列表',
      method: 'GET',
      path: '/api/v1/tenants',
      call: listTenants,
    },
    {
      group: 'Workspace',
      label: '工作区列表',
      method: 'GET',
      path: '/api/v1/workspaces',
      call: listWorkspaces,
    },
    ...(activeWorkspaceId ? [{
      group: 'API Keys',
      label: 'API Key 列表',
      method: 'GET' as const,
      path: `/api/v1/workspaces/${activeWorkspaceId}/api-keys`,
      call: () => listApiKeys(activeWorkspaceId),
    }] : []),
    {
      group: 'Catalog',
      label: '模型目录',
      method: 'GET',
      path: '/api/v1/catalog/models',
      call: () => listModels({ limit: 10 }),
    },
    {
      group: 'Catalog',
      label: '模型标签',
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
          <h1 className="text-2xl font-bold tracking-tight text-semi-color-text-0">
            接口调试
          </h1>
          <p className="text-sm text-semi-color-text-1 mt-1.5">
            点击「调用」发起请求，查看接口实际返回的数据。
          </p>
        </div>
        <Badge variant="warning" className="uppercase font-bold tracking-wide text-[10px] select-none h-6 px-2.5">
          DEV ONLY
        </Badge>
      </div>

      <PermissionPanel />

      {groups.map((group) => (
        <div key={group} className="space-y-3">
          <div className="text-[11px] font-bold text-semi-color-text-2 tracking-widest uppercase mb-2">
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
