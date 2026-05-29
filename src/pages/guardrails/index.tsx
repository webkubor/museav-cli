import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog'
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
      appToast.success('安全护栏已创建')
      closeModal()
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '创建失败')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateGuardrailRequest }) =>
      updateGuardrail(id, payload),
    onSuccess: () => {
      appToast.success('安全护栏已更新')
      closeModal()
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '更新失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGuardrail(id),
    onSuccess: () => {
      appToast.success('安全护栏已删除')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '删除失败')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      updateGuardrail(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '操作失败')
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
      appToast.error('请输入名称')
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
          <h1 className="text-2xl font-bold tracking-tight text-semi-color-text-0">安全护栏</h1>
          <p className="text-sm text-semi-color-text-1 mt-1.5 font-medium">
            配置提示词防御规则，拦截恶意的提示注入、敏感词以及不受控制的模型输出。
          </p>
        </div>
        <Button
          variant="brand"
          onClick={openCreate}
          className="rounded-full px-5 h-10 shadow-lg shadow-brand-glow/20"
        >
          <LuPlus className="w-4 h-4 mr-1.5" />
          创建护栏
        </Button>
      </div>

      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-semi-color-border overflow-hidden">
        {isLoading ? (
          <div className="p-10 space-y-4 animate-pulse">
            <div className="h-6 bg-semi-color-fill-0 rounded w-1/4" />
            <div className="h-4 bg-semi-color-fill-0 rounded w-full" />
            <div className="h-4 bg-semi-color-fill-0 rounded w-5/6" />
          </div>
        ) : guardrails.length === 0 ? (
          <div className="py-20 text-center text-xs italic text-semi-color-text-2">
            暂无安全护栏，点击右上角创建一个
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>默认应用</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guardrails.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold text-semi-color-text-0 text-[13.5px]">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-xs text-semi-color-text-1 max-w-xs truncate">
                    {row.description || <span className="text-semi-color-text-2">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-semi-color-text-1">
                    {row.priority}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_default ? 'success' : 'outline'}>
                      {row.is_default ? '默认应用' : '可选'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.status === 'active'}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({
                          id: row.id,
                          status: checked ? 'active' : 'inactive',
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-xs text-semi-color-text-2">
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
                        配置
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget({ id: row.id, name: row.name })}
                        className="h-7 text-xs"
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={modalVisible} onOpenChange={setModalVisible}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingGuardrail ? '配置护栏' : '创建护栏'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-semi-color-text-1 mb-2">名称</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：提示词注入防御"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-semi-color-text-1 mb-2">优先级</label>
                <Input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  placeholder="例如：0"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-semi-color-text-1 mb-2">描述 (可选)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="对此安全规则进行简要描述"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-semi-color-border bg-semi-color-bg-1/40">
              <div>
                <label className="block text-xs font-bold text-semi-color-text-0 mb-0.5">默认应用</label>
                <span className="text-[11px] text-semi-color-text-2">自动应用此护栏到所有模型请求</span>
              </div>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeModal}>
              取消
            </Button>
            <Button
              variant="brand"
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
            >
              {editingGuardrail ? '保存修改' : '确认创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>删除护栏</DialogTitle>
            <DialogDescription>
              确定要删除安全护栏「{deleteTarget?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
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
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
