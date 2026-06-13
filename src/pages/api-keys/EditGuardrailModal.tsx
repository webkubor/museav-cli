/**
 * 编辑 API Key 护栏弹窗：选择或取消绑定护栏
 * 后端 API Key 列表不返回 guardrail_id，需从护栏侧反查当前绑定关系。
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
  const [currentBoundId, setCurrentBoundId] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const guardrailsQuery = useQuery({
    queryKey: ['guardrails', workspaceId],
    queryFn: () => listGuardrails(workspaceId).then((res) => res.items ?? []),
    enabled: open && !!workspaceId,
  })

  const guardrails = guardrailsQuery.data ?? []

  useEffect(() => {
    if (!open || !apiKey || !guardrails.length) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResolving(true)

    Promise.all(
      guardrails.map((g) => g.id ? getGuardrail(g.id) : null)
    ).then((details) => {
      if (cancelled) return
      let boundId: string | null = null
      for (const d of details) {
        if (!d) continue
        const bound = d.assignments?.some(
          (a) => a.subject_type === 'api_key' && a.api_key_id === apiKey.api_key_id
        )
        if (bound && d.id) {
          boundId = d.id
          break
        }
      }
      setCurrentBoundId(boundId)
       
      setSelectedId(boundId ?? 'none')
      setResolving(false)
    }).catch(() => {
      if (!cancelled) setResolving(false)
    })

    return () => { cancelled = true }
  }, [open, apiKey?.api_key_id, guardrails.length])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!apiKey) return
      const newGuardrailId = selectedId === 'none' ? null : selectedId

      if (currentBoundId && currentBoundId !== newGuardrailId) {
        const detail = await getGuardrail(currentBoundId)
        const remaining = (detail.assignments ?? []).filter(
          (a) => !(a.subject_type === 'api_key' && a.api_key_id === apiKey.api_key_id)
        )
        await replaceAssignments(currentBoundId, remaining.map((a) => ({
          subject_type: a.subject_type,
          account_id: a.account_id,
          api_key_id: a.api_key_id,
        })))
      }

      if (newGuardrailId && newGuardrailId !== currentBoundId) {
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
      queryClient.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
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
            disabled={resolving}
            onClick={() => mutation.mutate()}
          >
            保存
          </Button>
        </>
      }
    >
      {resolving ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-mg-border border-t-mg-primary" />
        </div>
      ) : (
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
            const gId = g.id ?? ''
            const selected = selectedId === gId
            return (
              <button
                key={gId}
                type="button"
                onClick={() => setSelectedId(gId)}
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
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-sm font-semibold text-mg-text-0">{g.name}</span>
                  {g.is_default && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-mg-primary/10 text-mg-primary">默认</span>
                  )}
                  {currentBoundId === gId && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">当前</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
