import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listTenantMembers, removeTenantMember, updateTenantMemberRole } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import { formatDate } from '@/lib/format-date'
import type { TenantMember } from '@/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { appToast } from '@/lib/app-toast'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'

type TenantRole = 'tenant_owner' | 'tenant_admin' | 'tenant_member'
type EditableRole = 'tenant_admin' | 'tenant_member'

const ROLE_LABEL: Record<TenantRole, string> = {
  tenant_owner: 'Owner',
  tenant_admin: 'Admin',
  tenant_member: 'Member',
}
const ROLE_BADGE: Record<TenantRole, 'purple' | 'default' | 'secondary'> = {
  tenant_owner: 'purple',
  tenant_admin: 'default',
  tenant_member: 'secondary',
}

/**
 * 成员治理页签。
 * 权限边界：
 *  - Owner 可管理所有非 Owner 成员，可将 Member↔Admin 互转。
 *  - Admin 只能管理 Member；不能改/停用 Owner 或其他 Admin；不能把 Member 提为 Admin。
 *  - Owner 唯一、不能自降级（换 Owner 走「企业信息 → 转移所有权」）。
 */
export function MembersTab({
  tenantId,
  isOwner,
  isAdmin,
}: {
  tenantId: string
  isOwner: boolean
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [editTarget, setEditTarget] = useState<TenantMember | null>(null)
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<'all' | TenantRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  const [wsFilter, setWsFilter] = useState<'all' | string>('all')

  // 编辑弹窗内的可变状态
  const [draftRole, setDraftRole] = useState<EditableRole>('tenant_member')

  const membersQuery = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  // 工作空间列表：仅用于筛选下拉；成员的「授权工作空间」明细后端未提供 → 列占位。
  const workspacesQuery = useQuery({
    queryKey: ['workspaces', tenantId],
    queryFn: listWorkspaces,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const workspaces = workspacesQuery.data?.items ?? []

  const changeRole = useMutation({
    mutationFn: (values: { accountId: string; role: EditableRole }) =>
      updateTenantMemberRole(tenantId, values.accountId, values.role),
    onSuccess: () => {
      appToast.success('角色已更新')
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
      setEditTarget(null)
    },
    onError: (err: Error) => appToast.requestError(err, '更新角色失败'),
  })

  const removeMember = useMutation({
    mutationFn: (accountId: string) => removeTenantMember(tenantId, accountId),
    onSuccess: () => {
      appToast.success('成员已移除')
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
      setRemoveTarget(null)
    },
    onError: (err: Error) => appToast.requestError(err, '移除成员失败'),
  })

  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data])

  // 当前操作者能否管理某成员（前端边界，服务端二次校验）
  function canManageMember(m: TenantMember): boolean {
    if (m.role === 'tenant_owner') return false // Owner 不可被管理
    if (isOwner) return true
    if (isAdmin) return m.role === 'tenant_member' // Admin 只能管 Member
    return false
  }

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false
      if (statusFilter !== 'all' && (m.status ?? 'active') !== (statusFilter as string)) return false
      // wsFilter：后端无成员-工作空间授权明细，无法真正过滤 → 仅当选了具体空间时不做误过滤，保留全部。
      // ponytail: workspace filter is a no-op until backend exposes per-member workspace grants.
      return true
    })
  }, [members, roleFilter, statusFilter])

  function openEdit(m: TenantMember) {
    setEditTarget(m)
    setDraftRole(m.role === 'tenant_admin' ? 'tenant_admin' : 'tenant_member')
  }

  // 编辑弹窗内可选角色：Admin 操作者不能把成员提为 Admin
  const roleOptions: { value: EditableRole; label: string }[] = isOwner
    ? [
        { value: 'tenant_member', label: 'Member' },
        { value: 'tenant_admin', label: 'Admin' },
      ]
    : [{ value: 'tenant_member', label: 'Member' }]

  const pillSelect =
    'h-8 text-[11px] py-0 pr-7 pl-2.5 bg-mg-bg-0 border border-mg-border/50 rounded-full font-semibold cursor-pointer text-mg-text-1 outline-none hover:border-brand-base/40 transition-colors'

  return (
    <>
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
        {/* 筛选条 */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-mg-border/50 bg-mg-fill-0/20 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
              className={pillSelect}
              aria-label={t('enterprise.members.filterRole')}
            >
              <option value="all">{t('enterprise.members.filterRole')}：{t('enterprise.members.all')}</option>
              <option value="tenant_owner">Owner</option>
              <option value="tenant_admin">Admin</option>
              <option value="tenant_member">Member</option>
            </select>
            <select
              value={wsFilter}
              onChange={(e) => setWsFilter(e.target.value)}
              className={pillSelect}
              aria-label={t('enterprise.members.filterWorkspace')}
              disabled={workspaces.length === 0}
            >
              <option value="all">{t('enterprise.members.filterWorkspace')}：{t('enterprise.members.all')}</option>
              {workspaces.map((w) => (
                <option key={w.workspace_id} value={w.workspace_id}>{w.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className={pillSelect}
              aria-label={t('enterprise.members.filterStatus')}
            >
              <option value="all">{t('enterprise.members.filterStatus')}：{t('enterprise.members.all')}</option>
              <option value="active">{t('enterprise.members.statusActive')}</option>
              <option value="suspended">{t('enterprise.members.statusSuspended')}</option>
            </select>
          </div>
          <span className="text-[10px] text-mg-text-3 bg-mg-fill-1 border border-mg-border/40 px-2 py-0.5 rounded-full font-medium">
            {membersQuery.isLoading ? '…' : t('enterprise.members.count', { count: filtered.length })}
          </span>
        </div>

        <div className="overflow-x-auto w-full p-2">
          {membersQuery.isLoading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={
                members.length === 0
                  ? t('enterprise.members.empty')
                  : t('enterprise.members.emptyFiltered')
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('enterprise.members.colMember')}</TableHead>
                  <TableHead>{t('enterprise.members.colRole')}</TableHead>
                  <TableHead>{t('enterprise.members.colWorkspaces')}</TableHead>
                  <TableHead>{t('enterprise.members.colStatus')}</TableHead>
                  <TableHead>{t('enterprise.members.colActive')}</TableHead>
                  <TableHead align="center" className="w-24">{t('enterprise.members.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const manageable = canManageMember(m)
                  const isPrivileged = m.role === 'tenant_owner' || m.role === 'tenant_admin'
                  // 后端 TenantMember.status 目前仅 'active'；'suspended' 为前端预留展示。
                  // TODO(后端待接): 成员停用状态字段
                  const status: string = m.status ?? 'active'
                  return (
                    <TableRow key={m.account.account_id}>
                      <TableCell>
                        <div className="font-semibold text-mg-text-1">{m.account.display_name || '—'}</div>
                        <div className="text-[10px] text-mg-text-3 mt-0.5">{m.account.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ROLE_BADGE[m.role]} size="sm">{ROLE_LABEL[m.role]}</Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-mg-text-2 font-medium">
                        {isPrivileged ? (
                          <span className="text-mg-text-3">{t('enterprise.members.allWorkspaces')}</span>
                        ) : (
                          // 后端未返回成员授权工作空间明细，仅有 workspace_count → 占位
                          // TODO(后端待接): 成员-工作空间授权明细接口
                          <span>{m.workspace_count > 0 ? `${m.workspace_count}` : '—'}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                            status === 'suspended' ? 'text-mg-danger' : 'text-mg-success'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              status === 'suspended' ? 'bg-mg-danger' : 'bg-mg-success'
                            }`}
                          />
                          {status === 'suspended'
                            ? t('enterprise.members.statusSuspended')
                            : t('enterprise.members.statusActive')}
                        </span>
                      </TableCell>
                      <TableCell className="text-[11px] text-mg-text-2 font-medium">
                        {/* 后端 TenantMember 无 last_active_at → 用加入时间占位 */}
                        {/* TODO(后端待接): 成员最近活跃时间字段 */}
                        {formatDate(m.joined_at)}
                      </TableCell>
                      <TableCell align="center">
                        {manageable ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(m)}
                              className="text-mg-text-3 hover:text-brand-base hover:bg-brand-glow/10 px-2 py-1 rounded-md transition-all border-none bg-transparent cursor-pointer font-semibold text-[11px]"
                            >
                              {t('enterprise.members.edit')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(m.account.account_id)}
                              className="text-mg-text-3 hover:text-mg-danger hover:bg-mg-danger/5 px-2 py-1 rounded-md transition-all border-none bg-transparent cursor-pointer font-semibold text-[11px]"
                            >
                              {t('enterprise.members.remove')}
                            </button>
                          </div>
                        ) : (
                          <span className="text-mg-text-4">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* 编辑成员弹窗 */}
      <Modal
        open={editTarget !== null}
        onClose={() => { if (!changeRole.isPending) setEditTarget(null) }}
        size="md"
        title={t('enterprise.members.editTitle')}
        description={editTarget?.account.email}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" disabled={changeRole.isPending} onClick={() => setEditTarget(null)}>
              {t('enterprise.members.cancel')}
            </Button>
            <Button
              variant="brand"
              loading={changeRole.isPending}
              disabled={!editTarget || draftRole === editTarget.role}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-brand-base text-white hover:bg-brand-base/90"
              onClick={() => editTarget && changeRole.mutate({ accountId: editTarget.account.account_id, role: draftRole })}
            >
              {t('enterprise.members.save')}
            </Button>
          </div>
        }
      >
        {editTarget && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-mg-text-2">
                {t('enterprise.members.roleLabel')}
              </label>
              <select
                value={draftRole}
                onChange={(e) => setDraftRole(e.target.value as EditableRole)}
                className="w-full h-9 text-xs px-2.5 bg-mg-bg-0 border border-mg-border/50 rounded-lg font-semibold cursor-pointer text-mg-text-1 outline-none"
              >
                {roleOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* 授权工作空间：Owner/Admin 只读「全部工作空间」；仅 Member 可改 */}
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-mg-text-2">
                {t('enterprise.members.workspaceLabel')}
              </label>
              {draftRole === 'tenant_member' ? (
                <div className="rounded-lg border border-mg-border/40 bg-mg-fill-0/30 p-3 text-xs text-mg-text-3">
                  {/* 后端无「设置成员授权工作空间」接口 → 只做展示占位 */}
                  {/* TODO(后端待接): 设置成员授权工作空间接口 */}
                  {workspaces.length === 0
                    ? '—'
                    : `${t('enterprise.members.workspaceLabel')}：${editTarget.workspace_count} / ${workspaces.length}`}
                </div>
              ) : (
                <div className="rounded-lg border border-mg-border/40 bg-mg-fill-0/30 p-3 text-xs text-mg-text-3">
                  {t('enterprise.members.allWorkspaces')}
                  <span className="ml-1 text-[10px] text-mg-text-4">· {t('enterprise.members.workspaceHintNonMember')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* 移除成员确认弹窗 */}
      <Modal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        size="sm"
        title={t('enterprise.members.removeTitle')}
        description={t('enterprise.members.removeDesc')}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" onClick={() => setRemoveTarget(null)}>
              {t('enterprise.members.cancel')}
            </Button>
            <Button
              variant="brand"
              disabled={removeMember.isPending}
              onClick={() => removeMember.mutate(removeTarget!)}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-mg-danger text-white hover:bg-mg-danger/90"
            >
              {removeMember.isPending ? '…' : t('enterprise.members.confirmRemove')}
            </Button>
          </div>
        }
      />
    </>
  )
}
