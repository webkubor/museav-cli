import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { getTenant, listTenantMembers, updateTenant, uploadTenantLogo, dissolveTenant } from '@/services/tenants'
import { getSession } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { AvatarUpload } from '@/components/ui/AvatarUpload'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
import { appToast } from '@/lib/app-toast'

export function OrgInfoTab({
  tenantId,
  tenantRole,
  onDissolved,
}: {
  tenantId: string
  tenantRole?: 'tenant_owner' | 'tenant_admin' | 'tenant_member'
  onDissolved?: () => void | Promise<void>
}) {
  const { hasPermission } = usePermissions()
  const canEditOrg = hasPermission(PERMS.ORG_SETTINGS_EDIT)
  const canDissolveOrg = tenantRole === 'tenant_owner'
  const account = useAuthStore((s) => s.account)
  const setAuth = useAuthStore((s) => s.setAuth)
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')

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

  const owner = membersQuery.data?.items.find((m) => m.role === 'tenant_owner')
  const tenant = tenantQuery.data

  const update = useMutation({
    mutationFn: () => updateTenant(tenantId, { name }),
    onSuccess: () => {
      appToast.success('组织名称已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
      setEditing(false)
    },
    onError: (err: Error) => appToast.error(err?.message || '更新失败'),
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadTenantLogo(tenantId, file),
    onSuccess: () => {
      appToast.success('企业头像已更新')
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] })
      qc.invalidateQueries({ queryKey: ['tenants'] })
    },
    onError: (err: Error) => appToast.error(err?.message || '上传失败，请重试'),
  })

  const dissolve = useMutation({
    mutationFn: () => dissolveTenant(tenantId),
    onSuccess: async () => {
      appToast.success('组织已解散')
      setDissolveOpen(false)
      setConfirmName('')
      qc.removeQueries({ queryKey: ['tenant', tenantId] })
      qc.removeQueries({ queryKey: ['tenant-members', tenantId] })
      await qc.invalidateQueries({ queryKey: ['tenants'] })
      try {
        const session = await getSession()
        setAuth(
          session.account,
          session.active_tenant_id,
          session.tenants,
          session.active_workspace_id,
          session.permissions?.granted ?? null,
          session.permissions?.menus ?? []
        )
      } catch {
        await qc.invalidateQueries({ queryKey: ['auth-session'] })
      }
      await onDissolved?.()
    },
    onError: (err: Error) => appToast.error(err?.message || '解散组织失败'),
  })

  if (tenantQuery.isLoading) {
    return (
      <div className="h-48 bg-mg-fill-1 rounded-lg animate-pulse" />
    )
  }

  if (!tenant) return null

  const confirmMatched = confirmName.trim() === tenant.name
  const isPersonalTenant = tenant.type === 'personal'
  const personalAvatarFallback = (account?.display_name || account?.email || tenant.name || 'U').charAt(0).toUpperCase()

  return (
    <>
    <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-6 shadow-sm space-y-6">
      {/* 个人租户跟随账号头像；企业租户才有独立 logo */}
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
          <div className="text-sm font-bold text-mg-text-0">
            {isPersonalTenant ? (account?.display_name || tenant.name) : tenant.name}
          </div>
          <div className="text-xs text-mg-text-2">
            {isPersonalTenant
              ? '个人空间头像跟随账号头像，请在账号设置中修改'
              : '点击头像更换 · 支持 PNG/JPEG/WebP，最大 2MB'}
          </div>
        </div>
      </div>

      {/* 组织名称 */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">组织名称</label>
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && update.mutate()}
              autoFocus
              className="max-w-[280px] h-9 text-xs rounded-lg"
            />
            <Button
              variant="brand"
              disabled={update.isPending || name === tenant.name}
              onClick={() => update.mutate()}
              className="h-9 px-4 rounded-lg font-semibold text-xs bg-brand-base text-white hover:bg-brand-base/90"
            >
              {update.isPending ? '保存中...' : '保存'}
            </Button>
            <Button variant="outline" className="h-9 px-3 rounded-lg text-xs" onClick={() => setEditing(false)}>取消</Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-mg-text-0">{tenant.name}</span>
            {canEditOrg && (
              <button
                type="button"
                className="text-xs font-bold text-brand-base hover:text-brand-base/80 bg-transparent border-none p-0 cursor-pointer transition-colors"
                onClick={() => { setName(tenant.name); setEditing(true) }}
              >
                更名
              </button>
            )}
          </div>
        )}
      </div>

      {/* 信息网络 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-mg-border/40">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">唯一标识 (Slug)</label>
          <span className="font-mono text-xs text-mg-text-0">@{tenant.slug}</span>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">账户类型</label>
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-glow/8 text-brand-base border border-brand-base/15">
              {tenant.type === 'personal' ? '个人账户' : '企业组织'}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">Owner (所有者)</label>
          {owner ? (
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-mg-text-0">{owner.account.display_name || '—'}</div>
              <div className="text-[10px] text-mg-text-2">{owner.account.email}</div>
            </div>
          ) : (
            <span className="text-xs text-mg-text-2">{membersQuery.isLoading ? '…' : '—'}</span>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">最大工作区限制</label>
          <span className="text-xs text-mg-text-0 font-medium">{tenant.max_workspaces} 个</span>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">最大成员数限制</label>
          <span className="text-xs text-mg-text-0 font-medium">{tenant.max_members} 人</span>
        </div>
      </div>

      {canDissolveOrg && tenant.type === 'enterprise' && (
        <div className="pt-6 border-t border-mg-border/40">
          <div className="flex flex-col gap-4 rounded-md border border-mg-danger/25 bg-mg-danger/5 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-xs font-bold text-mg-danger">解散组织</div>
              <div className="text-xs leading-relaxed text-mg-text-1">
                解散后该组织和其工作区将停止访问，并从成员的组织列表中移除。
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

    <Modal
      open={dissolveOpen}
      onClose={() => {
        if (dissolve.isPending) return
        setDissolveOpen(false)
        setConfirmName('')
      }}
      size="md"
      title="确认解散组织"
      description={`请输入组织名称「${tenant.name}」确认解散。`}
      footer={(
        <>
          <Button
            variant="outline"
            disabled={dissolve.isPending}
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => {
              setDissolveOpen(false)
              setConfirmName('')
            }}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            loading={dissolve.isPending}
            disabled={!confirmMatched}
            className="h-8 rounded-lg px-4 text-xs font-semibold"
            onClick={() => dissolve.mutate()}
          >
            确认解散
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-mg-danger/20 bg-mg-danger/5 p-3 text-xs leading-relaxed text-mg-text-1">
          该操作会让所有成员失去此组织下工作区、密钥和配置入口的访问权限。
        </div>
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-mg-text-1">
            组织名称
          </label>
          <Input
            value={confirmName}
            disabled={dissolve.isPending}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={tenant.name}
            className="h-9 text-xs rounded-lg"
          />
        </div>
      </div>
    </Modal>
    </>
  )
}
