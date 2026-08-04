import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { getTenant, listTenants, listTenantMembers, updateTenant, uploadTenantLogo } from '@/services/tenants'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AvatarUpload } from '@/components/ui/AvatarUpload'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { appToast } from '@/lib/app-toast'
import { trackAction } from '@/lib/track'
import { errorCodeOf } from '@/lib/request-error-message'
import { OrgDissolveModal } from './OrgDissolveModal'
import { OrgTransferModal } from './OrgTransferModal'

export function OrgInfoTab({
  tenantId,
  onDissolved,
}: {
  tenantId: string
  onDissolved?: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const { hasPermission } = usePermissions()
  // Logo/头像等「部分字段」Admin 可改（org.settings:edit）；企业更名与解散为 Owner 独占，
  // 分别走 org:rename / org:delete，避免 Admin 借 org.settings:edit 连带看到更名入口（需求方#153）。
  const canEditOrg = hasPermission(PERMS.ORG_SETTINGS_EDIT)
  const canRenameOrg = hasPermission(PERMS.ORG_RENAME)
  const canTransferOwnership = hasPermission(PERMS.ORG_OWNERSHIP_TRANSFER)
  const canDissolveOrg = hasPermission(PERMS.ORG_DELETE)
  const account = useAuthStore((s) => s.account)
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const tenantQuery = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => getTenant(tenantId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const membersQuery = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  // 已用工作空间数：TenantDetail 无该字段，从 tenants 列表项（TenantItem.current_workspace_count）取，
  // 与 useTenantRole 共享 ['tenants'] 缓存，不额外发请求
  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
  const usedWorkspaces = tenantsQuery.data?.items?.find((it) => it.tenant_id === tenantId)?.current_workspace_count

  const members = membersQuery.data?.items ?? []
  const owner = members.find((m) => m.role === 'tenant_owner')
  const transferableMembers = members.filter((m) => m.role !== 'tenant_owner')
  const usedMembers = members.length
  const tenant = tenantQuery.data

  const update = useMutation({
    mutationFn: () => updateTenant(tenantId, { name }),
    onSuccess: () => {
      // 企业更名保存埋点，event key = 权限体系 org:rename
      trackAction(PERMS.ORG_RENAME, undefined, { result: 'success' })
      appToast.success('组织名称已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setEditing(false)
    },
    onError: (err: Error) => {
      trackAction(PERMS.ORG_RENAME, undefined, { result: 'fail', error_code: errorCodeOf(err) })
      appToast.requestError(err, '更新失败')
    },
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadTenantLogo(tenantId, file),
    onSuccess: () => {
      // 企业 Logo 上传埋点，event key = 权限体系 org.settings:edit（与 Logo 上传入口的权限 gate canEditOrg 同源）
      trackAction(PERMS.ORG_SETTINGS_EDIT, undefined, { result: 'success' })
      appToast.success('企业头像已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (err: Error) => {
      trackAction(PERMS.ORG_SETTINGS_EDIT, undefined, { result: 'fail', error_code: errorCodeOf(err) })
      appToast.requestError(err, '上传失败，请重试')
    },
  })

  if (tenantQuery.isLoading) {
    return <div className="h-48 bg-mg-fill-1 rounded-lg animate-pulse" />
  }

  if (!tenant) return null

  const isPersonalTenant = tenant.type === 'personal'
  const personalAvatarFallback = (account?.display_name || account?.email || tenant.name || 'U').charAt(0).toUpperCase()

  return (
    <>
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-6 shadow-sm space-y-6">
        {/* 头像 */}
        <div className="flex items-center gap-4 pb-6 border-b border-mg-border/40">
          {isPersonalTenant ? (
            <Avatar className="h-16 w-16 border border-mg-border/50">
              {account?.avatar_url && <AvatarImage src={account.avatar_url} alt={account.display_name || ''} />}
              <AvatarFallback className="bg-brand-pale text-brand-base text-base font-bold">
                {personalAvatarFallback}
              </AvatarFallback>
            </Avatar>
          ) : (
            <AvatarUpload
              src={tenant.logo_url}
              fallback={tenant.name.charAt(0).toUpperCase()}
              size={64}
              loading={logoMutation.isPending}
              disabled={!canEditOrg}
              onUpload={(file) => logoMutation.mutate(file)}
            />
          )}
          <div className="space-y-1">
            <div className="text-sm font-bold text-mg-text-1">
              {isPersonalTenant ? (account?.display_name || tenant.name) : tenant.name}
            </div>
            <div className="text-xs text-mg-text-3">
              {isPersonalTenant ? t('enterprise.info.personalAvatarHint') : t('enterprise.info.avatarHint')}
            </div>
          </div>
        </div>

        {/* 组织名称 */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.info.orgName')}</label>
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && update.mutate()}
                autoFocus
                className="max-w-xl"
              />
              <Button
                variant="brand"
                disabled={update.isPending || name === tenant.name}
                onClick={() => update.mutate()}
                className="h-9 px-4 rounded-lg font-semibold text-xs bg-brand-base text-white hover:bg-brand-base/90"
              >
                {update.isPending ? '保存中...' : t('enterprise.members.save')}
              </Button>
              <Button variant="outline" className="h-9 px-3 rounded-lg text-xs" onClick={() => setEditing(false)}>{t('enterprise.members.cancel')}</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-mg-text-1">{tenant.name}</span>
              {canRenameOrg && (
                <button
                  type="button"
                  className="text-xs font-bold text-brand-base hover:text-brand-base/80 bg-transparent border-none p-0 cursor-pointer transition-colors"
                  onClick={() => { setName(tenant.name); setEditing(true) }}
                >
                  {t('enterprise.info.rename')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 信息网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-mg-border/40">
          <div className="space-y-1">
            <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.info.slug')}</label>
            <span className="font-mono text-xs text-mg-text-1">@{tenant.slug}</span>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.info.accountType')}</label>
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-glow/8 text-brand-base border border-brand-base/15">
                {tenant.type === 'personal' ? t('enterprise.summary.typePersonal') : t('enterprise.summary.typeEnterprise')}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.info.owner')}</label>
            {owner ? (
              <div className="flex items-center gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-semibold text-mg-text-1 truncate">{owner.account.display_name || '—'}</div>
                  <div className="text-xs text-mg-text-3 truncate">{owner.account.email}</div>
                </div>
                {canTransferOwnership && tenant.type === 'enterprise' && (
                  <button
                    type="button"
                    disabled={transferableMembers.length === 0}
                    title={transferableMembers.length === 0 ? t('enterprise.info.transferNoMembers') : undefined}
                    onClick={() => setTransferOpen(true)}
                    className="shrink-0 text-xs font-bold text-brand-base hover:text-brand-base/80 bg-transparent border-none p-0 cursor-pointer transition-colors disabled:text-mg-text-4 disabled:cursor-not-allowed"
                  >
                    {t('enterprise.info.transferOwner')}
                  </button>
                )}
              </div>
            ) : (
              <span className="text-xs text-mg-text-3">{membersQuery.isLoading ? '…' : '—'}</span>
            )}
          </div>
          <div className="space-y-1" />
          <div className="space-y-1">
            <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.info.maxWorkspaces')}</label>
            <span className="text-xs text-mg-text-1 font-medium">
              {(tenant.max_workspaces ?? '—')}
              {/* 已用工作空间：从 tenants 列表项 current_workspace_count 取（TenantDetail 无该字段） */}
              <span className="text-mg-text-3"> · {t('enterprise.info.usedWorkspaces')} {tenantsQuery.isLoading ? '…' : (usedWorkspaces ?? '—')}</span>
            </span>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">{t('enterprise.info.maxMembers')}</label>
            <span className="text-xs text-mg-text-1 font-medium">
              {(tenant.max_members ?? '—')} · {t('enterprise.info.usedMembers')} {membersQuery.isLoading ? '…' : usedMembers}
            </span>
          </div>
        </div>

        {canDissolveOrg && tenant.type === 'enterprise' && (
          <div className="pt-6 border-t border-mg-border/40">
            <div className="flex flex-col gap-4 rounded-md border border-mg-danger/25 bg-mg-danger/5 p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="text-xs font-bold text-mg-danger">{t('enterprise.info.dangerZone')}</div>
                <div className="text-xs leading-relaxed text-mg-text-2">
                  {t('enterprise.info.dissolveDesc')}
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 rounded-lg px-3 text-xs font-semibold"
                onClick={() => setDissolveOpen(true)}
              >
                解散组织
              </Button>
            </div>
          </div>
        )}
      </div>

      <OrgDissolveModal
        tenant={tenant}
        open={dissolveOpen}
        onOpenChange={setDissolveOpen}
        onDissolved={onDissolved}
      />
      <OrgTransferModal
        tenant={tenant}
        members={transferableMembers}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
    </>
  )
}
