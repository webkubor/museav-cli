import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuArrowLeft, LuSearch, LuX, LuArrowRight, LuUsers, LuBuilding2 } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import {
  addWorkspaceMember,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from '@/services/workspaces'
import { listTenantMembers } from '@/services/tenants'
import { getLoggingConfig } from '@/services/observability'
import { ObservabilityContent } from '@/pages/observability'
import { pageItems, formatMoney as fmtMoney } from '@/lib/utils'
import { WS_ROLE_LABEL, WS_ROLE_OPTIONS, TENANT_ROLE_LABEL } from '@/constants/roles'
import type { Money, TenantMember, WorkspaceDetail, WorkspaceMember } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { appToast } from '@/lib/app-toast'

type DetailTab = 'overview' | 'members' | 'logs' | 'settings'

function formatMoney(m?: Money) {
  if (!m) return '—'
  return `${m.currency} ${fmtMoney(m.amount, '')}`
}

export default function WorkspaceDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { workspaceId = '' } = useParams()
  const [tab, setTab] = useState<DetailTab>('overview')

  const detailQuery = useQuery({
    queryKey: ['workspace-detail', workspaceId],
    queryFn: () => getWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  })
  const ws = detailQuery.data

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: t('workspaces.detail.tabs.overview') },
    { key: 'members', label: t('workspaces.detail.tabs.members') },
    { key: 'logs', label: t('workspaces.detail.tabs.logs') },
    { key: 'settings', label: t('workspaces.detail.tabs.settings') },
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 返回 + 标题 */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate('/settings/workspace')}
          className="flex items-center gap-1.5 text-xs font-bold text-mg-text-3 hover:text-mg-text-1 bg-transparent border-none p-0 cursor-pointer transition-colors"
        >
          <LuArrowLeft size={14} /> {t('workspaces.detail.back')}
        </button>

        {detailQuery.isLoading ? (
          <div className="h-9 w-60 bg-mg-fill-1 rounded-lg animate-pulse" />
        ) : !ws ? (
          <div className="text-sm text-mg-text-3">{t('workspaces.detail.notFound')}</div>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-mg-text-1 tracking-tight">{ws.name}</h1>
            <span className="font-mono text-xs bg-mg-fill-0 px-2 py-0.5 rounded-sm border border-mg-border/60 text-mg-text-3">
              {ws.workspace_id}
            </span>
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
          <TabsContent value="members"><MembersTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="logs"><LogsForwardingTab workspaceId={workspaceId} /></TabsContent>
          <TabsContent value="settings">
            <SettingsTab ws={ws} onDeleted={() => navigate('/settings/workspace')} />
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
  const cards = [
    { label: t('workspaces.detail.overview.spend'), value: formatMoney(ws.usage_7d?.spend) },
    { label: t('workspaces.detail.overview.requests'), value: (ws.usage_7d?.requests ?? 0).toLocaleString() },
    { label: t('workspaces.detail.overview.tokens'), value: (ws.usage_7d?.tokens ?? 0).toLocaleString() },
    { label: t('workspaces.detail.overview.apiKeys'), value: String(ws.api_key_count ?? 0) },
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-5 shadow-xs">
            <div className="text-[11px] font-bold text-mg-text-3 uppercase tracking-wider mb-2">{c.label}</div>
            <div className="text-xl font-bold text-mg-text-1">{c.value}</div>
          </div>
        ))}
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
function MembersTab({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { hasPermission } = usePermissions()
  const canManageMembers = hasPermission(PERMS.WORKSPACE_MEMBERS_MANAGE)
  const [addSearch, setAddSearch] = useState('')
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ accountId: string; role: string } | null>(null)

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

  const wsAccountIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of members) ids.add(m.account.account_id)
    return ids
  }, [members])

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
      addWorkspaceMember(workspaceId, {
        account_id: accountId,
        role: 'ws_member',
      }),
    onSuccess: () => {
      appToast.success(t('workspaces.detail.members.addSuccess'))
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
      qc.invalidateQueries({ queryKey: ['tenant-members', activeTenantId] })
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('workspaces.detail.members.addError')),
  })

  const removeMutation = useMutation({
    mutationFn: (accountId: string) => removeWorkspaceMember(workspaceId, accountId),
    onSuccess: () => {
      appToast.success(t('workspaces.detail.members.removeSuccess'))
      qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] })
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('workspaces.detail.members.removeError')),
  })

  const roleMutation = useMutation({
    mutationFn: ({ accountId, role }: { accountId: string; role: 'ws_admin' | 'ws_member' }) =>
      updateWorkspaceMemberRole(workspaceId, accountId, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }),
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('workspaces.detail.members.roleError')),
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ minHeight: 420 }}>
      {/* 项目成员 */}
      <div className="bg-card-bg border border-mg-border rounded-md overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-mg-border flex items-center gap-2 bg-mg-fill-0/20 shrink-0">
          <LuUsers size={14} className="text-mg-text-3" />
          <span className="text-[13px] font-bold text-mg-text-1">{t('workspaces.detail.members.title')}</span>
          <span className="text-[11px] text-mg-text-3 ml-auto">
            {t('workspaces.detail.members.count', { count: members.length })}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {membersQuery.isLoading ? (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center text-xs text-mg-text-3">{t('workspaces.detail.members.empty')}</div>
          ) : (
            <div className="divide-y divide-mg-border/40">
              {members.map((m) => (
                <div key={m.account.account_id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-mg-fill-0/30 transition-colors">
                  <MemberAvatar member={m} accent="emerald" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-mg-text-1 truncate">{m.account.display_name}</div>
                    <div className="text-[10px] text-mg-text-3 truncate">{m.account.email}</div>
                  </div>
                  {m.role !== 'ws_owner' && canManageMembers ? (
                    <Select
                      value={m.role}
                      onChange={(role) => setRoleChangeTarget({ accountId: m.account.account_id, role })}
                      className="h-6 text-[10px] w-20 rounded-sm"
                    >
                      {WS_ROLE_OPTIONS.map((o) => (
                        <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                      ))}
                    </Select>
                  ) : (
                    <Badge variant="purple" size="xs" className="shrink-0">{WS_ROLE_LABEL[m.role]}</Badge>
                  )}
                  {m.role !== 'ws_owner' && canManageMembers && (
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(m.account.account_id)}
                      className="shrink-0 p-1 rounded-sm text-mg-text-3 hover:text-mg-danger hover:bg-mg-danger/5 transition-colors cursor-pointer border-none bg-transparent"
                      title={t('workspaces.detail.members.remove')}
                    >
                      <LuX size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 从企业成员中添加 */}
      <div className="bg-card-bg border border-mg-border rounded-md overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-mg-border flex items-center gap-2 bg-mg-fill-0/20 shrink-0">
          <LuBuilding2 size={14} className="text-mg-text-3" />
          <span className="text-[13px] font-bold text-mg-text-1">{t('workspaces.detail.members.addTitle')}</span>
          <div className="ml-auto">
            <Input
              prefix={<LuSearch className="w-3 h-3" />}
              className="w-44 h-7 rounded-md text-[11px]"
              placeholder={t('workspaces.detail.members.addSearchPlaceholder')}
              value={addSearch}
              onChange={(e) => setAddSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {orgQuery.isLoading ? (
            <div className="py-16 flex justify-center">
              <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-xs text-mg-text-3">{t('workspaces.detail.members.addEmpty')}</div>
          ) : (
            <div className="divide-y divide-mg-border/40">
              {candidates.map((m: TenantMember) => (
                <div key={m.account.account_id} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-mg-fill-0/30 transition-colors">
                  <MemberAvatar member={m} accent="brand" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-mg-text-1 truncate">{m.account.display_name}</div>
                    <div className="text-[10px] text-mg-text-3 truncate">{m.account.email}</div>
                  </div>
                  <Badge variant="outline" size="xs" className="shrink-0">{TENANT_ROLE_LABEL[m.role]}</Badge>
                  {canManageMembers && (
                    <Button
                      variant="ghost"
                      className="h-6 px-2 text-[10px] font-semibold shrink-0 text-brand-base hover:bg-brand-base/5"
                      loading={addMutation.isPending}
                      onClick={() => addMutation.mutate(m.account.account_id)}
                    >
                      <LuArrowRight size={11} className="mr-0.5" />
                      {t('workspaces.detail.members.add')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 移除成员确认弹窗 */}
      <Modal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        size="sm"
        title={t('workspaces.detail.members.removeConfirmTitle')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              {t('workspaces.detail.settings.cancel')}
            </Button>
            <Button
              variant="outline"
              className="border-mg-danger/40 text-mg-danger hover:bg-mg-danger/5"
              loading={removeMutation.isPending}
              onClick={() => {
                removeMutation.mutate(removeTarget!)
                setRemoveTarget(null)
              }}
            >
              {t('workspaces.detail.members.remove')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-mg-text-2">{t('workspaces.detail.members.removeConfirmDesc')}</p>
      </Modal>

      {/* 修改角色确认弹窗 */}
      <Modal
        open={roleChangeTarget !== null}
        onClose={() => setRoleChangeTarget(null)}
        size="sm"
        title={t('workspaces.detail.members.roleConfirmTitle')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRoleChangeTarget(null)}>
              {t('workspaces.detail.settings.cancel')}
            </Button>
            <Button
              variant="brand"
              loading={roleMutation.isPending}
              onClick={() => {
                roleMutation.mutate({ accountId: roleChangeTarget!.accountId, role: roleChangeTarget!.role as 'ws_admin' | 'ws_member' })
                setRoleChangeTarget(null)
              }}
            >
              {t('workspaces.detail.members.roleConfirmOk')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-mg-text-2">
          {t('workspaces.detail.members.roleConfirmDesc', { role: WS_ROLE_LABEL[roleChangeTarget?.role as keyof typeof WS_ROLE_LABEL] ?? roleChangeTarget?.role })}
        </p>
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
function LogsForwardingTab({ workspaceId }: { workspaceId: string }) {
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
function SettingsTab({ ws, onDeleted }: { ws: WorkspaceDetail; onDeleted: () => void }) {
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
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('workspaces.detail.settings.renameError')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkspace(ws.workspace_id, { confirm_name: ws.name }),
    onSuccess: () => {
      appToast.success(t('workspaces.detail.settings.deleteSuccess'))
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      onDeleted()
    },
    onError: (err: unknown) => appToast.error((err as Error)?.message || t('workspaces.detail.settings.deleteError')),
  })

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 基本信息：名称 + Slug（只读）+ 描述 */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-6 shadow-xs space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider block">
            {t('workspaces.detail.settings.renameLabel')}
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canRename} className="max-w-[320px] h-9 text-xs rounded-lg" />
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
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canRename}
            rows={3}
            placeholder={t('workspaces.detail.settings.descPlaceholder')}
            className="w-full max-w-xl rounded-lg border border-mg-border bg-mg-fill-0 px-3 py-2 text-xs text-mg-text-1 outline-none transition-colors focus:border-brand-base focus:ring-2 focus:ring-brand-glow placeholder:text-mg-text-3/70 disabled:opacity-50 resize-y"
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
