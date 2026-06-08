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
  { key: 'dashboard',           label: '仪表盘',                    scope: 'tenant',    menuPerm: PERMS.DASHBOARD_VIEW,     actions: [] },
  { key: 'models',              label: '模型',                      scope: 'tenant',    menuPerm: PERMS.MODELS_VIEW,        actions: [] },
  { key: 'models/catalog',      label: '所有模型',                  scope: 'tenant',    menuPerm: PERMS.MODELS_VIEW,        actions: [] },
  { key: 'models/playground',   label: '模型体验 / Playground',     scope: 'tenant',    menuPerm: PERMS.MODELS_VIEW,        actions: [] },
  { key: 'analytics',           label: '分析',                      scope: 'tenant',    menuPerm: PERMS.ANALYTICS_VIEW,     actions: [] },
  { key: 'usage',               label: '用量分析',                  scope: 'tenant',    menuPerm: PERMS.ANALYTICS_VIEW,     actions: [] },
  { key: 'logs',                label: '调用日志',                  scope: 'tenant',    menuPerm: PERMS.LOGS_VIEW,          actions: [] },
  { key: 'billing',             label: '账单',                      scope: 'tenant',    menuPerm: PERMS.BILLING_VIEW,       actions: [PERMS.BILLING_INVOICE_VIEW, PERMS.BILLING_RECHARGE_CREATE, PERMS.BILLING_RECHARGE_CANCEL] },
  { key: 'referral',            label: '推荐有奖 / Referral',       scope: 'tenant',    menuPerm: null,                     actions: [PERMS.REFERRAL_REWARD_TRANSFER, PERMS.REFERRAL_REWARD_WITHDRAW] },
  { key: 'api-keys',            label: 'API Keys',                  scope: 'workspace', menuPerm: PERMS.API_KEYS_VIEW,      actions: [PERMS.API_KEYS_CREATE, PERMS.API_KEYS_REVOKE] },
  { key: 'guardrails',          label: '配额管理 / Guardrails',     scope: 'workspace', menuPerm: PERMS.GUARDRAILS_VIEW,    actions: [PERMS.GUARDRAILS_CREATE, PERMS.GUARDRAILS_EDIT, PERMS.GUARDRAILS_DELETE, PERMS.GUARDRAILS_ASSIGNMENT_EDIT, PERMS.GUARDRAILS_BUDGET_EDIT] },
  { key: 'observability',       label: '可观测性 / Observability',  scope: 'workspace', menuPerm: PERMS.OBSERVABILITY_VIEW, actions: [PERMS.OBSERVABILITY_LOGGING_EDIT, PERMS.OBSERVABILITY_FORWARD_MANAGE] },
  { key: 'settings/workspace',  label: '工作区设置',                scope: 'workspace', menuPerm: null,                     actions: [PERMS.WORKSPACE_RENAME, PERMS.WORKSPACE_DELETE, PERMS.WORKSPACE_MEMBERS_MANAGE] },
  { key: 'settings/org',        label: '企业管理 / Organization',   scope: 'settings',  menuPerm: null,                     actions: [PERMS.ORG_SETTINGS_EDIT, PERMS.ORG_MEMBERS_MANAGE, PERMS.ORG_INVITE_MANAGE] },
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

  // 从 MENU_PERM_MAP 派生，保持单一来源
  const menuPerms = [...new Set(
    MENU_PERM_MAP.map((r) => r.menuPerm).filter((p): p is Permission => p !== null)
  )]
  const actionPerms = MENU_PERM_MAP.flatMap((r) => r.actions)

  const TENANT_ROLES = ['tenant_owner', 'tenant_admin', 'tenant_member'] as const
  const WS_ROLES = ['ws_owner', 'ws_admin', 'ws_member'] as const

  function buildCopyText() {
    const lines: string[] = ['# ModelGo 权限清单', '', '## 权限 ID 注册表', '']
    lines.push('### 菜单级（view）')
    menuPerms.forEach((p) => lines.push(`  - ${p}`))
    lines.push('', '### 操作级（action）')
    actionPerms.forEach((p) => lines.push(`  - ${p}`))

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
    lines.push('- personal 租户：owner 获得 billing 权限（国内含 invoice），无 org 管理菜单')
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
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-mg-border p-5 gap-5 md:gap-0">
          <div className="md:pr-5 space-y-3">
            <div className="text-[11px] font-bold tracking-wider text-violet-500">{t('platformConfig.perm.menuLevel')}</div>
            <div className="flex flex-wrap gap-1.5">
              {menuPerms.map((p) => (
                <code key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/20 text-violet-500">{p}</code>
              ))}
            </div>
          </div>
          <div className="md:pl-5 space-y-3">
            <div className="text-[11px] font-bold tracking-wider text-amber-500">{t('platformConfig.perm.actionLevel')}</div>
            <div className="flex flex-wrap gap-1.5">
              {actionPerms.map((p) => (
                <code key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400">{p}</code>
              ))}
            </div>
          </div>
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

function RoleSettingsPanel() {
  const TENANT_TYPES = [
    { type: 'personal', label: '个人账户', desc: '个人开发者，无企业管理，直接使用所有功能' },
    { type: 'enterprise', label: '企业', desc: '多成员协作，有组织角色和项目角色分层管理' },
  ]

  const ORG_MATRIX = [
    { perm: '查看总览 / 模型广场 / 用量分析 / 日志', owner: true, admin: true, member: true },
    { perm: '查看账单 / 充值 / 取消订单', owner: true, admin: true, member: false },
    { perm: '查看发票（国内）', owner: true, admin: true, member: false },
    { perm: '企业设置（改名 / 上传 Logo）', owner: true, admin: true, member: false },
    { perm: '成员管理（邀请 / 移除 / 改角色）', owner: true, admin: true, member: false },
    { perm: '创建 / 删除项目', owner: true, admin: true, member: false },
    { perm: '转让企业所有权', owner: true, admin: false, member: false },
  ]

  const WS_MATRIX = [
    { perm: '查看 API Keys / 创建 Key', owner: true, admin: true, member: true },
    { perm: '撤销 API Key', owner: true, admin: true, member: false },
    { perm: '查看配额管理', owner: true, admin: true, member: true },
    { perm: '创建 / 编辑 / 删除配额', owner: true, admin: true, member: false },
    { perm: '配额绑定成员 / Key / 预算', owner: true, admin: true, member: false },
    { perm: '查看可观测性', owner: true, admin: true, member: true },
    { perm: '编辑日志 / 转发配置', owner: true, admin: true, member: false },
    { perm: '查看成员管理', owner: true, admin: true, member: true },
    { perm: '分配成员到项目 / 改角色 / 移出', owner: true, admin: true, member: false },
  ]

  const check = (v: boolean) => v
    ? <span className="text-emerald-600 font-bold">✓</span>
    : <span className="text-mg-text-2">—</span>

  return (
    <>
      {/* 租户类型 */}
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
          <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">租户类型</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-mg-border">
          {TENANT_TYPES.map((t) => (
            <div key={t.type} className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <code className="text-[11px] font-bold font-mono px-2 py-0.5 rounded border bg-violet-500/10 border-violet-500/20 text-violet-500">{t.type}</code>
                <span className="text-[13px] font-bold text-mg-text-0">{t.label}</span>
              </div>
              <p className="text-[12px] text-mg-text-2 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 企业角色权限矩阵 */}
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center gap-3">
          <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">租户角色权限矩阵</span>
          <code className="text-[10px] text-mg-text-2 font-mono opacity-60">tenant_owner / tenant_admin / tenant_member</code>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-mg-border bg-mg-fill-0/30">
                <th className="py-2.5 px-5 text-[11px] font-bold text-mg-text-2 uppercase tracking-wider">权限</th>
                <th className="py-2.5 px-4 text-[11px] font-bold text-sky-500 uppercase tracking-wider text-center w-20">拥有者</th>
                <th className="py-2.5 px-4 text-[11px] font-bold text-sky-500 uppercase tracking-wider text-center w-20">管理员</th>
                <th className="py-2.5 px-4 text-[11px] font-bold text-sky-500 uppercase tracking-wider text-center w-20">成员</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mg-border/50">
              {ORG_MATRIX.map((row) => (
                <tr key={row.perm} className="hover:bg-mg-fill-0/30 transition-colors">
                  <td className="py-2.5 px-5 text-xs text-mg-text-1">{row.perm}</td>
                  <td className="py-2.5 px-4 text-center">{check(row.owner)}</td>
                  <td className="py-2.5 px-4 text-center">{check(row.admin)}</td>
                  <td className="py-2.5 px-4 text-center">{check(row.member)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 项目角色权限矩阵 */}
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center gap-3">
          <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">项目角色权限矩阵</span>
          <code className="text-[10px] text-mg-text-2 font-mono opacity-60">ws_owner / ws_admin / ws_member</code>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-mg-border bg-mg-fill-0/30">
                <th className="py-2.5 px-5 text-[11px] font-bold text-mg-text-2 uppercase tracking-wider">权限</th>
                <th className="py-2.5 px-4 text-[11px] font-bold text-emerald-500 uppercase tracking-wider text-center w-20">拥有者</th>
                <th className="py-2.5 px-4 text-[11px] font-bold text-emerald-500 uppercase tracking-wider text-center w-20">管理员</th>
                <th className="py-2.5 px-4 text-[11px] font-bold text-emerald-500 uppercase tracking-wider text-center w-20">成员</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mg-border/50">
              {WS_MATRIX.map((row) => (
                <tr key={row.perm} className="hover:bg-mg-fill-0/30 transition-colors">
                  <td className="py-2.5 px-5 text-xs text-mg-text-1">{row.perm}</td>
                  <td className="py-2.5 px-4 text-center">{check(row.owner)}</td>
                  <td className="py-2.5 px-4 text-center">{check(row.admin)}</td>
                  <td className="py-2.5 px-4 text-center">{check(row.member)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 角色关系说明 */}
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
          <span className="text-[11px] font-bold tracking-widest text-mg-text-2 uppercase">角色层级关系</span>
        </div>
        <div className="p-5 text-xs text-mg-text-1 leading-relaxed space-y-2">
          <p><strong>账户（Account）</strong>→ 一个人的登录身份，可加入多个租户</p>
          <p><strong>租户（Tenant）</strong>→ 系统最小隔离维度，分 personal（个人）和 enterprise（企业/组织）两种类型。每个账户最多创建 5 个租户。国内叫「企业」，国外叫「Organization」，本质是同一个 tenant</p>
          <p><strong>租户角色</strong>→ 账户在某个租户内的身份：tenant_owner / tenant_admin / tenant_member。控制账单、成员管理、租户设置等</p>
          <p><strong>项目（Workspace）</strong>→ 租户下的隔离空间，国内叫「项目」，国外叫「Workspace」。API Keys / 配额 / 可观测性均为项目级</p>
          <p><strong>项目角色</strong>→ 账户在某个项目内的身份：ws_owner / ws_admin / ws_member。控制 Key 管理、配额、成员分配等</p>
          <p className="text-mg-text-2 mt-3">最终权限 = 租户角色权限 ∪ 项目角色权限（取并集）</p>
        </div>
      </div>
    </>
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
          <TabsTrigger value="roles">角色设置</TabsTrigger>
          <TabsTrigger value="permissions">{t('platformConfig.tab.permissions')}</TabsTrigger>
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

        <TabsContent value="roles">
          <div className="space-y-5 pt-2">
            <RoleSettingsPanel />
          </div>
        </TabsContent>

        <TabsContent value="permissions">
          <div className="space-y-4 pt-2">
            <MenuPermissionMap />
            <PermissionPanel />
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

      </Tabs>
    </div>
  )
}
