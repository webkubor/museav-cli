import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listTenantMembers, removeTenantMember, updateTenantMemberRole } from '@/services/tenants'
import { formatDate } from '@/lib/format-date'
import { TENANT_ROLE_OPTIONS } from '@/constants/roles'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { appToast } from '@/lib/app-toast'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table'

export function MembersTab({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const qc = useQueryClient()
  const [removeTarget, setRemoveTarget] = useState<string | null>(null)

  const membersQuery = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => listTenantMembers(tenantId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const changeRole = useMutation({
    mutationFn: (values: { accountId: string; role: 'tenant_admin' | 'tenant_member' }) =>
      updateTenantMemberRole(tenantId, values.accountId, values.role),
    onSuccess: () => { appToast.success('角色已更新'); qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] }) },
    onError: (err: Error) => appToast.error(err?.message || '更新角色失败'),
  })

  const removeMember = useMutation({
    mutationFn: (accountId: string) => removeTenantMember(tenantId, accountId),
    onSuccess: () => {
      appToast.success('成员已移除')
      qc.invalidateQueries({ queryKey: ['tenant-members', tenantId] })
      setRemoveTarget(null)
    },
    onError: (err: Error) => appToast.error(err?.message || '移除成员失败'),
  })

  const members = membersQuery.data?.items ?? []

  return (
    <>
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg overflow-hidden shadow-sm">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-mg-border/50 bg-mg-fill-0/20">
          <span className="text-xs font-bold text-mg-text-0">组织成员</span>
          <span className="text-[10px] text-mg-text-2 bg-mg-fill-1 border border-mg-border/40 px-2 py-0.5 rounded-full font-medium">
            {membersQuery.isLoading ? '…' : `${members.length} 位成员`}
          </span>
        </div>

        {/* 成员列表 */}
        <div className="overflow-x-auto w-full p-2">
          {membersQuery.isLoading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名 / 邮箱</TableHead>
                  <TableHead>角色权限</TableHead>
                  <TableHead>加入时间</TableHead>
                  <TableHead align="center" className="w-16">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((record) => (
                  <TableRow key={record.account.account_id}>
                    <TableCell>
                      <div className="font-semibold text-mg-text-0">{record.account.display_name || '—'}</div>
                      <div className="text-[10px] text-mg-text-2 mt-0.5">{record.account.email}</div>
                    </TableCell>
                    <TableCell>
                      {record.role === 'tenant_owner' ? (
                        <span className="inline-block text-[10px] text-mg-text-2 font-bold bg-mg-fill-1 border border-mg-border/40 px-2.5 py-0.5 rounded-full">Owner</span>
                      ) : canManage ? (
                        <select
                          value={record.role}
                          onChange={(e) => changeRole.mutate({ accountId: record.account.account_id, role: e.target.value as 'tenant_admin' | 'tenant_member' })}
                          className="modern-input-field h-8 text-[11px] py-0 pr-8 pl-2 bg-mg-bg-0 border border-mg-border/40 rounded-lg w-[120px] font-semibold cursor-pointer"
                        >
                          {TENANT_ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-block text-[11px] text-mg-text-1 font-semibold px-2.5 py-0.5">
                          {TENANT_ROLE_OPTIONS.find((o) => o.value === record.role)?.label ?? record.role}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-mg-text-1 font-medium">
                      {formatDate(record.joined_at)}
                    </TableCell>
                    <TableCell align="center">
                      {record.role !== 'tenant_owner' && canManage ? (
                        <button
                          type="button"
                          onClick={() => setRemoveTarget(record.account.account_id)}
                          className="text-mg-text-2 hover:text-mg-danger hover:bg-mg-danger/5 p-1 rounded-lg transition-all border-none bg-transparent cursor-pointer font-bold text-xs"
                        >
                          ✕
                        </button>
                      ) : (
                        <span className="text-mg-text-3">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* 移除成员确认弹窗 */}
      <Modal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        size="sm"
        title="确认移除成员"
        description="移除后该成员将无法访问此组织及其下的工作区，此操作不可撤销。"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="h-8 px-3 rounded-lg text-xs" onClick={() => setRemoveTarget(null)}>
              取消
            </Button>
            <Button
              variant="brand"
              disabled={removeMember.isPending}
              onClick={() => removeMember.mutate(removeTarget!)}
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-mg-danger text-white hover:bg-mg-danger/90"
            >
              {removeMember.isPending ? '移除中...' : '确认移除'}
            </Button>
          </div>
        }
      />
    </>
  )
}
