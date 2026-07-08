/**
 * API Key 管理页（PRD v1.0.3）
 * 路由：/workspace/:workspaceId/api-keys
 * API：GET/POST/DELETE/PATCH /api/v1/workspaces/:workspace_id/api-keys（+ enable/disable/change-owner/reveal）
 * 作用域=当前工作空间，行可见性按角色由后端裁剪（#358/#359）。
 */

import { useMemo, useState, useCallback } from 'react'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select, SelectItem } from '@/components/ui/Select'
import { PageHeader } from '@/components/ui/PageHeader'
import { LuSearch, LuPlus } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getMarketConfig } from '@/config/market'
import {
  listApiKeys,
  revealApiKey,
  revokeApiKey,
  disableApiKey,
  enableApiKey,
  changeApiKeyOwner,
  getApiKeySummary,
} from '@/services/api-keys'
import { listWorkspaceMembers } from '@/services/workspaces'
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
import { ApiKeySummaryCards } from './ApiKeySummaryCards'
import { ApiKeyDetailDrawer } from './ApiKeyDetailDrawer'
import { deriveKeyType, responsibleOf } from './derive'
import type { ApiKeyItem, ApiKeyType } from '@/types'

const ALL = 'all'

export default function ApiKeysPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const market = useMarket()
  const docsUrl = getMarketConfig(market).docsUrl
  const [searchValue, setSearchValue] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL)
  const [createVisible, setCreateVisible] = useState(false)
  const [createNonce, setCreateNonce] = useState(0)
  const [revealVisible, setRevealVisible] = useState(false)
  const [connectVisible, setConnectVisible] = useState(false)
  const [createdKeyText, setCreatedKeyText] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [disableTarget, setDisableTarget] = useState<ApiKeyItem | null>(null)
  const [editGuardrailKey, setEditGuardrailKey] = useState<ApiKeyItem | null>(null)
  const [detailKey, setDetailKey] = useState<ApiKeyItem | null>(null)
  const [changeOwnerTarget, setChangeOwnerTarget] = useState<ApiKeyItem | null>(null)
  const [newOwnerId, setNewOwnerId] = useState('')

  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId) || '01HV3KWS000000000000001'
  const currentAccountId = useAuthStore((state) => state.account?.account_id)
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMS.API_KEYS_CREATE)
  const canRevoke = hasPermission(PERMS.API_KEYS_REVOKE)
  // 管理权（停用/启用/变更负责人）——权限系统未细分时以 revoke 为代管理位；后端 can_* 会覆盖
  const canManage = canRevoke

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId).then(pageItems),
    enabled: !!activeWorkspaceId,
  })

  // 摘要卡：后端 /summary（#383）未交付时静默降级（catch→undefined，避免全局错误 toast），
  // 由 SummaryCards 从列表派生兜底。
  const { data: summary } = useQuery({
    queryKey: ['api-keys-summary', activeWorkspaceId],
    queryFn: () => getApiKeySummary(activeWorkspaceId).catch(() => undefined),
    enabled: !!activeWorkspaceId,
    retry: false,
  })

  const apiKeyItems = pageItems(data)
  // #358 角色可见性：可见范围完全由后端返回的行决定（成员只回自己的，此处据「返回是否含他人」派生页头提示）
  const showsOthers = apiKeyItems.some(
    (k) => k.owner?.account_id && k.owner.account_id !== currentAccountId,
  )
  const distinctOwnerCount = new Set(apiKeyItems.map((k) => k.owner?.account_id).filter(Boolean)).size

  // 负责人筛选项（当前列表内去重）
  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>()
    apiKeyItems.forEach((k) => {
      const r = responsibleOf(k)
      if (r.account_id) map.set(r.account_id, r.display_name || r.email || r.account_id)
    })
    return [...map.entries()].map(([id, label]) => ({ id, label }))
  }, [apiKeyItems])

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      appToast.success(t('apiKeys.toast.revokeSuccess'))
      setRevokeTarget(null)
      setDetailKey(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: unknown) => appToast.requestError(err, t('apiKeys.toast.revokeError')),
  })

  const enableMutation = useMutation({
    mutationFn: (keyId: string) => enableApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      appToast.success('已启用')
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: unknown) => appToast.requestError(err, '启用失败'),
  })

  const disableMutation = useMutation({
    mutationFn: (keyId: string) => disableApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      appToast.success('已停用')
      setDisableTarget(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: unknown) => appToast.requestError(err, '停用失败'),
  })

  const handleToggleStatus = useCallback((item: ApiKeyItem) => {
    if (item.status === 'disabled') enableMutation.mutate(item.api_key_id)
    else setDisableTarget(item)
  }, [enableMutation])

  // 变更负责人（change-owner 端点已就绪）
  const membersQuery = useQuery({
    queryKey: ['workspace-members', activeWorkspaceId],
    queryFn: () => listWorkspaceMembers(activeWorkspaceId, { page_size: 100 }),
    enabled: !!activeWorkspaceId && !!changeOwnerTarget,
    staleTime: 60_000,
  })
  const changeOwnerMutation = useMutation({
    mutationFn: () => changeApiKeyOwner(activeWorkspaceId, changeOwnerTarget!.api_key_id, { new_owner_account_id: newOwnerId }),
    onSuccess: () => {
      appToast.success('负责人已变更')
      setChangeOwnerTarget(null)
      setNewOwnerId('')
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: unknown) => appToast.requestError(err, '变更负责人失败'),
  })

  const { copy } = useCopy()
  const [copyingKeyId, setCopyingKeyId] = useState<string | null>(null)
  // #298 复制完整明文：reveal → 剪贴板（WebKit 手势栈内 ClipboardItem 模式，明文不落 state）
  const handleCopyKey = useCallback(
    async (item: ApiKeyItem) => {
      if (copyingKeyId) return
      setCopyingKeyId(item.api_key_id)
      const plaintextPromise = revealApiKey(activeWorkspaceId, item.api_key_id).then((r) => r.key)
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
        const requestError = await plaintextPromise.then(() => null, (e: unknown) => e ?? new Error('reveal failed'))
        if (requestError) {
          appToast.error(getRequestErrorMessage(requestError, t('apiKeys.toast.copyKeyError')))
        } else {
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

  const filteredData = useMemo(() => {
    const q = searchValue.toLowerCase()
    return apiKeyItems.filter((item) => {
      if (q) {
        const r = responsibleOf(item)
        const hay = `${item.name} ${item.masked ?? ''} ${r.display_name ?? ''} ${r.email ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (typeFilter !== ALL && deriveKeyType(item) !== typeFilter) return false
      if (statusFilter !== ALL && item.status !== statusFilter) return false
      if (ownerFilter !== ALL && responsibleOf(item).account_id !== ownerFilter) return false
      return true
    })
  }, [apiKeyItems, searchValue, typeFilter, statusFilter, ownerFilter])

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

      <ApiKeySummaryCards items={apiKeyItems} summary={summary} loading={isLoading} />

      {/* 工具条：搜索 + 类型/状态/负责人 筛选 + 创建 */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          variant="search"
          prefix={<LuSearch className="w-4 h-4" />}
          placeholder="搜索 Key 名称、负责人"
          className="w-64"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        <Select value={typeFilter} onChange={setTypeFilter} className="w-32">
          <SelectItem value={ALL}>全部类型</SelectItem>
          <SelectItem value={'personal' satisfies ApiKeyType}>私有 Key</SelectItem>
          <SelectItem value={'member' satisfies ApiKeyType}>成员 Key</SelectItem>
          <SelectItem value={'service' satisfies ApiKeyType}>服务 Key</SelectItem>
        </Select>
        <Select value={statusFilter} onChange={setStatusFilter} className="w-32">
          <SelectItem value={ALL}>全部状态</SelectItem>
          <SelectItem value="active">启用中</SelectItem>
          <SelectItem value="disabled">已停用</SelectItem>
          <SelectItem value="expired">已过期</SelectItem>
          <SelectItem value="limit_reached">已达限额</SelectItem>
        </Select>
        <Select value={ownerFilter} onChange={setOwnerFilter} className="w-36">
          <SelectItem value={ALL}>全部负责人</SelectItem>
          {ownerOptions.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
          ))}
        </Select>
        <div className="ml-auto">
          {canCreate && (
            <Button variant="brand" data-umami-event="create_api_key" onClick={() => { setCreateNonce((n) => n + 1); setCreateVisible(true) }} className="rounded-full px-6 h-10 shadow-lg shadow-brand-glow/20">
              <LuPlus className="w-4 h-4 mr-1.5" />
              {t('apiKeys.create')}
            </Button>
          )}
        </div>
      </div>

      {!isLoading && apiKeyItems.length > 0 && (
        <p className="-mt-2 mg-text-caption text-mg-text-3">
          {showsOthers
            ? `作用域：当前工作空间 · 显示本空间全部成员的 API Key（${distinctOwnerCount} 位成员）`
            : '作用域：当前工作空间 · 仅展示由你负责的 Key'}
        </p>
      )}

      <ApiKeyTable
        isLoading={isLoading}
        items={filteredData}
        canRevoke={canRevoke}
        canManage={canManage}
        onRevoke={setRevokeTarget}
        onEditGuardrail={setEditGuardrailKey}
        onOpenDetail={setDetailKey}
        onToggleStatus={handleToggleStatus}
        onCopyKey={handleCopyKey}
        copyingKeyId={copyingKeyId}
      />

      <ApiKeyDetailDrawer
        open={!!detailKey}
        onClose={() => setDetailKey(null)}
        workspaceId={activeWorkspaceId}
        item={detailKey}
        canManage={canManage}
        onToggleStatus={handleToggleStatus}
        onRotate={() => { /* 轮转接口 #384 未交付，按钮已 gate 隐藏；落地后接入 */ }}
        onChangeOwner={(item) => { setNewOwnerId(''); setChangeOwnerTarget(item) }}
        onRevoke={setRevokeTarget}
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

      {/* 撤销确认 */}
      <Modal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title={t('apiKeys.revokeConfirm.title')}
        description={t('apiKeys.revokeConfirm.content')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>{t('apiKeys.createModal.cancel')}</Button>
            <Button variant="destructive" loading={revokeMutation.isPending} onClick={() => { if (revokeTarget) revokeMutation.mutate(revokeTarget.id) }}>
              {t('apiKeys.table.revoke')}
            </Button>
          </>
        }
      />

      {/* 停用确认（PRD：停用需确认，可稍后启用） */}
      <Modal
        open={!!disableTarget}
        onClose={() => setDisableTarget(null)}
        title="确认停用 API Key"
        description="停用后该 Key 将立即停止调用，可稍后重新启用。"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDisableTarget(null)}>{t('apiKeys.createModal.cancel')}</Button>
            <Button variant="brand" loading={disableMutation.isPending} onClick={() => { if (disableTarget) disableMutation.mutate(disableTarget.api_key_id) }}>
              确认停用
            </Button>
          </>
        }
      />

      {/* 变更负责人 */}
      <Modal
        open={!!changeOwnerTarget}
        onClose={() => setChangeOwnerTarget(null)}
        title="变更负责人"
        description={changeOwnerTarget ? `为「${changeOwnerTarget.name}」指定新的负责人` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setChangeOwnerTarget(null)}>{t('apiKeys.createModal.cancel')}</Button>
            <Button
              variant="brand"
              loading={changeOwnerMutation.isPending}
              disabled={!newOwnerId}
              onClick={() => changeOwnerMutation.mutate()}
            >
              确认变更
            </Button>
          </>
        }
      >
        <div className="py-2">
          <label className="block text-xs font-bold text-mg-text-2 mb-2">新负责人</label>
          <Select value={newOwnerId} onChange={setNewOwnerId} placeholder="请选择工作区成员" className="w-full">
            {(membersQuery.data?.items ?? []).map((m) => (
              <SelectItem key={m.account.account_id} value={m.account.account_id}>
                {m.account.display_name || m.account.email}
              </SelectItem>
            ))}
          </Select>
        </div>
      </Modal>

      <EditKeyModal
        open={!!editGuardrailKey}
        onClose={() => setEditGuardrailKey(null)}
        workspaceId={activeWorkspaceId}
        apiKey={editGuardrailKey}
      />
    </div>
  )
}
