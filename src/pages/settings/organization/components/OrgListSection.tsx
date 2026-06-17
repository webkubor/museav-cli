import { createOrganization } from '@/services/organizations'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuPlus } from 'react-icons/lu'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { listTenantMembers, listTenants } from '@/services/tenants'
import type { TenantItem } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { appToast } from '@/lib/app-toast'
import { MAX_TENANTS } from '../constants'
import { RoleBadge } from './RoleBadge'

function TenantMemberCountBadge({ tenantId }: { tenantId: string }) {
  const membersQuery = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  if (membersQuery.isLoading) {
    return <span className="text-[10px] text-mg-text-2 shrink-0">· 成员 …</span>
  }

  const count = membersQuery.data?.items.length ?? 0
  return (
    <span className="text-[10px] text-mg-text-2 shrink-0">
      · 成员 {count} 人
    </span>
  )
}

interface OrgListSectionProps {
  selectedId: string | null
  onSelect: (id: string) => void
}

export function OrgListSection({ selectedId, onSelect }: OrgListSectionProps) {
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canCreateOrg = hasPermission(PERMS.ORG_SETTINGS_EDIT)
  const [createVisible, setCreateVisible] = useState(false)
  const [newName, setNewName] = useState('')

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
    staleTime: 30_000,
  })

  const tenants = (tenantsQuery.data?.items ?? []).filter((t) => t.type !== 'personal')
  const atLimit = tenants.length >= MAX_TENANTS
  const alreadyOwns = tenants.some((t) => t.role === 'tenant_owner')

  const createMutation = useMutation({
    // 企业组织创建走 POST /organizations（slug 由后端从 name 派生）；
    // 原 createTenant(POST /tenants) 后端从未注册，必 404（#92/#99 修正）。
    mutationFn: () => createOrganization({ name: newName.trim() }),
    onSuccess: (org) => {
      appToast.success(`组织「${org.name}」已创建`)
      setCreateVisible(false)
      setNewName('')
      qc.invalidateQueries({ queryKey: ['tenants'] })
      onSelect(org.tenant_id)
    },
    onError: (err: Error) => {
      appToast.error(err?.message || '创建失败')
    },
  })

  function handleCreate() {
    if (!newName.trim()) { appToast.error('组织名称不能为空'); return }
    createMutation.mutate()
  }

  // 生成具有渐变质感的文字 Fallback 圆角头像
  const getFallbackAvatar = (name: string, id: string) => {
    const firstLetter = name.charAt(0).toUpperCase();
    const gradients = [
      'from-blue-500 to-indigo-600',
      'from-emerald-500 to-teal-600',
      'from-orange-500 to-amber-600',
      'from-rose-500 to-pink-600',
      'from-purple-500 to-violet-600',
    ];
    const index = Math.abs(id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % gradients.length;
    const bgGradient = gradients[index];
    return (
      <div className={`w-10 h-10 rounded-md bg-gradient-to-br ${bgGradient} flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0`}>
        {firstLetter}
      </div>
    );
  };

  return (
    <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg shadow-xs overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-mg-text-0">我的组织</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
            atLimit ? 'bg-mg-danger/10 text-mg-danger border border-mg-danger/20' : 'bg-mg-fill-1 text-mg-text-2 border border-mg-border/40'
          }`}>
            {tenants.length} / {MAX_TENANTS}
          </span>
        </div>
        {canCreateOrg && !alreadyOwns && !atLimit && (
          <Button
            variant="brand"
            onClick={() => setCreateVisible(true)}
            className="rounded-full text-[11px] font-semibold h-7 px-3 flex items-center gap-1 bg-brand-base text-white hover:bg-brand-base/90 active:scale-[0.97] transition-all"
          >
            <LuPlus size={12} />
            创建组织
          </Button>
        )}
      </div>

      {/* 组织卡片列表 */}
      <div className="p-3 space-y-2">
        {tenantsQuery.isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="py-8 text-center text-xs text-mg-text-2">
            暂无组织，请先创建一个组织
          </div>
        ) : (
          tenants.map((record: TenantItem) => {
            const isSelected = selectedId === record.tenant_id;
            return (
              <div
                key={record.tenant_id}
                onClick={() => onSelect(record.tenant_id)}
                className={`relative flex items-start gap-3 p-3 rounded-md border transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'border-brand-base bg-brand-glow/8 shadow-[0_4px_12px_rgba(var(--brand-base-rgb),0.04)] translate-x-[2px]'
                    : 'border-mg-border/40 bg-mg-bg-0 hover:border-brand-base/20 hover:bg-mg-fill-0 hover:translate-x-[2px] active:scale-[0.98]'
                }`}
              >
                {/* 选中流光左侧边 */}
                {isSelected && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-md bg-brand-base animate-pulse" />
                )}

                {/* 组织头像 */}
                {record.logo_url ? (
                  <img
                    src={record.logo_url}
                    alt={record.name}
                    className="w-10 h-10 rounded-md object-cover border border-mg-border/50 shadow-sm shrink-0"
                  />
                ) : (
                  getFallbackAvatar(record.name, record.tenant_id)
                )}

                {/* 卡片信息 */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-mg-text-0 truncate">
                        {record.name}
                      </span>
                      {record.is_default && (
                        <Badge variant="secondary" size="xs" className="shrink-0">默认</Badge>
                      )}
                    </div>
                    <RoleBadge role={record.role} />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-mg-text-2">
                    <span className="font-mono truncate max-w-[80px]">@{record.slug}</span>
                    <span className="flex items-center gap-1">
                      <span>工作区 {record.current_workspace_count ?? 0}/{record.max_workspaces ?? '—'}</span>
                      <TenantMemberCountBadge tenantId={record.tenant_id} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 创建新组织 Modal */}
      {createVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setCreateVisible(false)} />
          <div className="relative bg-card-bg modal-glow-flow rounded-lg w-full max-w-[420px] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-mg-border flex justify-between items-center bg-mg-fill-0/30">
              <h2 className="text-sm font-bold text-mg-text-0">创建新组织</h2>
              <button className="text-mg-text-2 hover:text-mg-text-0 text-xs font-bold transition-colors" onClick={() => setCreateVisible(false)}>✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-mg-text-1 uppercase tracking-wider block">组织名称</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如：我的团队" className="rounded-lg w-full text-xs h-9" />
              </div>
            </div>
            <div className="p-4 border-t border-mg-border flex justify-end gap-2 bg-mg-fill-0/30">
              <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" onClick={() => setCreateVisible(false)}>取消</Button>
              <Button
                variant="brand"
                className="h-8 px-4 rounded-lg text-xs font-semibold bg-brand-base text-white hover:bg-brand-base/90"
                disabled={createMutation.isPending}
                onClick={handleCreate}
              >
                {createMutation.isPending ? '创建中...' : '确认创建'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
