import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { transferOwnership } from '@/services/tenants'
import { getSessionForActiveWorkspace } from '@/lib/auth/refresh-session'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { appToast } from '@/lib/app-toast'
import { trackAction } from '@/lib/track'
import { errorCodeOf } from '@/lib/request-error-message'
import { PERMS } from '@/config/permissions'
import type { TenantDetail, TenantMember } from '@/types'

export function OrgTransferModal({
  tenant,
  members,
  open,
  onOpenChange,
}: {
  tenant: TenantDetail
  members: TenantMember[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const setAuth = useAuthStore((s) => s.setAuth)
  const qc = useQueryClient()
  const [transferTarget, setTransferTarget] = useState('')

  const transfer = useMutation({
    mutationFn: () => transferOwnership(tenant.tenant_id, transferTarget),
    onSuccess: async () => {
      // 转移企业所有权确认提交埋点，event key = 权限体系 org.ownership:transfer
      trackAction(PERMS.ORG_OWNERSHIP_TRANSFER, undefined, { result: 'success' })
      appToast.success(t('enterprise.info.transferSuccess'))
      onOpenChange(false)
      setTransferTarget('')
      await qc.invalidateQueries({ queryKey: ['tenant-members', tenant.tenant_id] })
      await qc.invalidateQueries({ queryKey: ['tenant', tenant.tenant_id] })
      // 所有权变更影响当前用户角色/权限，刷新会话让 UI 立即降级为管理员视图
      try {
        const session = await getSessionForActiveWorkspace()
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
    },
    onError: (err: Error) => {
      trackAction(PERMS.ORG_OWNERSHIP_TRANSFER, undefined, { result: 'fail', error_code: errorCodeOf(err) })
      appToast.requestError(err, '转移所有权失败')
    },
  })

  return (
    <Modal
      open={open}
      onClose={() => {
        if (transfer.isPending) return
        onOpenChange(false)
        setTransferTarget('')
      }}
      size="md"
      title={t('enterprise.info.transferConfirmTitle')}
      description={t('enterprise.info.transferConfirmDesc', { name: tenant.name })}
      footer={(
        <>
          <Button
            variant="outline"
            disabled={transfer.isPending}
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => {
              onOpenChange(false)
              setTransferTarget('')
            }}
          >
            {t('enterprise.members.cancel')}
          </Button>
          <Button
            variant="destructive"
            loading={transfer.isPending}
            disabled={!transferTarget}
            className="h-8 rounded-lg px-4 text-xs font-semibold"
            onClick={() => transfer.mutate()}
          >
            {t('enterprise.info.confirmTransfer')}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-mg-danger/20 bg-mg-danger/5 p-3 text-xs leading-relaxed text-mg-text-2">
          {t('enterprise.info.transferWarn')}
        </div>
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-mg-text-2">
            {t('enterprise.info.transferSelectLabel')}
          </label>
          <Select
            value={transferTarget}
            onChange={setTransferTarget}
            disabled={transfer.isPending}
            placeholder={t('enterprise.info.transferSelectPlaceholder')}
            className="h-9 text-xs rounded-lg"
          >
            {members.map((m) => (
              <Select.Option key={m.account.account_id} value={m.account.account_id}>
                {m.account.display_name || m.account.email}
              </Select.Option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  )
}
