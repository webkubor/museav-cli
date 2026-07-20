import { useState } from 'react'
import { LuTriangleAlert } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { CopyButton } from '@/components/ui/CopyButton'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { addTenantMembers, getTenantInviteLink, resetTenantInviteLink } from '@/services/tenants'
import { listWorkspaces } from '@/services/workspaces'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { TagInput } from '@/components/ui/TagInput'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { appToast } from '@/lib/app-toast'

export function InviteTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canInvite = hasPermission(PERMS.ORG_INVITE_MANAGE)
  const qc = useQueryClient()
  // 多邮箱 chips（需求方#116）：回车/逗号逐个添加，粘贴一串自动按分隔符拆分；发送时已是数组
  const [inviteEmails, setInviteEmails] = useState<string[]>([])
  const [inviteRole, setInviteRole] = useState<'tenant_admin' | 'tenant_member'>('tenant_member')
  const [expiresInHours, setExpiresInHours] = useState<number>(72)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  // 授权工作空间：NONE=不指定（仅加入组织），透传 target_workspace_id（AddTenantMemberRequest 支持）。
  // 用非空 sentinel（Radix Select.Item 禁止空串 value）。
  const NONE_WORKSPACE = '__none__'
  const [targetWorkspaceId, setTargetWorkspaceId] = useState(NONE_WORKSPACE)

  // 空间列表作为「授权工作空间」下拉数据源
  const workspacesQuery = useQuery({
    queryKey: ['workspaces', tenantId],
    queryFn: () => listWorkspaces().then((res) => res.items ?? []),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const workspaces = workspacesQuery.data ?? []

  const inviteLinkQuery = useQuery({
    queryKey: ['tenant-invite-link', tenantId],
    queryFn: () => getTenantInviteLink(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  // 展示当前链接实际绑定的角色（后端 #326 返回 role）：链接角色变化时同步下拉与提示，
  // 而非恒显本地默认；用户手动切换仍可覆盖。旧链接 role 为空则保持默认。
  // 用「渲染期对比上次值」模式同步，避免 effect 内 setState（React 官方推荐）。
  const linkRole = inviteLinkQuery.data?.role
  const [syncedLinkRole, setSyncedLinkRole] = useState(linkRole)
  if (linkRole !== syncedLinkRole) {
    setSyncedLinkRole(linkRole)
    if (linkRole === 'tenant_admin' || linkRole === 'tenant_member') setInviteRole(linkRole)
  }

  // 重置/刷新邀请链接：显式传入目标角色（避免 setState 异步取到旧值）。
  // silent=true 用于「切换角色自动刷新」场景，提示文案不同。
  const resetLink = useMutation({
    mutationFn: (vars: { role: 'tenant_admin' | 'tenant_member'; silent?: boolean }) =>
      resetTenantInviteLink(tenantId, { role: vars.role, expires_in_hours: expiresInHours }),
    onSuccess: (_data, vars) => {
      appToast.success(vars.silent ? t('enterprise.invite.linkRefreshedByRole') : t('enterprise.invite.linkReset'))
      qc.invalidateQueries({ queryKey: ['tenant-invite-link', tenantId] })
      setShowResetConfirm(false)
    },
    onError: (err: Error) => appToast.requestError(err, '重置失败'),
  })

  const addMembers = useMutation({
    mutationFn: () => addTenantMembers(tenantId, {
      emails: inviteEmails,
      role: inviteRole,
      expires_in_hours: expiresInHours,
      target_workspace_id: targetWorkspaceId === NONE_WORKSPACE ? undefined : targetWorkspaceId,
    }),
    onSuccess: () => {
      appToast.success('邀请已发出')
      setInviteEmails([])
      setExpiresInHours(72)
      setTargetWorkspaceId(NONE_WORKSPACE)
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
    },
    onError: (err: Error) => appToast.requestError(err, '邀请失败'),
  })

  const inviteLinkUrl = inviteLinkQuery.data
    ? `${window.location.origin}/invitations/${inviteLinkQuery.data.token}`
    : null


  // 切换初始角色：角色绑定在链接里 → 必须重出链接，旧链接随之失效
  const handleRoleChange = (next: string) => {
    const role = next as 'tenant_admin' | 'tenant_member'
    setInviteRole(role)
    if (canInvite && inviteLinkQuery.data) resetLink.mutate({ role, silent: true })
  }

  const fieldLabel = 'text-xs text-mg-text-3 font-semibold whitespace-nowrap'

  return (
    <>
      <div className="space-y-6">
        {/* 邀请配置 */}
        <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-4 flex items-center justify-between flex-wrap gap-4 shadow-sm">
          <span className="text-xs font-bold text-mg-text-2 uppercase tracking-wider">{t('enterprise.invite.configTitle')}</span>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex items-center gap-2">
              <span className={fieldLabel}>{t('enterprise.invite.defaultRole')}</span>
              <Select value={inviteRole} onChange={handleRoleChange} className="h-8 w-28 text-xs rounded-lg" data-track="invitations:field_role">
                <Select.Option value="tenant_member">Member</Select.Option>
                <Select.Option value="tenant_admin">Admin</Select.Option>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className={fieldLabel}>{t('enterprise.invite.expiry')}</span>
              <Select value={String(expiresInHours)} onChange={(v) => setExpiresInHours(Number(v))} className="h-8 w-28 text-xs rounded-lg">
                <Select.Option value="24">{t('enterprise.invite.expiry24')}</Select.Option>
                <Select.Option value="72">{t('enterprise.invite.expiry72')}</Select.Option>
                <Select.Option value="168">{t('enterprise.invite.expiry168')}</Select.Option>
                <Select.Option value="720">{t('enterprise.invite.expiry720')}</Select.Option>
              </Select>
            </div>
          </div>
        </div>

        {/* 快速邀请链接 */}
        <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-mg-border/50 bg-mg-fill-0/20 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-mg-text-1">{t('enterprise.invite.linkTitle')}</div>
              <span className="text-xs text-mg-text-3">{t('enterprise.invite.linkHint')}</span>
              <span className="text-xs text-mg-warning flex items-center gap-1 mt-0.5">
                <LuTriangleAlert size={11} className="shrink-0" />
                {t('enterprise.invite.oneTimeNote', { role: inviteRole === 'tenant_admin' ? 'Admin' : 'Member' })}
              </span>
            </div>
            {canInvite && (
              <Button
                variant="outline"
                className="h-7 text-xs font-bold px-3 rounded-full border-mg-border/60 hover:bg-mg-fill-0"
                onClick={() => setShowResetConfirm(true)}
              >
                {t('enterprise.invite.resetLink')}
              </Button>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 p-2.5 rounded-lg border border-mg-border/40 bg-mg-fill-0/30 font-mono text-xs text-mg-text-2 overflow-hidden text-ellipsis whitespace-nowrap select-all">
                {inviteLinkUrl ?? <span className="text-mg-text-4 italic">…</span>}
              </div>
              <CopyButton
                value={inviteLinkUrl ?? ''}
                variant="labeled"
                buttonVariant="brand"
                label={t('enterprise.invite.copyLink')}
                copiedLabel={t('enterprise.invite.copied')}
                toast="邀请链接已复制"
                disabled={!inviteLinkUrl}
                className="shrink-0"
              />
            </div>
          </div>
        </div>

        {/* 邮箱邀请 */}
        <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
            <div className="text-xs font-bold text-mg-text-1">{t('enterprise.invite.emailTitle')}</div>
            <span className="text-xs text-mg-text-3">{t('enterprise.invite.emailHint')}</span>
          </div>
          <div className="p-4 flex gap-2 items-end flex-wrap md:flex-nowrap">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.invite.emailTitle')}</label>
              {/* 回车/逗号=添加一个邮箱 chip，绝不直接提交；发送只走「发送邀请」按钮（需求方#116） */}
              <div data-track="invitations:field_email">
                <TagInput
                  value={inviteEmails}
                  onChange={setInviteEmails}
                  placeholder={t('enterprise.invite.emailPlaceholder')}
                  splitPattern={/[\s,;，；]+/}
                  validator={(v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
                  onValidationError={(v) => appToast.error(t('enterprise.invite.emailInvalid', { email: v }))}
                />
              </div>
            </div>
            <div className="w-full md:w-56 space-y-1">
              <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.invite.targetWorkspace')}</label>
              <Select value={targetWorkspaceId} onChange={setTargetWorkspaceId} className="h-9 text-xs rounded-lg" data-track="invitations:field_workspace">
                <Select.Option value={NONE_WORKSPACE}>{t('enterprise.invite.targetWorkspaceNone')}</Select.Option>
                {workspaces.map((ws) => (
                  <Select.Option key={ws.workspace_id} value={ws.workspace_id}>{ws.name}</Select.Option>
                ))}
              </Select>
            </div>
            {canInvite && (
              <Button
                variant="brand"
                data-track="invitations:send"
                loading={addMembers.isPending}
                disabled={inviteEmails.length === 0}
                className="font-semibold h-9 px-4 rounded-lg text-xs bg-brand-base text-white hover:bg-brand-base/90 shrink-0"
                onClick={() => addMembers.mutate()}
              >
                {t('enterprise.invite.sendInvite')}
              </Button>
            )}
          </div>
        </div>

        {/* 邀请队列 —— 后端无租户级邀请队列接口 → 占位空态 */}
        {/* TODO(后端待接): 租户级邀请队列接口（邮箱/角色/授权空间/邀请人/过期/状态 + 重发/撤销） 见 #420 */}
        <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
            <div className="text-xs font-bold text-mg-text-1">{t('enterprise.invite.queueTitle')}</div>
          </div>
          <EmptyState
            title={t('enterprise.invite.queueEmptyTitle')}
            description={t('enterprise.invite.queueEmptyDesc')}
          />
        </div>
      </div>

      {/* 重置邀请链接确认弹窗 */}
      <Modal
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        size="sm"
        title={t('enterprise.invite.resetConfirmTitle')}
        description={t('enterprise.invite.resetConfirmDesc')}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" onClick={() => setShowResetConfirm(false)}>
              {t('enterprise.members.cancel')}
            </Button>
            <Button
              variant="brand"
              disabled={resetLink.isPending}
              onClick={() => resetLink.mutate({ role: inviteRole })}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-brand-base text-white hover:bg-brand-base/90"
            >
              {resetLink.isPending ? '…' : t('enterprise.invite.confirmReset')}
            </Button>
          </div>
        }
      />
    </>
  )
}
