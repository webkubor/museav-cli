/**
 * API Key 管理页
 * 路由：/api-keys
 * API：GET/POST/DELETE /api/v1/workspaces/:workspace_id/api-keys
 */

import { useState, useCallback } from 'react'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { LuSearch, LuPlus } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getMarketConfig } from '@/config/market'
import { listApiKeys, revokeApiKey } from '@/services/api-keys'
import { listGuardrails } from '@/services/guardrails'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { appToast } from '@/lib/app-toast'
import { useMarket } from '@/hooks/useMarket'
import { pageItems } from '@/lib/utils'
import { AccessCenterCard } from './AccessCenterCard'
import { ConnectModal } from './ConnectModal'
import { CreateKeyModal } from './CreateKeyModal'
import { ApiKeyTable } from './ApiKeyTable'
import { EditKeyModal } from './EditKeyModal'
import type { ApiKeyItem } from '@/types'

export default function ApiKeysPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const market = useMarket()
  const docsUrl = getMarketConfig(market).docsUrl
  const [searchValue, setSearchValue] = useState('')
  const [createVisible, setCreateVisible] = useState(false)
  const [createNonce, setCreateNonce] = useState(0)
  const [revealVisible, setRevealVisible] = useState(false)
  const [connectVisible, setConnectVisible] = useState(false)
  const [createdKeyText, setCreatedKeyText] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [editGuardrailKey, setEditGuardrailKey] = useState<ApiKeyItem | null>(null)

  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId) || '01HV3KWS000000000000001'
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMS.API_KEYS_CREATE)
  const canRevoke = hasPermission(PERMS.API_KEYS_REVOKE)

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId).then(pageItems),
    enabled: !!activeWorkspaceId,
  })

  const { data: guardrailsData } = useQuery({
    queryKey: ['guardrails', activeWorkspaceId],
    queryFn: () => listGuardrails(activeWorkspaceId).then((res) => res.items ?? []),
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
  })
  // 反查：api_key_id → 非默认护栏名称列表（默认护栏全局生效，不单独展示）
  const guardrailsByKey: Record<string, string[]> = {}
  for (const g of (Array.isArray(guardrailsData) ? guardrailsData : []) as GuardrailDetail[]) {
    if (g.is_default) continue
    for (const a of g.assignments ?? []) {
      if (a.subject_type === 'api_key' && a.api_key_id) {
        guardrailsByKey[a.api_key_id] ??= []
        guardrailsByKey[a.api_key_id].push(g.name)
      }
    }
  }

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      appToast.success(t('apiKeys.toast.revokeSuccess'))
      setRevokeTarget(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('apiKeys.toast.revokeError'))
    },
  })

  const filteredData = pageItems(data).filter(
    (item) =>
      item.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      (item.masked ?? '').toLowerCase().includes(searchValue.toLowerCase())
  )

  const handleKeyCreated = useCallback((keyText: string) => {
    setCreateVisible(false)
    setCreatedKeyText(keyText)
    setRevealVisible(true)
  }, [])

  const openAIBaseUrl = GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''
  const anthropicBaseUrl = GATEWAY_ENDPOINTS[1]?.baseUrl ?? openAIBaseUrl

  return (
    <div className="space-y-6">
      <PageHeader title={t('apiKeys.title')} description={t('apiKeys.desc')} />

      <AccessCenterCard
        docsUrl={docsUrl}
        onOpenConnect={() => setConnectVisible(true)}
        revealVisible={revealVisible}
        createdKeyText={createdKeyText}
        onDismissReveal={() => setRevealVisible(false)}
      />

      {/* 搜索 + 创建 */}
      <div className="flex justify-between items-center gap-4">
        <Input
          variant="search"
          prefix={<LuSearch className="w-4 h-4" />}
          placeholder={t('apiKeys.search')}
          className="w-72"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        {canCreate && (
          <Button variant="brand" onClick={() => { setCreateNonce((n) => n + 1); setCreateVisible(true) }} className="rounded-full px-6 h-10 shadow-lg shadow-brand-glow/20">
            <LuPlus className="w-4 h-4 mr-1.5" />
            {t('apiKeys.create')}
          </Button>
        )}
      </div>

      <ApiKeyTable
        isLoading={isLoading}
        items={filteredData}
        canRevoke={canRevoke}
        onRevoke={setRevokeTarget}
        onEditGuardrail={setEditGuardrailKey}
        guardrailsByKey={guardrailsByKey}
      />

      <ConnectModal
        open={connectVisible}
        onClose={() => setConnectVisible(false)}
        openAIBaseUrl={openAIBaseUrl}
        anthropicBaseUrl={anthropicBaseUrl}
        createdKeyText={createdKeyText}
        docsUrl={docsUrl}
      />

      <CreateKeyModal
        key={createNonce}
        open={createVisible}
        onClose={() => setCreateVisible(false)}
        workspaceId={activeWorkspaceId}
        onCreated={handleKeyCreated}
      />

      {/* 撤销确认 Modal */}
      <Modal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title={t('apiKeys.revokeConfirm.title')}
        description={t('apiKeys.revokeConfirm.content')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              {t('apiKeys.createModal.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={revokeMutation.isPending}
              onClick={() => { if (revokeTarget) revokeMutation.mutate(revokeTarget.id) }}
            >
              {t('apiKeys.table.revoke')}
            </Button>
          </>
        }
      />
      <EditKeyModal
        open={!!editGuardrailKey}
        onClose={() => setEditGuardrailKey(null)}
        workspaceId={activeWorkspaceId}
        apiKey={editGuardrailKey}
      />
    </div>
  )
}
