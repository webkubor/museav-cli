import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackAction } from '@/lib/track'
import { errorCodeOf } from '@/lib/request-error-message'
import { updateWorkspace, deleteWorkspace } from '@/services/workspaces'
import type { WorkspaceDetail } from '@/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { appToast } from '@/lib/app-toast'

// 设置：基本信息（名称/Slug/描述）+ 危险操作（删除）
export function SettingsTab({ ws, onDeleted }: { ws: WorkspaceDetail; onDeleted: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  // 默认空间入口已迁到空间管理列表的卡片上（prd46#1209，原型 a4c9a2b 删掉了设置页这一行），本页不再出现
  const canRename = hasPermission(PERMS.WORKSPACE_RENAME)
  const canDelete = hasPermission(PERMS.WORKSPACE_DELETE)
  const canEditSettings = hasPermission(PERMS.WORKSPACE_SETTINGS_EDIT)
  const [name, setName] = useState(ws.name)
  const [description, setDescription] = useState(ws.description ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const fieldsChanged = (canRename && name.trim() !== ws.name)
    || (canEditSettings && description.trim() !== (ws.description ?? ''))
  const canSave = !!name.trim() && fieldsChanged

  const renameMutation = useMutation({
    mutationFn: () => updateWorkspace(ws.workspace_id, { name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      // 空间设置「保存」提交埋点（重命名/描述），event key = 权限体系 workspace:rename
      trackAction(PERMS.WORKSPACE_RENAME, { workspace_id: ws.workspace_id }, { result: 'success' })
      appToast.success(t('workspaces.detail.settings.renameSuccess'))
      qc.invalidateQueries({ queryKey: ['workspace-detail', ws.workspace_id] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: unknown) => {
      trackAction(PERMS.WORKSPACE_RENAME, { workspace_id: ws.workspace_id }, { result: 'fail', error_code: errorCodeOf(err) })
      appToast.requestError(err, t('workspaces.detail.settings.renameError'))
    },
  })
  const saving = renameMutation.isPending

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkspace(ws.workspace_id, { confirm_name: ws.name }),
    onSuccess: () => {
      // 删除空间确认提交埋点，event key = 权限体系 workspace:delete
      trackAction(PERMS.WORKSPACE_DELETE, { workspace_id: ws.workspace_id }, { result: 'success' })
      appToast.success(t('workspaces.detail.settings.deleteSuccess'))
      setDeleteOpen(false)
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      onDeleted()
    },
    onError: (err: unknown) => {
      trackAction(PERMS.WORKSPACE_DELETE, { workspace_id: ws.workspace_id }, { result: 'fail', error_code: errorCodeOf(err) })
      appToast.requestError(err, t('workspaces.detail.settings.deleteError'))
    },
  })

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 基本信息：名称 + Slug（只读）+ 描述 */}
      <div className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-6 shadow-xs space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">
            {t('workspaces.detail.settings.renameLabel')}
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canRename} className="max-w-xl" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">
            {t('workspaces.detail.settings.slugLabel')}
          </label>
          <span className="font-mono text-xs text-mg-text-3">@{ws.slug}</span>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-mg-text-2 uppercase tracking-wider block">
            {t('workspaces.detail.settings.descLabel')}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEditSettings}
            rows={3}
            placeholder={t('workspaces.detail.settings.descPlaceholder')}
            className="max-w-xl"
          />
        </div>
        {(canRename || canEditSettings) && (
          <Button
            variant="brand"
            disabled={saving || !canSave}
            loading={saving}
            onClick={() => renameMutation.mutate()}
            className="h-9 px-4 rounded-lg font-semibold text-xs"
          >
            {t('workspaces.detail.settings.save')}
          </Button>
        )}
      </div>

      {/* 危险操作 */}
      <div className="bg-mg-bg-0 border border-mg-danger/30 rounded-lg p-6 shadow-xs space-y-3">
        <div className="text-xs font-bold text-mg-danger uppercase tracking-wider">
          {t('workspaces.detail.settings.dangerTitle')}
        </div>
        {ws.is_default ? (
          <p className="text-xs text-mg-text-3">{t('workspaces.detail.settings.defaultCannotDelete')}</p>
        ) : canDelete ? (
          <>
            <p className="text-xs text-mg-text-3">{t('workspaces.detail.settings.deleteHint')}</p>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="h-9 px-4 rounded-lg font-semibold text-xs border-mg-danger/40 text-mg-danger hover:bg-mg-danger/5"
            >
              {t('workspaces.detail.settings.delete')}
            </Button>
          </>
        ) : null}
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title={t('workspaces.detail.settings.delete')}
        description={t('workspaces.detail.settings.deleteHint')}
        confirmLabel={t('workspaces.detail.settings.delete')}
        cancelLabel={t('workspaces.detail.settings.cancel')}
        variant="destructive"
        loading={deleteMutation.isPending}
        requireTyping={ws.name}
      />
    </div>
  )
}
