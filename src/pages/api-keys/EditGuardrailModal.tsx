/**
 * 编辑 API Key 护栏弹窗：选择或取消绑定护栏
 */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { listGuardrails, replaceAssignments, getGuardrail } from '@/services/guardrails'
import { appToast } from '@/lib/app-toast'
import type { ApiKeyItem } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  workspaceId: string
  apiKey: ApiKeyItem | null
}

export function EditGuardrailModal({ open, onClose, workspaceId, apiKey }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string>('none')

  const guardrailsQuery = useQuery({
    queryKey: ['guardrails', workspaceId],
    queryFn: () => listGuardrails(workspaceId),
    enabled: open && !!workspaceId,
  })

  const guardrails = guardrailsQuery.data?.items ?? []

  useEffect(() => {
    if (open && apiKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(apiKey.guardrail_id ?? 'none')
    }
  }, [open, apiKey])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!apiKey) return

      const oldGuardrailId = apiKey.guardrail_id
      const newGuardrailId = selectedId === 'none' ? null : selectedId

      if (oldGuardrailId && oldGuardrailId !== newGuardrailId) {
        const detail = await getGuardrail(oldGuardrailId)
        const remaining = (detail.assignments ?? []).filter(
          (a) => !(a.subject_type === 'api_key' && a.api_key_id === apiKey.api_key_id)
        )
        await replaceAssignments(oldGuardrailId, remaining.map((a) => ({
          subject_type: a.subject_type,
          account_id: a.account_id,
          api_key_id: a.api_key_id,
        })))
      }

      if (newGuardrailId && newGuardrailId !== oldGuardrailId) {
        const detail = await getGuardrail(newGuardrailId)
        const existing = (detail.assignments ?? []).some(
          (a) => a.subject_type === 'api_key' && a.api_key_id === apiKey.api_key_id
        )
        if (!existing) {
          const updated = [
            ...(detail.assignments ?? []).map((a) => ({
              subject_type: a.subject_type,
              account_id: a.account_id,
              api_key_id: a.api_key_id,
            })),
            { subject_type: 'api_key' as const, api_key_id: apiKey.api_key_id },
          ]
          await replaceAssignments(newGuardrailId, updated)
        }
      }
    },
    onSuccess: () => {
      appToast.success('护栏更新成功')
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      onClose()
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '护栏更新失败')
    },
  })

  if (!apiKey) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑护栏"
      description={`为 ${apiKey.name} 选择安全护栏`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('apiKeys.createModal.cancel')}
          </Button>
          <Button
            variant="brand"
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setSelectedId('none')}
          className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all"
          style={{
            borderColor: selectedId === 'none' ? 'var(--mg-primary)' : 'var(--mg-border)',
            background: selectedId === 'none' ? 'var(--mg-bg-1)' : 'transparent',
          }}
        >
          <div
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
            style={{ border: `2px solid ${selectedId === 'none' ? 'var(--mg-primary)' : 'var(--mg-border)'}` }}
          >
            {selectedId === 'none' && (
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--mg-primary)' }} />
            )}
          </div>
          <span className="text-sm text-mg-text-1">不绑定护栏</span>
        </button>

        {guardrails.map((g) => {
          const selected = selectedId === g.id
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedId(g.id)}
              className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all"
              style={{
                borderColor: selected ? 'var(--mg-primary)' : 'var(--mg-border)',
                background: selected ? 'var(--mg-bg-1)' : 'transparent',
              }}
            >
              <div
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{ border: `2px solid ${selected ? 'var(--mg-primary)' : 'var(--mg-border)'}` }}
              >
                {selected && (
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--mg-primary)' }} />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-mg-text-0">{g.name}</div>
                {g.is_default && (
                  <span className="text-[10px] font-bold text-mg-primary">默认</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
