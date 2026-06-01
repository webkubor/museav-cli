import { useState } from 'react'
import { LuSettings, LuCheck, LuDollarSign, LuBox, LuKey, LuUsers } from 'react-icons/lu'
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
import { PERMS } from '@/config/permissions'
import type { Permission } from '@/config/permissions'
import { TENANT_PERM_MATRIX, WS_PERM_MATRIX } from '@/config/permissionMatrix'

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
        <div className="relative bg-slate-950 overflow-hidden">
          <div className="absolute top-3 right-3 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
            200 OK
          </div>
          <pre className="m-0 p-5 text-xs font-mono text-slate-300 overflow-auto max-h-[360px] leading-relaxed shadow-inner select-all w-full min-w-0">
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

function PermTagList({ perms, highlight }: { perms: Permission[]; highlight?: Permission[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {perms.map((p) => {
        const isDomesticOnly = highlight?.includes(p)
        return (
          <code
            key={p}
            className={[
              'text-[10px] font-mono px-1.5 py-0.5 rounded border',
              isDomesticOnly
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-mg-bg-1 border-mg-border text-mg-text-1',
            ].join(' ')}
          >
            {p}
          </code>
        )
      })}
    </div>
  )
}

interface MenuPermRow {
  key: string
  label: string
  scope: 'tenant' | 'workspace' | 'settings'
  menuPerm: Permission | null
  actions: Permission[]
}

const MENU_PERM_MAP: MenuPermRow[] = [
  { key: 'dashboard',        label: '仪表盘',    scope: 'tenant',    menuPerm: PERMS.DASHBOARD_VIEW,     actions: [] },
  { key: 'models/explore',   label: '模型探索',   scope: 'tenant',    menuPerm: PERMS.MODELS_VIEW,        actions: [] },
  { key: 'models/compare',   label: '模型对比',   scope: 'tenant',    menuPerm: PERMS.MODELS_VIEW,        actions: [] },
  { key: 'models/chat',      label: '模型对话',   scope: 'tenant',    menuPerm: PERMS.MODELS_VIEW,        actions: [] },
  { key: 'models/history',   label: '历史记录',   scope: 'tenant',    menuPerm: PERMS.MODELS_VIEW,        actions: [] },
  { key: 'usage',            label: '用量分析',   scope: 'tenant',    menuPerm: PERMS.ANALYTICS_VIEW,     actions: [] },
  { key: 'logs',             label: '调用日志',   scope: 'tenant',    menuPerm: PERMS.LOGS_VIEW,          actions: [] },
  { key: 'billing',          label: '账单',      scope: 'tenant',    menuPerm: PERMS.BILLING_VIEW,       actions: [PERMS.BILLING_INVOICE_VIEW, PERMS.BILLING_RECHARGE_CREATE, PERMS.BILLING_RECHARGE_CANCEL] },
  { key: 'api-keys',         label: 'API Keys',  scope: 'workspace', menuPerm: PERMS.API_KEYS_VIEW,      actions: [PERMS.API_KEYS_CREATE, PERMS.API_KEYS_REVOKE] },
  { key: 'guardrails',       label: '配额管理 / Guardrails',  scope: 'workspace', menuPerm: PERMS.GUARDRAILS_VIEW,    actions: [PERMS.GUARDRAILS_CREATE, PERMS.GUARDRAILS_EDIT, PERMS.GUARDRAILS_DELETE, PERMS.GUARDRAILS_ASSIGNMENT_EDIT, PERMS.GUARDRAILS_BUDGET_EDIT] },
  { key: 'observability',    label: '可观测性 / Observability', scope: 'workspace', menuPerm: PERMS.OBSERVABILITY_VIEW, actions: [PERMS.OBSERVABILITY_LOGGING_EDIT, PERMS.OBSERVABILITY_FORWARD_MANAGE] },
  { key: 'invitations-mgmt', label: '邀请管理 / Invitations',   scope: 'workspace', menuPerm: PERMS.INVITATIONS_VIEW,   actions: [PERMS.INVITATIONS_MANAGE] },
  { key: 'settings/org',     label: '企业管理 / Organization',  scope: 'settings',  menuPerm: null,                     actions: [PERMS.ORG_SETTINGS_EDIT, PERMS.ORG_MEMBERS_MANAGE, PERMS.ORG_INVITE_MANAGE] },
]

const SCOPE_STYLE: Record<string, { text: string; bg: string }> = {
  tenant:    { text: 'text-indigo-500', bg: 'bg-indigo-500/10 border-indigo-500/20' },
  workspace: { text: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  settings:  { text: 'text-slate-500', bg: 'bg-slate-500/10 border-slate-500/20' },
}

function MenuPermissionMap() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const header = '菜单 key\t菜单名\t归属\t菜单权限 ID\t页面/操作权限 ID'
    const rows = MENU_PERM_MAP.map((r) =>
      [r.key, r.label, r.scope, r.menuPerm ?? '—', r.actions.join(', ') || '—'].join('\t')
    )
    navigator.clipboard.writeText([header, ...rows].join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">菜单 — 权限 ID 映射表</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[11px] font-bold px-3 py-1 rounded-lg border border-mg-border text-mg-text-1 hover:border-brand-base hover:text-brand-base transition-colors duration-150"
        >
          {copied ? '✓ 已复制' : '复制为表格'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-mg-border bg-mg-bg-1/20">
              <th className="px-5 py-2.5 text-[10px] font-bold text-mg-text-2 uppercase tracking-wider">菜单 Key</th>
              <th className="px-5 py-2.5 text-[10px] font-bold text-mg-text-2 uppercase tracking-wider">菜单名</th>
              <th className="px-5 py-2.5 text-[10px] font-bold text-mg-text-2 uppercase tracking-wider">归属</th>
              <th className="px-5 py-2.5 text-[10px] font-bold text-mg-text-2 uppercase tracking-wider">菜单权限</th>
              <th className="px-5 py-2.5 text-[10px] font-bold text-mg-text-2 uppercase tracking-wider">页面/操作权限</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mg-border/50">
            {MENU_PERM_MAP.map((row) => {
              const scope = SCOPE_STYLE[row.scope]
              return (
                <tr key={row.key} className="hover:bg-mg-bg-1/30 transition-colors">
                  <td className="px-5 py-2.5">
                    <code className="text-[11px] font-mono font-bold text-mg-text-0">{row.key}</code>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-mg-text-1">{row.label}</td>
                  <td className="px-5 py-2.5">
                    <code className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${scope.text} ${scope.bg}`}>
                      {row.scope}
                    </code>
                  </td>
                  <td className="px-5 py-2.5">
                    {row.menuPerm
                      ? <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-mg-bg-1 border border-mg-border text-mg-text-1">{row.menuPerm}</code>
                      : <span className="text-[10px] text-mg-text-2">—</span>
                    }
                  </td>
                  <td className="px-5 py-2.5">
                    {row.actions.length > 0
                      ? <div className="flex flex-wrap gap-1">{row.actions.map((a) => (
                          <code key={a} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">{a}</code>
                        ))}</div>
                      : <span className="text-[10px] text-mg-text-2">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PermissionPanel() {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const MENU_PERMS: Permission[] = [
    PERMS.DASHBOARD_VIEW, PERMS.MODELS_VIEW, PERMS.ANALYTICS_VIEW, PERMS.LOGS_VIEW,
    PERMS.BILLING_VIEW, PERMS.API_KEYS_VIEW, PERMS.GUARDRAILS_VIEW,
    PERMS.OBSERVABILITY_VIEW, PERMS.INVITATIONS_VIEW,
  ]
  const PAGE_PERMS: Permission[] = [
    PERMS.BILLING_INVOICE_VIEW, PERMS.BILLING_RECHARGE_CREATE, PERMS.BILLING_RECHARGE_CANCEL,
  ]
  const ACTION_PERMS: Permission[] = [
    PERMS.API_KEYS_CREATE, PERMS.API_KEYS_REVOKE,
    PERMS.GUARDRAILS_CREATE, PERMS.GUARDRAILS_EDIT, PERMS.GUARDRAILS_DELETE,
    PERMS.GUARDRAILS_ASSIGNMENT_EDIT, PERMS.GUARDRAILS_BUDGET_EDIT,
    PERMS.OBSERVABILITY_LOGGING_EDIT, PERMS.OBSERVABILITY_FORWARD_MANAGE,
    PERMS.INVITATIONS_MANAGE,
    PERMS.ORG_SETTINGS_EDIT, PERMS.ORG_MEMBERS_MANAGE, PERMS.ORG_INVITE_MANAGE,
  ]

  const TENANT_ROLES = ['tenant_owner', 'tenant_admin', 'tenant_member'] as const
  const WS_ROLES = ['ws_owner', 'ws_admin', 'ws_member'] as const

  function buildCopyText() {
    const lines: string[] = ['# ModelGo 权限清单', '', '## 权限 ID 注册表', '']
    lines.push('### 菜单级')
    MENU_PERMS.forEach((p) => lines.push(`  - ${p}`))
    lines.push('', '### 页面/区块级')
    PAGE_PERMS.forEach((p) => lines.push(`  - ${p}`))
    lines.push('', '### 按钮/操作级')
    ACTION_PERMS.forEach((p) => lines.push(`  - ${p}`))

    lines.push('', '## 组织角色权限矩阵（enterprise）', '')
    TENANT_ROLES.forEach((role) => {
      const d = TENANT_PERM_MATRIX.domestic.enterprise[role]
      const g = TENANT_PERM_MATRIX.global.enterprise[role]
      const shared = d.filter((p) => g.includes(p))
      const domOnly = d.filter((p) => !g.includes(p))
      lines.push(`### ${role}`)
      lines.push(`  共有: ${shared.join(', ')}`)
      if (domOnly.length) lines.push(`  domestic only: ${domOnly.join(', ')}`)
      lines.push('')
    })

    lines.push('## 工作区角色权限矩阵', '')
    WS_ROLES.forEach((role) => {
      lines.push(`### ${role}`)
      lines.push(`  ${WS_PERM_MATRIX[role].join(', ')}`)
      lines.push('')
    })

    lines.push('## 备注')
    lines.push('- personal 租户：owner 获得 billing 权限（国内含 invoice），无 org 管理与邀请管理菜单')
    lines.push('- 最终权限 = 组织角色权限 ∪ 工作区角色权限')
    return lines.join('\n')
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildCopyText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4">
      {/* Permission Registry */}
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">
            {t('platformConfig.permPanel.idList')}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="text-[11px] font-bold px-3 py-1 rounded-lg border border-mg-border text-mg-text-1 hover:border-brand-base hover:text-brand-base transition-colors duration-150"
          >
            {copied ? `✓ ${t('common.copied')}` : t('platformConfig.permPanel.copyBtn')}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-mg-border p-5 gap-5 md:gap-0">
          {([
            { label: t('platformConfig.perm.menuLevel'), perms: MENU_PERMS, color: 'text-violet-500', bg: 'bg-violet-500/10 border-violet-500/20' },
            { label: t('platformConfig.perm.pageLevel'), perms: PAGE_PERMS, color: 'text-sky-500', bg: 'bg-sky-500/10 border-sky-500/20' },
            { label: t('platformConfig.perm.actionLevel'), perms: ACTION_PERMS, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
          ] as const).map(({ label, perms, color, bg }) => (
            <div key={label} className="md:px-5 first:md:pl-0 last:md:pr-0 space-y-3">
              <div className={`text-[11px] font-bold tracking-wider ${color}`}>{label}</div>
              <div className="flex flex-wrap gap-1.5">
                {(perms as readonly Permission[]).map((p) => (
                  <code key={p} className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${bg} ${color}`}>{p}</code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tenant Matrix */}
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center gap-3">
          <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">
            {t('platformConfig.permPanel.tenantMatrix')}
          </span>
          <code className="text-[10px] text-mg-text-2 font-mono opacity-60">enterprise · domestic vs global</code>
        </div>
        <div className="divide-y divide-mg-border">
          {TENANT_ROLES.map((role) => {
            const domestic = TENANT_PERM_MATRIX.domestic.enterprise[role]
            const global   = TENANT_PERM_MATRIX.global.enterprise[role]
            const shared     = domestic.filter((p) => global.includes(p))
            const domOnly    = domestic.filter((p) => !global.includes(p))
            return (
              <div key={role} className="p-5 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3">
                <code className="text-[11px] font-bold font-mono px-2.5 py-1 rounded border bg-sky-500/10 border-sky-500/20 text-sky-500 w-fit h-fit shrink-0">
                  {role}
                </code>
                <div className="space-y-2">
                  <PermTagList perms={shared} />
                  {domOnly.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider shrink-0">domestic only</span>
                      <PermTagList perms={domOnly} highlight={domOnly} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div className="px-5 py-3 bg-mg-bg-1/30">
            <span className="text-[11px] text-mg-text-2">
              {t('platformConfig.permPanel.personalNotice')}
            </span>
          </div>
        </div>
      </div>

      {/* Workspace Matrix */}
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
          <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">
            {t('platformConfig.permPanel.wsMatrix')}
          </span>
        </div>
        <div className="divide-y divide-mg-border">
          {WS_ROLES.map((role) => (
            <div key={role} className="p-5 grid grid-cols-1 md:md:grid-cols-[200px_1fr] gap-3">
              <code className="text-[11px] font-bold font-mono px-2.5 py-1 rounded border bg-emerald-500/10 border-emerald-500/20 text-emerald-500 w-fit h-fit shrink-0">
                {role}
              </code>
              <PermTagList perms={WS_PERM_MATRIX[role]} />
            </div>
          ))}
          <div className="px-5 py-3 bg-mg-bg-1/30">
            <span className="text-[11px] text-mg-text-2">
              {t('platformConfig.permPanel.permLogic')}
            </span>
          </div>
        </div>
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
    { name: 'docs', desc: t('platformConfig.moduleCompare.docsDesc') },
    { name: 'health', desc: t('platformConfig.moduleCompare.healthDesc') },
  ]

  const EXTRA_IN_FRONTEND = [
    { name: 'api-playground', desc: t('platformConfig.moduleCompare.playgroundDesc') },
    { name: 'chat-test', desc: t('platformConfig.moduleCompare.chatTestDesc') },
    { name: 'device', desc: t('platformConfig.moduleCompare.deviceDesc') },
  ]

  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden mb-6 shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">
          {t('platformConfig.moduleCompare.title')}
        </span>
        <Badge variant="outline" className="text-[10px] opacity-70">
          v1.4 Matcher
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

function DetailGapsPanel() {
  const { t } = useTranslation()

  const GAP_ITEMS = [
    {
      key: 'models',
      icon: <LuBox className="w-3.5 h-3.5" />,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
    },
    {
      key: 'organization',
      icon: <LuUsers className="w-3.5 h-3.5" />,
      color: 'text-rose-500',
      bgColor: 'bg-rose-500/10',
    },
    {
      key: 'apiKeys',
      icon: <LuKey className="w-3.5 h-3.5" />,
      color: 'text-sky-500',
      bgColor: 'bg-sky-500/10',
    },
    {
      key: 'guardrail',
      icon: <LuSettings className="w-3.5 h-3.5" />,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      key: 'observability',
      icon: <LuCheck className="w-3.5 h-3.5" />,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
    },
    {
      key: 'billing',
      icon: <LuDollarSign className="w-3.5 h-3.5" />,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
  ]

  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden mb-6 shadow-sm">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
        <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">
          {t('platformConfig.moduleCompare.gaps.title')}
        </span>
      </div>
      <div className="divide-y divide-mg-border">
        {GAP_ITEMS.map((item) => (
          <div key={item.key} className="p-5 flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-1/4 flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg ${item.bgColor} ${item.color} flex items-center justify-center shrink-0`}>
                {item.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-mg-text-0">
                  {t(`platformConfig.moduleCompare.gaps.${item.key}.title`)}
                </span>
                <Badge variant="outline" className="w-fit text-[9px] mt-1 opacity-60">
                  Feature Gap
                </Badge>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-mg-text-2 uppercase tracking-tight">Console UI (Product)</div>
                <p className="text-xs text-mg-text-1 leading-relaxed">
                  {t(`platformConfig.moduleCompare.gaps.${item.key}.ui`)}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-mg-text-2 uppercase tracking-tight">Actual API (Swagger)</div>
                <p className="text-xs text-mg-text-1 leading-relaxed">
                  {t(`platformConfig.moduleCompare.gaps.${item.key}.api`)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
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
        <div className="relative bg-slate-950 overflow-hidden">
          <div className="absolute top-3 right-3 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded z-10">
            OK
          </div>
          <pre className="m-0 p-5 text-xs font-mono text-slate-300 overflow-auto max-h-[400px] w-full min-w-0 leading-relaxed select-all">
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
          <TabsTrigger value="modules">{t('platformConfig.tab.modules')}</TabsTrigger>
          <TabsTrigger value="permissions">{t('platformConfig.tab.permissions')}</TabsTrigger>
          <TabsTrigger value="requirements">{t('platformConfig.tab.requirements')}</TabsTrigger>
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

        <TabsContent value="modules">
          <div className="space-y-6 pt-2">
            <ModuleComparisonPanel />
            <DetailGapsPanel />
          </div>
        </TabsContent>

        <TabsContent value="permissions">
          <div className="space-y-4 pt-2">
            <MenuPermissionMap />
            <PermissionPanel />
          </div>
        </TabsContent>

        <TabsContent value="requirements">
          <div className="pt-2">
            <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm p-8 text-center">
              <h3 className="text-lg font-bold text-mg-text-0 mb-2">需求看板 (Requirement Board)</h3>
              <p className="text-sm text-mg-text-2 mb-6">点击屏幕右侧的悬浮按钮「需求」来管理实时卡片。</p>
              <div className="max-w-md mx-auto bg-mg-bg-1/50 rounded-lg p-4 text-left border border-mg-border/40">
                <div className="text-[11px] font-bold text-mg-text-3 uppercase mb-3">当前核心未完成任务</div>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0 text-[10px]">#66</Badge>
                    <span className="text-xs text-mg-text-1 leading-relaxed">金额输出统一约束小数点精度 (各币种对齐)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0 text-[10px]">#14</Badge>
                    <span className="text-xs text-mg-text-1 leading-relaxed">API Key 支持 Scope (个人/项目/成员) 区分与绑定</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0 text-[10px]">#68</Badge>
                    <span className="text-xs text-mg-text-1 leading-relaxed">护栏详情内支持 API Key 反向绑定规则</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Badge variant="outline" className="shrink-0 text-[10px]">#72945</Badge>
                    <span className="text-xs text-mg-text-1 leading-relaxed">组织 Logo 上传接口补齐与更换功能实现</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
