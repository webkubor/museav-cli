import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { dissolveTenant } from '@/services/tenants'
import { getSessionForActiveWorkspace } from '@/lib/auth/refresh-session'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { appToast } from '@/lib/app-toast'
import { trackAction } from '@/lib/track'
import { errorCodeOf } from '@/lib/request-error-message'
import { PERMS } from '@/config/permissions'
import type { TenantDetail } from '@/types'

export function OrgDissolveModal({
  tenant,
  open,
  onOpenChange,
  onDissolved,
}: {
  tenant: TenantDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onDissolved?: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const setAuth = useAuthStore((s) => s.setAuth)
  const qc = useQueryClient()
  const [confirmName, setConfirmName] = useState('')

  const dissolve = useMutation({
    mutationFn: () => dissolveTenant(tenant.tenant_id),
    onSuccess: async () => {
      // 解散组织确认提交埋点，event key = 权限体系 org:delete
      trackAction(PERMS.ORG_DELETE, undefined, { result: 'success' })
      appToast.success('组织已解散')
      onOpenChange(false)
      setConfirmName('')
      qc.removeQueries({ queryKey: ['tenant', tenant.tenant_id] })
      qc.removeQueries({ queryKey: ['tenant-members', tenant.tenant_id] })
      await qc.invalidateQueries({ queryKey: ['tenants'] })
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
      await onDissolved?.()
    },
    onError: (err: Error) => {
      trackAction(PERMS.ORG_DELETE, undefined, { result: 'fail', error_code: errorCodeOf(err) })
      appToast.requestError(err, '解散组织失败')
    },
  })

  const confirmMatched = confirmName.trim() === tenant.name

  return (
    <Modal
      open={open}
      onClose={() => {
        if (dissolve.isPending) return
        onOpenChange(false)
        setConfirmName('')
      }}
      size="md"
      title={t('enterprise.info.dissolveConfirmTitle')}
      description={t('enterprise.info.dissolveConfirmDesc', { name: tenant.name })}
      footer={(
        <>
          <Button
            variant="outline"
            disabled={dissolve.isPending}
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => {
              onOpenChange(false)
              setConfirmName('')
            }}
          >
            {t('enterprise.members.cancel')}
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
        <div className="rounded-lg border border-mg-danger/20 bg-mg-danger/5 p-3 text-xs leading-relaxed text-mg-text-2">
          {t('enterprise.info.dissolveWarn')}
        </div>
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-mg-text-2">
            {t('enterprise.info.orgName')}
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
  )
}
