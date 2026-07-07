import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuSearch, LuArrowRight, LuUsers } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import {
  addWorkspaceMember,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listWorkspaceMembers,
  removeWorkspaceMemberWithStrategy,
  setWorkspaceOwner,
} from '@/services/workspaces'
import { listTenantMembers } from '@/services/tenants'
import { getLoggingConfig } from '@/services/observability'
import { ObservabilityContent } from '@/pages/observability'
import { cn, pageItems, formatMoney as fmtMoney } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/format-date'
import { TENANT_ROLE_LABEL } from '@/constants/roles'
import type { Money, TenantMember, WorkspaceDetail, WorkspaceMember } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'
import { appToast } from '@/lib/app-toast'

type DetailTab = 'overview' | 'members' | 'logs' | 'settings'

function formatMoney(m?: Money) {
  if (!m) return '—'
  return `${m.currency} ${fmtMoney(m.amount, '')}`
}

export default function WorkspaceDetailPage() {
  const { workspaceId = '' } = useParams()
  const navigate = useNavigate()
  return <WorkspaceDetailContent workspaceId={workspaceId} onDeleted={() => navigate('/settings/workspace')} />
}

/**
 * 空间详情内容（详情壳 + 4 tabs）。
 * 列表页（单页结构）和独立详情路由共用此组件。
 * onDeleted：空间被删除后回调（列表页用于清空选中态，路由页用于跳回列表）。
 */
