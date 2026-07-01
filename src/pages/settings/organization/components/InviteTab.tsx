import { useState } from 'react'
import { useCopy } from '@/hooks/use-copy'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { useEmailAuthEnabled } from '@/hooks/use-platform-config'
import { PERMS } from '@/config/permissions'
import { addTenantMembers, getTenantInviteLink, resetTenantInviteLink } from '@/services/tenants'
import { TENANT_ROLE_OPTIONS } from '@/constants/roles'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { appToast } from '@/lib/app-toast'

export function InviteTab({ tenantId }: { tenantId: string }) {
  const { hasPermission } = usePermissions()
  const canInvite = hasPermission(PERMS.ORG_INVITE_MANAGE)
  // 写活：仅当平台启用邮箱（密码）登录时才展示邮箱邀请；国内以手机号为主、未启用邮箱时自动隐藏
  const emailInviteEnabled = useEmailAuthEnabled()
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

  const resetLink = useMutation({
    mutationFn: () => resetTenantInviteLink(tenantId),
    onSuccess: () => {
      appToast.success('邀请链接已重置')
      qc.invalidateQueries({ queryKey: ['tenant-invite-link', tenantId] })
      setShowResetConfirm(false)
    },
    onError: (err: Error) => appToast.error(err?.message || '重置失败'),
  })

  const addMembers = useMutation({
    mutationFn: () => addTenantMembers(tenantId, {
      emails: inviteEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
      role: inviteRole,
      expires_in_hours: expiresInHours,
    }),
    onSuccess: () => { appToast.success('邀请已发出'); setInviteEmails(''); setExpiresInHours(72); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: Error) => appToast.error(err?.message || '邀请失败'),
  })

  const inviteLinkUrl = inviteLinkQuery.data
    ? `${window.location.origin}/invitations/${inviteLinkQuery.data.token}`
    : null

  async function handleCopyLink() {
    if (!inviteLinkUrl) return
    await copyLink(inviteLinkUrl)
    appToast.success('邀请链接已复制')
  }

  return (
    <>
    <div className="space-y-6">
      {/* ── 邀请配置 ── */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-4 flex items-center justify-between flex-wrap gap-4 shadow-sm">
        <span className="text-xs font-bold text-mg-text-2 uppercase tracking-wider">邀请配置</span>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-mg-border/40 bg-mg-fill-0/30 text-[11px] text-mg-text-3 font-semibold">
            初始角色
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'tenant_admin' | 'tenant_member')}
              className="bg-transparent border-none outline-none font-bold text-[11px] ml-1 cursor-pointer text-mg-text-1"
            >
              {TENANT_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-mg-border/40 bg-mg-fill-0/30 text-[11px] text-mg-text-3 font-semibold">
            有效期
            <select
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="bg-transparent border-none outline-none font-bold text-[11px] ml-1 cursor-pointer text-mg-text-1"
            >
              <option value={24}>24 小时</option>
              <option value={72}>3 天</option>
              <option value={168}>7 天</option>
              <option value={720}>30 天</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 快速邀请链接 ── */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 border-b border-mg-border/50 bg-mg-fill-0/20 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-mg-text-1">快速邀请链接</div>
            <span className="text-[10px] text-mg-text-3">将此链接发送给同事，他们点击后可直接申请加入</span>
          </div>
          {canInvite && (
            <Button
              variant="outline"
              className="h-7 text-[10px] font-bold px-3 rounded-full border-mg-border/60 hover:bg-mg-fill-0"
              onClick={() => setShowResetConfirm(true)}
            >
              重置链接
            </Button>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 p-2.5 rounded-lg border border-mg-border/40 bg-mg-fill-0/30 font-mono text-[11px] text-mg-text-2 overflow-hidden text-overflow-ellipsis white-space-nowrap select-all">
              {inviteLinkUrl ?? <span className="text-mg-text-4 italic">加载中…</span>}
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
              {linkCopied ? '已复制' : '复制链接'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── 邮箱邀请（写活：仅在启用邮箱登录时展示） ── */}
      {emailInviteEnabled && (
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
        <div className="p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
          <div className="text-xs font-bold text-mg-text-1">邮箱邀请</div>
          <span className="text-[10px] text-mg-text-3">直接向特定邮箱发送邀请邮件</span>
        </div>
        <div className="p-4 flex gap-2 items-end flex-wrap md:flex-nowrap">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wider block">成员邮箱</label>
            <Input
              type="email"
              placeholder="example@company.com，多个用逗号分隔"
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMembers.mutate()}
              className="h-9 text-xs rounded-lg"
            />
          </div>
          {canInvite && (
            <Button
              variant="brand"
              className="font-semibold h-9 px-4 rounded-lg text-xs bg-brand-base text-white hover:bg-brand-base/90 shrink-0"
              onClick={() => addMembers.mutate()}
            >
              发送邀请
            </Button>
          )}
        </div>
      </div>
      )}
    </div>

    {/* 重置邀请链接确认弹窗 */}
    <Modal
      open={showResetConfirm}
      onClose={() => setShowResetConfirm(false)}
      size="sm"
      title="确认重置邀请链接"
      description="重置后当前邀请链接立即失效，确认重置？"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" onClick={() => setShowResetConfirm(false)}>
            取消
          </Button>
          <Button
            variant="brand"
            disabled={resetLink.isPending}
            onClick={() => resetLink.mutate()}
            className="h-8 px-4 rounded-lg text-xs font-semibold bg-brand-base text-white hover:bg-brand-base/90"
          >
            {resetLink.isPending ? '重置中...' : '确认重置'}
          </Button>
        </div>
      }
    />
    </>
  )
}
