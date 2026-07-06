import { useState } from 'react'
import { LuTriangleAlert } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { useCopy } from '@/hooks/use-copy'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { addTenantMembers, getTenantInviteLink, resetTenantInviteLink } from '@/services/tenants'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { appToast } from '@/lib/app-toast'

export function InviteTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  const canInvite = hasPermission(PERMS.ORG_INVITE_MANAGE)
  const qc = useQueryClient()
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<'tenant_admin' | 'tenant_member'>('tenant_member')
  const [expiresInHours, setExpiresInHours] = useState<number>(72)
  const { copy: copyLink, copied: linkCopied } = useCopy()
  const [showResetConfirm, setShowResetConfirm] = useState(false)

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
      emails: inviteEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
      role: inviteRole,
      expires_in_hours: expiresInHours,
    }),
    onSuccess: () => {
      appToast.success('邀请已发出')
      setInviteEmails('')
      setExpiresInHours(72)
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
    },
    onError: (err: Error) => appToast.requestError(err, '邀请失败'),
  })

  const inviteLinkUrl = inviteLinkQuery.data
    ? `${window.location.origin}/invitations/${inviteLinkQuery.data.token}`
    : null

  async function handleCopyLink() {
    if (!inviteLinkUrl) return
    await copyLink(inviteLinkUrl)
    appToast.success('邀请链接已复制')
  }

  // 切换初始角色：角色绑定在链接里 → 必须重出链接，旧链接随之失效
  const handleRoleChange = (next: string) => {
    const role = next as 'tenant_admin' | 'tenant_member'
    setInviteRole(role)
    if (canInvite && inviteLinkQuery.data) resetLink.mutate({ role, silent: true })
  }

  const fieldLabel = 'text-[11px] text-mg-text-3 font-semibold whitespace-nowrap'

  return (
    <>
      <div className="space-y-6">
        {/* 邀请配置 */}
        <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-4 flex items-center justify-between flex-wrap gap-4 shadow-sm">
          <span className="text-xs font-bold text-mg-text-2 uppercase tracking-wider">{t('enterprise.invite.configTitle')}</span>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex items-center gap-2">
              <span className={fieldLabel}>{t('enterprise.invite.defaultRole')}</span>
              <Select value={inviteRole} onChange={handleRoleChange} className="h-8 w-28 text-[11px] rounded-lg">
                <Select.Option value="tenant_member">Member</Select.Option>
                <Select.Option value="tenant_admin">Admin</Select.Option>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className={fieldLabel}>{t('enterprise.invite.expiry')}</span>
              <Select value={String(expiresInHours)} onChange={(v) => setExpiresInHours(Number(v))} className="h-8 w-28 text-[11px] rounded-lg">
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
              <span className="text-[10px] text-mg-text-3">{t('enterprise.invite.linkHint')}</span>
              <span className="text-[10px] text-mg-warning flex items-center gap-1 mt-0.5">
                <LuTriangleAlert size={11} className="shrink-0" />
                {t('enterprise.invite.oneTimeNote', { role: inviteRole === 'tenant_admin' ? 'Admin' : 'Member' })}
              </span>
            </div>
            {canInvite && (
              <Button
                variant="outline"
                className="h-7 text-[10px] font-bold px-3 rounded-full border-mg-border/60 hover:bg-mg-fill-0"
                onClick={() => setShowResetConfirm(true)}
              >
                {t('enterprise.invite.resetLink')}
              </Button>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 p-2.5 rounded-lg border border-mg-border/40 bg-mg-fill-0/30 font-mono text-[11px] text-mg-text-2 overflow-hidden text-ellipsis whitespace-nowrap select-all">
                {inviteLinkUrl ?? <span className="text-mg-text-4 italic">…</span>}
              </div>
              <Button
                variant="brand"
                disabled={!inviteLinkUrl}
                onClick={handleCopyLink}
                className={`font-semibold h-9 px-4 rounded-lg text-xs transition-colors shrink-0 ${
                  linkCopied
                    ? 'border-mg-success bg-transparent text-mg-success hover:bg-mg-success/5'
                    : 'bg-brand-base text-white hover:bg-brand-base/90'
                }`}
              >
                {linkCopied ? t('enterprise.invite.copied') : t('enterprise.invite.copyLink')}
              </Button>
            </div>
          </div>
        </div>

        {/* 邮箱邀请 */}
        <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
            <div className="text-xs font-bold text-mg-text-1">{t('enterprise.invite.emailTitle')}</div>
            <span className="text-[10px] text-mg-text-3">{t('enterprise.invite.emailHint')}</span>
          </div>
          <div className="p-4 flex gap-2 items-end flex-wrap md:flex-nowrap">
            <div className="flex-1 min-w-[200px] space-y-1">
              <label className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.invite.emailTitle')}</label>
              <Input
                type="email"
                placeholder={t('enterprise.invite.emailPlaceholder')}
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMembers.mutate()}
                className="h-9 text-xs rounded-lg"
              />
            </div>
            {canInvite && (
              <Button
                variant="brand"
                loading={addMembers.isPending}
                className="font-semibold h-9 px-4 rounded-lg text-xs bg-brand-base text-white hover:bg-brand-base/90 shrink-0"
                onClick={() => addMembers.mutate()}
              >
                {t('enterprise.invite.sendInvite')}
              </Button>
            )}
          </div>
        </div>

        {/* 邀请队列 —— 后端无租户级邀请队列接口 → 占位空态 */}
        {/* TODO(后端待接): 租户级邀请队列接口（邮箱/角色/授权空间/邀请人/过期/状态 + 重发/撤销） */}
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