export function WorkspaceDetailContent({
  workspaceId,
  onDeleted,
}: {
  workspaceId: string
  onDeleted?: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<DetailTab>('overview')
  // 个人租户没有企业成员，空间管理里不该有「成员」tab（无人可邀请/管理）；仅企业租户显示。
  const { isEnterprise } = useTenantRole()

  const detailQuery = useQuery({
    queryKey: ['workspace-detail', workspaceId],
    queryFn: () => getWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  })
  const ws = detailQuery.data

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: t('workspaces.detail.tabs.overview') },
    ...(isEnterprise ? [{ key: 'members' as DetailTab, label: t('workspaces.detail.tabs.members') }] : []),
    { key: 'logs', label: t('workspaces.detail.tabs.logs') },
    { key: 'settings', label: t('workspaces.detail.tabs.settings') },
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 详情头：slug + 空间名（对齐原型 .space-detail-head） */}
      <div className="space-y-3">
        {detailQuery.isLoading ? (
          <div className="h-9 w-60 bg-mg-fill-1 rounded-lg animate-pulse" />
        ) : !ws ? (
          <div className="text-sm text-mg-text-3">{t('workspaces.detail.notFound')}</div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xs text-mg-text-3">@{ws.slug}</span>
            <h3 className="text-xl font-bold text-mg-text-1 tracking-tight">{ws.name}</h3>
            {ws.is_default && <Badge variant="secondary">{t('workspaces.defaultBadge')}</Badge>}
          </div>
        )}
      </div>

      {ws && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)}>
          <TabsList variant="pills" className="mb-2">
            {tabs.map((tabItem) => (
              <TabsTrigger key={tabItem.key} variant="pills" value={tabItem.key}>
                {tabItem.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview"><OverviewTab ws={ws} onGoLogs={() => setTab('logs')} /></TabsContent>
          {isEnterprise && <TabsContent value="members"><MembersTab workspaceId={workspaceId} /></TabsContent>}
          <TabsContent value="logs"><LogsForwardingTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="settings">
            <SettingsTab ws={ws} onDeleted={onDeleted ?? (() => {})} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

// ─── 概览 ─────────────────────────────────────────────
// 对齐 PRD 原型：4 指标卡 + 资源快捷入口（API Keys / 安全护栏 / 调用日志 / 日志与转发）
function OverviewTab({ ws, onGoLogs }: { ws: WorkspaceDetail; onGoLogs: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // 近 7 天用量（对齐原型：消费/请求/Tokens，请求卡带「最近调用 X前」）
  const usageCards = [
    { label: t('workspaces.detail.overview.spend'), value: formatMoney(ws.usage_7d?.spend) },
    {
      label: t('workspaces.detail.overview.requests'),
      value: (ws.usage_7d?.requests ?? 0).toLocaleString(),
      hint: `${t('workspaces.detail.overview.lastRequest')} ${ws.last_request_at ? formatRelativeTime(ws.last_request_at) : t('workspaces.detail.overview.never')}`,
    },
    { label: t('workspaces.detail.overview.tokens'), value: (ws.usage_7d?.tokens ?? 0).toLocaleString() },
  ]
  // 运行资源（对齐原型：成员/API Keys/护栏/采集/转发；后端 workspace.Detail 已返回）
  const resources = [
    { label: t('workspaces.card.members'), value: String(ws.member_count ?? 0) },
    { label: t('workspaces.detail.overview.apiKeys'), value: String(ws.api_key_count ?? 0) },
    { label: t('workspaces.card.guardrails'), value: String(ws.guardrail_count ?? 0) },
    { label: t('workspaces.summary.logging'), value: ws.logging_enabled ? t('workspaces.card.collectOn') : t('workspaces.card.collectOff') },
    { label: t('workspaces.summary.forwarding'), value: ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.card.forwardOff') },
  ]
  const shortcuts: { title: string; desc: string; onClick: () => void }[] = [
    {
      title: t('nav.apiKeys'),
      desc: t('workspaces.detail.overview.keysOwner', {
        count: ws.api_key_count ?? 0,
        owner: ws.owner?.display_name || '—',
      }),
      onClick: () => navigate(`/workspace/${ws.workspace_id}/api-keys`),
    },
    {
      title: t('nav.guardrails'),
      desc: t('workspaces.detail.overview.goGuardrailsDesc'),
      onClick: () => navigate(`/workspace/${ws.workspace_id}/guardrails`),
    },
    {
      title: t('nav.logs'),
      desc: t('workspaces.detail.overview.goLogsDesc'),
      onClick: () => navigate('/logs'),
    },
    {
      title: t('workspaces.detail.tabs.logs'),
      desc: t('workspaces.detail.overview.goForwardingDesc'),
      onClick: onGoLogs,
    },
  ]
  return (
    <div className="space-y-6">
      {/* 近 7 天用量 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {usageCards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="text-[11px] font-bold text-mg-text-3 uppercase tracking-wider mb-2">{c.label}</div>
            <div className="text-xl font-bold text-mg-text-1">{c.value}</div>
            {'hint' in c && c.hint && <div className="mt-1 text-[11px] text-mg-text-3">{c.hint}</div>}
          </Card>
        ))}
      </div>
      {/* 运行资源（对齐原型） */}
      <div>
        <div className="text-[11px] font-bold text-mg-text-3 uppercase tracking-wider mb-2">{t('workspaces.detail.overview.resources')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {resources.map((r) => (
            <Card key={r.label} className="p-4">
              <div className="text-[11px] text-mg-text-3 mb-1">{r.label}</div>
              <div className="text-base font-bold text-mg-text-1">{r.value}</div>
            </Card>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {shortcuts.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={s.onClick}
            className="text-left bg-mg-bg-0 border border-mg-border/50 rounded-lg p-4 shadow-xs cursor-pointer transition-colors hover:border-brand-base/40 hover:bg-mg-fill-0/30 group"
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-mg-text-1">{s.title}</span>
              <LuArrowRight size={14} className="text-mg-text-3 group-hover:text-brand-base transition-colors" />
            </div>
            <p className="mt-1 text-[11px] text-mg-text-3 leading-5">{s.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── 成员 ─────────────────────────────────────────────
// 对齐 PRD 原型：左主表（成员/企业角色/空间责任/拥有Key/操作）+ 右侧栏「从企业成员添加」
// 设为负责人：接 PUT /workspaces/:id/owner（#327 待实现，前端先按约定接）
// 移除成员：影响弹窗（受影响 Key + 转移/停用策略），对齐 SpaceMemberRemovalImpactModal
export function MembersTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { hasPermission } = usePermissions()
  const canManageMembers = hasPermission(PERMS.WORKSPACE_MEMBERS_MANAGE)
  const [addSearch, setAddSearch] = useState('')
  // 移除目标：携带成员对象，用于影响弹窗展示受影响 Key 数
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMember | null>(null)
  // 移除策略：transfer（转给负责人）/ disable（停用 Key）
  const [removeStrategy, setRemoveStrategy] = useState<'transfer' | 'disable' | ''>('')

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => listWorkspaceMembers(workspaceId, { page_size: 100 }).then(pageItems),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  })

  const orgQuery = useQuery({
    queryKey: ['tenant-members', activeTenantId],
    queryFn: () => listTenantMembers(activeTenantId!, { limit: 100 }),
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
  })

  const members: WorkspaceMember[] = membersQuery.data ?? []
  const owner = members.find((m) => m.role === 'ws_owner')

  const wsAccountIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of members) ids.add(m.account.account_id)
    return ids
  }, [members])

  // 企业角色：join 租户成员（成员在组织里的角色）
  const tenantRoleByAccount = useMemo(() => {
    const map = new Map<string, TenantMember['role']>()
    for (const tm of orgQuery.data?.items ?? []) map.set(tm.account.account_id, tm.role)
    return map
  }, [orgQuery.data])

  const candidates = useMemo(() => {
    const pool = orgQuery.data?.items ?? []
    const q = addSearch.trim().toLowerCase()
    return pool
      .filter((m) => !wsAccountIds.has(m.account.account_id))
      .filter((m) =>
        !q ||
        m.account.display_name.toLowerCase().includes(q) ||
        m.account.email.toLowerCase().includes(q)
      )
  }, [orgQuery.data, wsAccountIds, addSearch])

  const addMutation = useMutation({
    mutationFn: (accountId: string) =>
      addWorkspaceMember(workspaceId, { account_id: accountId, role: 'ws_member' }),
    onSuccess: () => {
      appToast.success(t('workspaces.detail.members.addSuccess'))
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      qc.invalidateQueries({ queryKey: ['tenant-members', activeTenantId] })
    },
    onError: (err: unknown) => appToast.requestError(err, t('workspaces.detail.members.addError')),
  })

  // 设为负责人：对齐原型 onSetResponsible，调 PUT /workspaces/:id/owner
  const setOwnerMutation = useMutation({
    mutationFn: (accountId: string) => setWorkspaceOwner(workspaceId, accountId),
    onSuccess: () => {
      appToast.success(t('workspaces.detail.members.setOwnerSuccess'))
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workspace-detail', workspaceId] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: unknown) => appToast.requestError(err, t('workspaces.detail.members.setOwnerError')),
  })

  // 移除成员：带 Key 处理策略（对齐原型 onConfirm(strategy)）
  const removeMutation = useMutation({
    mutationFn: ({ accountId, strategy }: { accountId: string; strategy: 'transfer' | 'disable' }) =>
      removeWorkspaceMemberWithStrategy(workspaceId, accountId, { key_strategy: strategy }),
    onSuccess: () => {
      appToast.success(t('workspaces.detail.members.removeSuccess'))
      setRemoveTarget(null)
      setRemoveStrategy('')
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
    },
    onError: (err: unknown) => appToast.requestError(err, t('workspaces.detail.members.removeError')),
  })

  const dash = '—'

  return (
    <div className={canManageMembers ? 'grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start' : 'space-y-4'}>
      {/* 左：成员主表 */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-xs">
        <div className="px-4 py-3 border-b border-mg-border/50 flex items-center gap-2 bg-mg-fill-0/20">
          <LuUsers size={14} className="text-mg-text-3" />
          <span className="text-[13px] font-bold text-mg-text-1">{t('workspaces.detail.members.title')}</span>
          <span className="text-[11px] text-mg-text-3">{t('workspaces.detail.members.count', { count: members.length })}</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('workspaces.detail.members.colMember')}</TableHead>
                <TableHead>{t('workspaces.detail.members.colEnterpriseRole')}</TableHead>
                <TableHead>{t('workspaces.detail.members.colResponsibility')}</TableHead>
                <TableHead>{t('workspaces.detail.members.colKeys')}</TableHead>
                <TableHead align="right" className="w-40">{t('workspaces.detail.members.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersQuery.isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-xs text-mg-text-3">{t('common.loading')}</TableCell></TableRow>
              ) : members.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-xs text-mg-text-3">{t('workspaces.detail.members.empty')}</TableCell></TableRow>
              ) : (
                members.map((m) => {
                  const isOwner = m.role === 'ws_owner'
                  const tenantRole = tenantRoleByAccount.get(m.account.account_id)
                  return (
                    <TableRow key={m.account.account_id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <MemberAvatar member={m} accent="emerald" />
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-mg-text-1 truncate">{m.account.display_name}</div>
                            <div className="text-[10px] text-mg-text-3 truncate">{m.account.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" size="xs">{tenantRole ? TENANT_ROLE_LABEL[tenantRole] : dash}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isOwner ? 'purple' : 'secondary'} size="xs">
                          {isOwner ? t('workspaces.detail.members.respOwner') : t('workspaces.detail.members.respMember')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-mg-text-1 font-medium">{m.api_key_count ?? dash}</span>
                      </TableCell>
                      <TableCell align="right">
                        {!isOwner && canManageMembers ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* 设为负责人：对齐原型 onSetResponsible，接 PUT /workspaces/:id/owner */}
                            <Button
                              variant="outline"
                              size="xs"
                              loading={setOwnerMutation.isPending}
                              onClick={() => setOwnerMutation.mutate(m.account.account_id)}
                              className="h-7 px-2 rounded-md text-[11px]"
                            >
                              {t('workspaces.detail.members.setOwner')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 px-2 rounded-md text-[11px] text-mg-danger hover:bg-mg-danger/5"
                              onClick={() => { setRemoveTarget(m); setRemoveStrategy('') }}
                            >
                              {t('workspaces.detail.members.remove')}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-mg-text-3">{dash}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 右：从企业成员添加（侧栏面板，对齐原型双栏布局） */}
      {canManageMembers && (
        <aside className="bg-mg-bg-0 border border-mg-border/50 rounded-lg shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-mg-border/50 bg-mg-fill-0/20">
            <div className="text-[13px] font-bold text-mg-text-1">{t('workspaces.detail.members.addAsideTitle')}</div>
            <div className="text-[11px] text-mg-text-3 mt-0.5">
              {candidates.length > 0 ? t('workspaces.detail.members.addAsideHint') : t('workspaces.detail.members.addAsideAllIn')}
            </div>
          </div>
          <div className="p-3 space-y-2">
            <Input
              prefix={<LuSearch className="w-3.5 h-3.5 text-mg-text-3" />}
              className="h-9 rounded-lg text-xs"
              placeholder={t('workspaces.detail.members.addSearchPlaceholder')}
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
            />
            <div className="max-h-[420px] overflow-y-auto border border-mg-border/50 rounded-lg divide-y divide-mg-border/40">
              {orgQuery.isLoading ? (
                <div className="py-12 flex justify-center">
                  <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
                </div>
              ) : candidates.length === 0 ? (
                <div className="py-10 text-center text-xs text-mg-text-3">{t('workspaces.detail.members.addEmpty')}</div>
              ) : (
                candidates.map((m: TenantMember) => (
                  <div key={m.account.account_id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-mg-fill-0/30 transition-colors">
                    <MemberAvatar member={m} accent="brand" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-mg-text-1 truncate">{m.account.display_name}</div>
                      <div className="text-[10px] text-mg-text-3 truncate">{m.account.email}</div>
                    </div>
                    <Button
                      variant="ghost"
                      className="h-7 px-2 text-[11px] font-semibold shrink-0 text-brand-base hover:bg-brand-base/5"
                      loading={addMutation.isPending}
                      onClick={() => addMutation.mutate(m.account.account_id)}
                    >
                      <LuArrowRight size={12} className="mr-0.5" />
                      {t('workspaces.detail.members.add')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      )}

      {/* 移除成员影响弹窗（对齐原型 SpaceMemberRemovalImpactModal）：
          列出该成员负责的 Key 数，选择「转移给负责人 / 停用 Key」策略。
          api_key_count 未返回（后端 #327）时按 0 处理，走简单确认。 */}
      <Modal
        open={removeTarget !== null}
        onClose={() => { setRemoveTarget(null); setRemoveStrategy('') }}
        size="sm"
        title={removeTarget ? t('workspaces.detail.members.removeImpactTitle', { name: removeTarget.account.display_name }) : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setRemoveTarget(null); setRemoveStrategy('') }}>
              {t('workspaces.detail.members.cancel')}
            </Button>
            <Button
              variant="outline"
              className="border-mg-danger/40 text-mg-danger hover:bg-mg-danger/5"
              loading={removeMutation.isPending}
              disabled={!!removeTarget && (removeTarget.api_key_count ?? 0) > 0 && removeStrategy === ''}
              onClick={() => {
                if (!removeTarget) return
                removeMutation.mutate({
                  accountId: removeTarget.account.account_id,
                  strategy: removeStrategy || 'transfer',
                })
              }}
            >
              {t('workspaces.detail.members.confirmRemove')}
            </Button>
          </div>
        }
      >
        {removeTarget && (removeTarget.api_key_count ?? 0) > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-mg-text-2">
              {t('workspaces.detail.members.removeImpactDesc', {
                name: removeTarget.account.display_name,
                count: removeTarget.api_key_count ?? 0,
              })}
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setRemoveStrategy('transfer')}
                className={cn(
                  'text-left rounded-lg border p-3 transition-colors',
                  removeStrategy === 'transfer' ? 'border-brand-base bg-brand-base/5' : 'border-mg-border hover:bg-mg-fill-0/40'
                )}
              >
                <div className="text-[12px] font-bold text-mg-text-1">{t('workspaces.detail.members.strategyTransfer')}</div>
                <div className="text-[11px] text-mg-text-3 mt-0.5">
                  {t('workspaces.detail.members.strategyTransferDesc', { owner: owner?.account.display_name ?? '—' })}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRemoveStrategy('disable')}
                className={cn(
                  'text-left rounded-lg border p-3 transition-colors',
                  removeStrategy === 'disable' ? 'border-brand-base bg-brand-base/5' : 'border-mg-border hover:bg-mg-fill-0/40'
                )}
              >
                <div className="text-[12px] font-bold text-mg-text-1">{t('workspaces.detail.members.strategyDisable')}</div>
                <div className="text-[11px] text-mg-text-3 mt-0.5">{t('workspaces.detail.members.strategyDisableDesc')}</div>
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-mg-text-2">{t('workspaces.detail.members.removeNoKeyDesc')}</p>
        )}
      </Modal>
    </div>
  )
}

function MemberAvatar({ member, accent }: { member: WorkspaceMember | TenantMember; accent: 'brand' | 'emerald' }) {
  const bg = accent === 'emerald' ? 'bg-emerald-600' : 'bg-brand-base'
  if (member.account.avatar_url) {
    return <img src={member.account.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
  }
  return (
    <div className={`w-7 h-7 rounded-full ${bg} text-white text-[10px] font-bold flex items-center justify-center shrink-0 uppercase`}>
      {member.account.display_name?.[0] ?? '?'}
    </div>
  )
}

// ─── 日志与转发 ───────────────────────────────────────
// PRD：可观测性并入空间详情。复用可观测性页的采集/转发能力，按当前空间 workspaceId 参数化。
export function LogsForwardingTab({ workspaceId }: { workspaceId: string }) {
  const { hasPermission } = usePermissions()
  const canEditLogging = hasPermission(PERMS.OBSERVABILITY_LOGGING_EDIT)
  const canManageForward = hasPermission(PERMS.OBSERVABILITY_FORWARD_MANAGE)

  const loggingQuery = useQuery({
    queryKey: ['observability', 'logging', workspaceId],
    queryFn: () => getLoggingConfig(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  if (loggingQuery.isLoading) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-6 max-w-3xl space-y-4 animate-pulse">
        <div className="h-5 bg-mg-fill-0 rounded-sm w-1/3" />
        <div className="h-4 bg-mg-fill-0 rounded-sm w-full" />
        <div className="h-4 bg-mg-fill-0 rounded-sm w-2/3" />
      </div>
    )
  }
  if (!loggingQuery.data) return null

  return (
    <ObservabilityContent
      workspaceId={workspaceId}
      config={loggingQuery.data}
      canEditLogging={canEditLogging}
      canManageForward={canManageForward}
    />
  )
}

// ─── 设置 ─────────────────────────────────────────────
export function SettingsTab({ ws, onDeleted }: { ws: WorkspaceDetail; onDeleted: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canRename = hasPermission(PERMS.WORKSPACE_RENAME)
  const canDelete = hasPermission(PERMS.WORKSPACE_DELETE)
  const [name, setName] = useState(ws.name)
  const [description, setDescription] = useState(ws.description ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const dirty = name.trim() !== ws.name || description.trim() !== (ws.description ?? '')

  const renameMutation = useMutation({
    mutationFn: () => updateWorkspace(ws.workspace_id, { name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      appToast.success(t('workspaces.detail.settings.renameSuccess'))
      qc.invalidateQueries({ queryKey: ['workspace-detail', ws.workspace_id] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: unknown) => appToast.requestError(err, t('workspaces.detail.settings.renameError')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkspace(ws.workspace_id, { confirm_name: ws.name }),
    onSuccess: () => {
      appToast.success(t('workspaces.detail.settings.deleteSuccess'))
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      onDeleted()
    },
    onError: (err: unknown) => appToast.requestError(err, t('workspaces.detail.settings.deleteError')),
  })

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 基本信息：名称 + Slug（只读）+ 描述 */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-6 shadow-xs space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider block">
            {t('workspaces.detail.settings.renameLabel')}
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canRename} className="max-w-xl" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider block">
            {t('workspaces.detail.settings.slugLabel')}
          </label>
          <span className="font-mono text-xs text-mg-text-3">@{ws.slug}</span>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider block">
            {t('workspaces.detail.settings.descLabel')}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canRename}
            rows={3}
            placeholder={t('workspaces.detail.settings.descPlaceholder')}
            className="max-w-xl"
          />
        </div>
        {canRename && (
          <Button
            variant="brand"
            disabled={renameMutation.isPending || !name.trim() || !dirty}
            onClick={() => renameMutation.mutate()}
            className="h-9 px-4 rounded-lg font-semibold text-xs"
          >
            {t('workspaces.detail.settings.save')}
          </Button>
        )}
      </div>

      {/* 危险操作 */}
      <div className="bg-mg-bg-0 border border-mg-danger/30 rounded-lg p-6 shadow-xs space-y-3">
        <div className="text-xs font-bold text-mg-danger uppercase tracking-wider">
          {t('workspaces.detail.settings.dangerTitle')}
        </div>
        {ws.is_default ? (
          <p className="text-xs text-mg-text-3">{t('workspaces.detail.settings.defaultCannotDelete')}</p>
        ) : canDelete ? (
          <>
            <p className="text-xs text-mg-text-3">{t('workspaces.detail.settings.deleteHint')}</p>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="h-9 px-4 rounded-lg font-semibold text-xs border-mg-danger/40 text-mg-danger hover:bg-mg-danger/5"
            >
              {t('workspaces.detail.settings.delete')}
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title={t('workspaces.detail.settings.delete')}
        description={t('workspaces.detail.settings.deleteHint')}
        confirmLabel={t('workspaces.detail.settings.delete')}
        cancelLabel={t('workspaces.detail.settings.cancel')}
        variant="destructive"
        loading={deleteMutation.isPending}
        requireTyping={ws.name}
      />
    </div>
  )
}
