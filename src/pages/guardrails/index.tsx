import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { LuPlus, LuSettings } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import {
  createGuardrail,
  deleteGuardrail,
  listGuardrails,
  updateGuardrail,
} from '@/services/guardrails'
import type { GuardrailDetail, CreateGuardrailRequest, UpdateGuardrailRequest } from '@/interfaces/guardrails'
import { formatDateTime } from '@/lib/format-date'

export default function GuardrailsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  // 列表加载
  const { data: guardrails = [], isLoading } = useQuery({
    queryKey: ['guardrails', activeWorkspaceId],
    queryFn: async () => {
      const res = await listGuardrails(activeWorkspaceId!)
      return res.items ?? []
    },
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  // 弹窗状态
  const [modalVisible, setModalVisible] = useState(false)
  const [editingGuardrail, setEditingGuardrail] = useState<GuardrailDetail | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // 表单状态
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [priority, setPriority] = useState<number>(0)

  // 动作突变
  const createMutation = useMutation({
    mutationFn: (payload: CreateGuardrailRequest) =>
      createGuardrail(activeWorkspaceId!, payload),
    onSuccess: () => {
      appToast.success(t('guardrails.toast.createSuccess'))
      closeModal()
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('guardrails.toast.createError'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateGuardrailRequest }) =>
      updateGuardrail(id, payload),
    onSuccess: () => {
      appToast.success(t('guardrails.toast.updateSuccess'))
      closeModal()
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('guardrails.toast.updateError'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGuardrail(id),
    onSuccess: () => {
      appToast.success(t('guardrails.toast.deleteSuccess'))
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('guardrails.toast.deleteError'))
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      updateGuardrail(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('guardrails.toast.toggleError'))
    },
  })

  function openCreate() {
    setEditingGuardrail(null)
    setName('')
    setDescription('')
    setIsDefault(false)
    setPriority(0)
    setModalVisible(true)
  }

  function openEdit(g: GuardrailDetail) {
    setEditingGuardrail(g)
    setName(g.name)
    setDescription(g.description ?? '')
    setIsDefault(g.is_default)
    setPriority(g.priority)
    setModalVisible(true)
  }

  function closeModal() {
    setModalVisible(false)
    setEditingGuardrail(null)
  }

  function handleSubmit() {
    if (!name.trim()) {
      appToast.error(t('guardrails.toast.nameRequired'))
      return
    }

    const payload: CreateGuardrailRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      is_default: isDefault,
      priority: priority,
    }

    if (editingGuardrail) {
      const updatePayload: UpdateGuardrailRequest = {
        name: payload.name,
        description: payload.description,
        is_default: payload.is_default,
        priority: payload.priority,
      }
      updateMutation.mutate({ id: editingGuardrail.id, payload: updatePayload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">{t('guardrails.title')}</h1>
          <p className="text-sm text-mg-text-1 mt-1.5 font-medium">
            {t('guardrails.desc')}
          </p>
        </div>
        <Button
          variant="brand"
          onClick={openCreate}
          className="rounded-full px-5 h-10 shadow-lg shadow-brand-glow/20"
        >
          <LuPlus className="w-4 h-4 mr-1.5" />
          {t('guardrails.create')}
        </Button>
      </div>

      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden">
        {isLoading ? (
          <div className="p-10 space-y-4 animate-pulse">
            <div className="h-6 bg-mg-fill-0 rounded w-1/4" />
            <div className="h-4 bg-mg-fill-0 rounded w-full" />
            <div className="h-4 bg-mg-fill-0 rounded w-5/6" />
          </div>
        ) : guardrails.length === 0 ? (
          <div className="py-20 text-center text-xs italic text-mg-text-2">
            {t('guardrails.empty')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('guardrails.table.name')}</TableHead>
                <TableHead>{t('guardrails.table.desc')}</TableHead>
                <TableHead>{t('guardrails.table.priority')}</TableHead>
                <TableHead>{t('guardrails.table.isDefault')}</TableHead>
                <TableHead>{t('guardrails.table.status')}</TableHead>
                <TableHead>{t('guardrails.table.createdAt')}</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guardrails.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-xs text-mg-text-1 max-w-xs truncate">
                    {row.description || <span className="text-mg-text-2">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-mg-text-1">
                    {row.priority}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_default ? 'success' : 'outline'}>
                      {row.is_default ? t('guardrails.table.defaultBadge') : t('guardrails.table.optionalBadge')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.status === 'active'}
                      onChange={(checked) =>
                        toggleMutation.mutate({
                          id: row.id,
                          status: checked ? 'active' : 'inactive',
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-xs text-mg-text-2">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(row)}
                        className="h-7 text-xs font-semibold"
                      >
                        <LuSettings className="w-3.5 h-3.5 mr-1" />
                        {t('guardrails.table.configure')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget({ id: row.id, name: row.name })}
                        className="h-7 text-xs"
                      >
                        {t('guardrails.table.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Form Modal */}
      <Modal
        open={modalVisible}
        onClose={closeModal}
        title={editingGuardrail ? t('guardrails.modal.editTitle') : t('guardrails.modal.createTitle')}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>
              {t('guardrails.modal.cancel')}
            </Button>
            <Button
              variant="brand"
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
            >
              {editingGuardrail ? t('guardrails.modal.saveEdit') : t('guardrails.modal.confirmCreate')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.nameLabel')}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('guardrails.form.namePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.priorityLabel')}</label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                placeholder={t('guardrails.form.priorityPlaceholder')}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.descLabel')}</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('guardrails.form.descPlaceholder')}
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-mg-border bg-mg-bg-1/40">
            <div>
              <label className="block text-xs font-bold text-mg-text-0 mb-0.5">{t('guardrails.form.isDefaultLabel')}</label>
              <span className="text-[11px] text-mg-text-2">{t('guardrails.form.isDefaultHint')}</span>
            </div>
            <Switch checked={isDefault} onChange={setIsDefault} />
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('guardrails.deleteModal.title')}
        description={t('guardrails.deleteModal.description', { name: deleteTarget?.name })}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('guardrails.deleteModal.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id)
                }
              }}
            >
              {t('guardrails.deleteModal.confirm')}
            </Button>
          </>
        }
      />
    </div>
  )
}
