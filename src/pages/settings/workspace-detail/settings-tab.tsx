import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackAction } from '@/lib/track'
import { errorCodeOf } from '@/lib/request-error-message'
import { updateWorkspace, deleteWorkspace } from '@/services/workspaces'
import type { WorkspaceDetail } from '@/types'
import { getProfile, setDefaultWorkspace } from '@/services/account'
import { Switch } from '@/components/ui/Switch'
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
  const profileQuery = useQuery({ queryKey: ['account-profile'], queryFn: getProfile })
  // 默认空间照原型（prd46#1206）：设置表单内一行，开关只改表单状态，点「保存」才提交；
  // 已是默认时开关置灰、不可关闭。写的仍是账户级偏好 POST /account/active-workspace
  // （#1097 现行契约；账户级 vs 租户级语义待产品裁定，见 prd46#1207）。
  const isDefault = profileQuery.data?.default_workspace_id === ws.workspace_id
  // 只记「用户在表单里想把哪个空间设为默认」，按 workspace_id 记：切到别的空间自动失效，无需 effect 同步
  const [wantDefaultFor, setWantDefaultFor] = useState<string | null>(null)
  const defaultChanged = !isDefault && wantDefaultFor === ws.workspace_id
  const canRename = hasPermission(PERMS.WORKSPACE_RENAME)
  const canDelete = hasPermission(PERMS.WORKSPACE_DELETE)
  const canEditSettings = hasPermission(PERMS.WORKSPACE_SETTINGS_EDIT)
  const [name, setName] = useState(ws.name)
  const [description, setDescription] = useState(ws.description ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const fieldsChanged = (canRename && name.trim() !== ws.name)
    || (canEditSettings && description.trim() !== (ws.description ?? ''))
  const canSave = !!name.trim() && (fieldsChanged || defaultChanged)

  const renameMutation = useMutation({
    mutationFn: () => updateWorkspace(ws.workspace_id, { name: name.trim(), description: description.trim() }),
    onSuccess: () => {
      // 空间设置「保存」提交埋点（重命名/描述），event key = 权限体系 workspace:rename
      trackAction(PERMS.WORKSPACE_RENAME, { workspace_id: ws.workspace_id }, { result: 'success' })
      qc.invalidateQueries({ queryKey: ['workspace-detail', ws.workspace_id] })
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: unknown) => {
      trackAction(PERMS.WORKSPACE_RENAME, { workspace_id: ws.workspace_id }, { result: 'fail', error_code: errorCodeOf(err) })
      appToast.requestError(err, t('workspaces.detail.settings.renameError'))
    },
  })
  const preferenceMutation = useMutation({
    mutationFn: () => setDefaultWorkspace({ workspace_id: ws.workspace_id }),
    // 等 profile 拉回再结束 pending：否则拉回前 isDefault 仍是 false，开关和「保存」会短暂解锁，能重复提交
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['account-profile'] })
      setWantDefaultFor(null)
    },
    onError: (err: unknown) => appToast.requestError(err, t('workspaces.detail.settings.preferenceError')),
  })
  const saving = renameMutation.isPending || preferenceMutation.isPending

  // 一个「保存」提交表单里改过的全部内容；任一项失败只报那一项，成功的不回滚
  async function save() {
    const tasks: Promise<unknown>[] = []
    if (fieldsChanged) tasks.push(renameMutation.mutateAsync())
    if (defaultChanged) tasks.push(preferenceMutation.mutateAsync())
    const results = await Promise.allSettled(tasks)
    if (results.length > 0 && results.every((r) => r.status === 'fulfilled')) {
      appToast.success(t(
        fieldsChanged && defaultChanged ? 'workspaces.detail.settings.settingsSaved'
          : defaultChanged ? 'workspaces.detail.settings.preferenceSaved'
            : 'workspaces.detail.settings.renameSuccess',
      ))
    }
  }

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
        {/* 默认空间：描述之下、保存之上的一行（原型 WorkspaceSettingsTab）。账户偏好人人可设，不受空间编辑权限限制 */}
        <div className="flex items-center justify-between gap-4 border-t border-mg-fill-0 pt-4">
          <div className="min-w-0">
            <label htmlFor="default-workspace" className="text-xs font-bold text-mg-text-2 block">
              {t('workspaces.detail.settings.defaultWorkspace')}
            </label>
            <p className="mt-1 text-xs text-mg-text-3">
              {isDefault ? t('workspaces.detail.settings.defaultWorkspaceCurrent') : t('workspaces.detail.settings.defaultWorkspaceHint')}
            </p>
          </div>
          {profileQuery.data && !profileQuery.isError && (
            <Switch
              id="default-workspace"
              checked={isDefault || defaultChanged}
              disabled={isDefault || saving || profileQuery.isFetching}
              onCheckedChange={(on) => setWantDefaultFor(on ? ws.workspace_id : null)}
            />
          )}
        </div>
        {profileQuery.isPending && <p role="status" className="text-xs text-mg-text-3">{t('common.loading')}</p>}
        {profileQuery.isError && (
          <div className="flex items-center justify-between gap-3">
            <p role="alert" className="text-xs text-mg-danger">{t('workspaces.detail.settings.preferenceError')}</p>
            <Button variant="secondary" size="small" onClick={() => { void profileQuery.refetch() }}>{t('common.retry')}</Button>
          </div>
        )}
        <Button
          variant="brand"
          disabled={saving || !canSave}
          loading={saving}
          onClick={() => { void save() }}
          className="h-9 px-4 rounded-lg font-semibold text-xs"
        >
          {t('workspaces.detail.settings.save')}
        </Button>
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
