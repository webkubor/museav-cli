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
import { listApiKeys, revealApiKey, revokeApiKey } from '@/services/api-keys'
import { useCopy } from '@/hooks/use-copy'
import { getRequestErrorMessage } from '@/lib/request-error-message'
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

  const apiKeyItems = pageItems(data)

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

  const { copy } = useCopy()
  const [copyingKeyId, setCopyingKeyId] = useState<string | null>(null)
  // #298 复制完整明文：reveal → 直接进剪贴板，明文不落组件状态、不渲染进 DOM。
  // Safari/WebKit 要求剪贴板写入发生在用户手势调用栈内，async 回调里再写必被
  // NotAllowedError 拒绝 —— 所以在点击栈内同步发起 ClipboardItem(promise) 写入
  //（WebKit 官方模式），把 reveal 请求的 promise 交给剪贴板；不支持的浏览器回退
  // 到「等明文 → 同步 copy」（Chrome/Firefox 场景，无手势门禁或窗口足够）。
  const handleCopyKey = useCallback(
    async (item: ApiKeyItem) => {
      if (copyingKeyId) return // 全表互斥：并发 reveal 会让剪贴板归属不可预期
      setCopyingKeyId(item.api_key_id)
      const plaintextPromise = revealApiKey(activeWorkspaceId, item.api_key_id).then((r) => r.key)
      // ClipboardItem 路径先同步失败时，plaintextPromise 的 rejection 需要有兜底
      // 消费者，避免 unhandled rejection。
      plaintextPromise.catch(() => {})
      try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
          await navigator.clipboard.write([
            new ClipboardItem({
              'text/plain': plaintextPromise.then((k) => new Blob([k], { type: 'text/plain' })),
            }),
          ])
        } else {
          const ok = await copy(await plaintextPromise)
          if (!ok) throw new DOMException('clipboard write failed', 'NotAllowedError')
        }
        appToast.success(t('apiKeys.toast.copyKeySuccess'))
      } catch {
        // 区分「reveal 请求失败」和「请求成功但剪贴板被拒」两种失败。
        const requestError = await plaintextPromise.then(
          () => null,
          (e: unknown) => e ?? new Error('reveal failed')
        )
        if (requestError) {
          appToast.error(getRequestErrorMessage(requestError, t('apiKeys.toast.copyKeyError')))
        } else {
          // 明文已拿到、ClipboardItem 被拒（罕见）：再试一次同步降级复制。
          const ok = await copy(await plaintextPromise)
          if (ok) appToast.success(t('apiKeys.toast.copyKeySuccess'))
          else appToast.error(t('apiKeys.toast.copyKeyClipboardError'))
        }
      } finally {
        setCopyingKeyId(null)
      }
    },
    [activeWorkspaceId, copy, copyingKeyId, t]
  )

  const filteredData = apiKeyItems.filter(
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
      <PageHeader title={t('apiKeys.title')} />

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
          <Button variant="brand" data-umami-event="create_api_key" onClick={() => { setCreateNonce((n) => n + 1); setCreateVisible(true) }} className="rounded-full px-6 h-10 shadow-lg shadow-brand-glow/20">
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
        onCopyKey={handleCopyKey}
        copyingKeyId={copyingKeyId}
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
