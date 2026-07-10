/**
 * API Key 管理页（PRD v1.0.3）
 * 路由：/workspace/:workspaceId/api-keys
 * API：GET/POST/DELETE/PATCH /api/v1/workspaces/:workspace_id/api-keys（+ enable/disable/change-owner/reveal）
 * 作用域=当前工作空间，行可见性按角色由后端裁剪（#358/#359）。
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select, SelectItem } from '@/components/ui/Select'
import { CopyButton } from '@/components/ui/CopyButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { ForbiddenState } from '@/components/ui/ForbiddenState'
import { trackAction, trackEvent, trackPageView } from '@/lib/track'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
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
import { listWorkspaceMembers, listWorkspaces } from '@/services/workspaces'
import { useCopy } from '@/hooks/use-copy'
import { useCurrency } from '@/hooks/use-platform-config'
import { getRequestErrorMessage, isApiErrorCode, errorCodeOf } from '@/lib/request-error-message'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { appToast } from '@/lib/app-toast'
import { useMarket } from '@/hooks/useMarket'
import { pageItems } from '@/lib/utils'
import { ApiKeyProtocolBanner } from './ApiKeyProtocolBanner'
import { ConnectModal } from './ConnectModal'
import { CreateKeyModal } from './CreateKeyModal'
import { ApiKeyTable } from './ApiKeyTable'
import { EditKeyModal } from './EditKeyModal'
import { ApiKeySummaryCards } from './ApiKeySummaryCards'
import { ApiKeyDetailDrawer } from './ApiKeyDetailDrawer'
import { deriveKeyType, responsibleOf, isExpiringSoon } from './derive'
import type { ApiKeyCreated, ApiKeyItem, ApiKeyType, WorkspaceItem } from '@/types'

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
  const [createdVisible, setCreatedVisible] = useState(false)
  const [connectVisible, setConnectVisible] = useState(false)
  const [createdKeyText, setCreatedKeyText] = useState('')
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null)
  const [createdAt, setCreatedAt] = useState(0)
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [disableTarget, setDisableTarget] = useState<ApiKeyItem | null>(null)
  const [editGuardrailKey, setEditGuardrailKey] = useState<ApiKeyItem | null>(null)
  const [detailKey, setDetailKey] = useState<ApiKeyItem | null>(null)
  const [changeOwnerTarget, setChangeOwnerTarget] = useState<ApiKeyItem | null>(null)
  const [newOwnerId, setNewOwnerId] = useState('')

  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId) || '01HV3KWS000000000000001'
  const activeTenantId = useAuthStore((state) => state.activeTenantId)
  const tenants = useAuthStore((state) => state.tenants)
  const account = useAuthStore((state) => state.account)
  const currentAccountId = account?.account_id
  const isPersonalTenant = tenants.find((tn) => tn.tenant_id === activeTenantId)?.type === 'personal'
  const { currency } = useCurrency()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMS.API_KEYS_CREATE)
  const canEdit = hasPermission(PERMS.API_KEYS_EDIT)
  const canReveal = hasPermission(PERMS.API_KEYS_REVEAL)
  const canRevoke = hasPermission(PERMS.API_KEYS_REVOKE)
  // 埋点顶层字段 is_space_owner：当前用户对本页作用域工作空间的 my_role 是否为 ws_owner
  // （不是 useTenantRole().isSpaceOwner —— 那个是「企业成员+自领至少一个空间」的 PRD 空间视图判定，口径更窄）
  const { ownedWorkspaceIds, isEnterprise, canManage: canManageTenant } = useTenantRole()
  const isActiveWorkspaceOwner = ownedWorkspaceIds.includes(activeWorkspaceId)

  // 企业视图/我的视图：仅租户 owner/admin 可切（普通成员/空间负责人的可见范围已由后端角色裁剪，
  // 见 #359，无需再手动切换）。后端 GET .../api-keys 支持 view=mine|company（Swagger 已确认），
  // #22 反馈"切换视图数据不变"，根因是这里之前压根没接这个参数——不是账号切换的问题。
  const showViewToggle = isEnterprise && canManageTenant
  const [userView, setUserView] = useState<'mine' | 'company' | null>(null)
  const view = userView ?? 'company'

  useEffect(() => {
    trackPageView('api-keys', undefined, { is_space_owner: isActiveWorkspaceOwner, view_mode: view })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data, isLoading, error: listError } = useQuery({
    queryKey: ['api-keys', activeWorkspaceId, showViewToggle ? view : undefined],
    // 类型/负责人/状态/搜索四个筛选都在客户端做（其中 status 后端无筛选参数），因此必须把全量 Key
    // 一次拉齐，否则筛选/负责人下拉只覆盖首页会漏（#383）。单空间 Key 量级很小，page_size 拉满足够；
    // 若未来单空间 Key 超 200，再改真·游标分页 + 后端补 status 过滤参数。
    queryFn: () => listApiKeys(activeWorkspaceId, { page_size: 200, view: showViewToggle ? view : undefined }).then(pageItems),
    enabled: !!activeWorkspaceId,
    retry: false, // 40301/无权限不重试，直接走兼容态
    meta: { forbiddenHandled: true }, // 40301 由本页 ForbiddenState 承接，不弹全局 toast
  })

  // 接口正常但业务码 40301（无权限，典型是进了自己无权的工作空间 API Keys 页）→ 403 兼容态，
  // 而不是让空数据伪装成「暂无 Key」空态。
  const forbidden = isApiErrorCode(listError, 40301)

  // 摘要卡：后端 /summary（#383）未交付时静默降级（catch→undefined，避免全局错误 toast），
  // 由 SummaryCards 从列表派生兜底。
  const { data: summary } = useQuery({
    queryKey: ['api-keys-summary', activeWorkspaceId],
    queryFn: () => getApiKeySummary(activeWorkspaceId).catch(() => undefined),
    enabled: !!activeWorkspaceId,
    retry: false,
  })

  // 工作空间名（副标题用）——复用 WorkspaceSwitcher 的缓存 queryKey，避免重复请求
  const { data: workspaces = [] } = useQuery<WorkspaceItem[]>({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((res) => res.items || []),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })
  const workspaceName =
    workspaces.find((w) => w.workspace_id === activeWorkspaceId)?.name ?? t('header.defaultWorkspace')

  const apiKeyItems = pageItems(data)
  // #358 角色可见性：可见范围完全由后端返回的行决定（成员只回自己的，此处据「返回是否含他人」派生页头提示）
  const showsOthers = apiKeyItems.some(
    (k) => k.owner?.account_id && k.owner.account_id !== currentAccountId,
  )
  const distinctOwnerCount = new Set(apiKeyItems.map((k) => k.owner?.account_id).filter(Boolean)).size
  // 埋点 row_scope（PRD §11.1）：能看到他人 Key = workspace_all，否则 self
  const rowScope = showsOthers ? 'workspace_all' : 'self'
  const commonEventProps = { prd_version: 'api_keys_v0_1', row_scope: rowScope }

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
      trackEvent('api_keys:enable', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '启用失败')
      trackEvent('api_keys:enable', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  const disableMutation = useMutation({
    mutationFn: (keyId: string) => disableApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      appToast.success('已停用')
      setDisableTarget(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
      trackEvent('api_keys:disable', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '停用失败')
      trackEvent('api_keys:disable', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  const handleToggleStatus = useCallback((item: ApiKeyItem) => {
    if (item.status === 'disabled') {
      enableMutation.mutate(item.api_key_id)
    } else {
      setDisableTarget(item)
    }
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
      trackEvent('api_keys:change_owner', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '变更负责人失败')
      trackEvent('api_keys:change_owner', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  const { copy } = useCopy()
  const [copyingKeyId, setCopyingKeyId] = useState<string | null>(null)
  // #298 复制完整明文：reveal → 剪贴板（WebKit 手势栈内 ClipboardItem 模式，明文不落 state）
  const handleCopyKey = useCallback(
    async (item: ApiKeyItem) => {
      if (!canReveal || copyingKeyId) return
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
    [activeWorkspaceId, canReveal, copy, copyingKeyId, t]
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
      if (statusFilter !== ALL) {
        if (statusFilter === 'expiring') { if (!isExpiringSoon(item)) return false }
        else if (item.status !== statusFilter) return false
      }
      if (ownerFilter !== ALL && responsibleOf(item).account_id !== ownerFilter) return false
      return true
    })
  }, [apiKeyItems, searchValue, typeFilter, statusFilter, ownerFilter])

  const isFiltered = searchValue.trim() !== '' || typeFilter !== ALL || statusFilter !== ALL || ownerFilter !== ALL

  // 筛选/搜索埋点（PRD §11.2）
  const handleTypeFilter = (v: string) => {
    setTypeFilter(v)
    trackEvent('api_keys:filter_change', { ...commonEventProps, filter_type: 'type', filter_value: v }, { source: 'toolbar' })
  }
  const handleStatusFilter = (v: string) => {
    setStatusFilter(v)
    trackEvent('api_keys:filter_change', { ...commonEventProps, filter_type: 'status', filter_value: v }, { source: 'toolbar' })
  }
  const handleOwnerFilter = (v: string) => {
    setOwnerFilter(v)
    // 负责人为 PII，仅上报是否命中而非 account_id
    trackEvent('api_keys:filter_change', { ...commonEventProps, filter_type: 'responsible', filter_value: v === ALL ? 'all' : 'selected' }, { source: 'toolbar' })
  }
  const handleSearchChange = (v: string) => {
    setSearchValue(v)
    trackEvent('api_keys:search', { ...commonEventProps, query_length: v.length }, { source: 'toolbar' })
  }
  const clearFilters = () => {
    setSearchValue('')
    setTypeFilter(ALL)
    setStatusFilter(ALL)
    setOwnerFilter(ALL)
  }
  const openCreate = (source: string) => {
    trackAction(PERMS.API_KEYS_CREATE, undefined, { source, is_space_owner: isActiveWorkspaceOwner })
    trackEvent('api_keys:create_open', commonEventProps, { source })
    setCreateNonce((n) => n + 1)
    setCreateVisible(true)
  }

  const handleKeyCreated = useCallback((created: ApiKeyCreated) => {
    setCreateVisible(false)
    setCreatedKey(created)
    setCreatedKeyText(created.key)
    setCreatedAt(Date.now())
    setCreatedVisible(true)
  }, [])

  // 「我已保存密钥」（PRD §8.3）：关闭 → 刷新列表 → 打开新 Key 详情
  const handleSecretSaved = () => {
    if (createdKey) {
      trackEvent('api_keys:secret_saved', { ...commonEventProps, time_to_save_ms: createdAt ? Date.now() - createdAt : 0 }, { source: 'create_success' })
    }
    setCreatedVisible(false)
    queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    if (createdKey) {
      const c = createdKey
      setDetailKey({
        api_key_id: c.api_key_id,
        name: c.name,
        prefix: c.prefix,
        masked: c.masked,
        env: c.env,
        status: 'active',
        owner: account ?? { account_id: '', display_name: '', email: '' },
        expires_at: null,
        last_used_at: null,
        total_spend: { amount: '0', currency },
        limit: { amount: '0', currency, period_unit: 'month', period_length: 1 },
        created_at: c.created_at,
        scope: c.scope,
      })
    }
  }

  const openAIBaseUrl = GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''
  const anthropicBaseUrl = GATEWAY_ENDPOINTS[1]?.baseUrl ?? openAIBaseUrl

  if (forbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('apiKeys.title')} />
        <ForbiddenState resource={t('apiKeys.title')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('apiKeys.title')}
        description={`${workspaceName} 工作空间的运行凭证、负责人、限额和到期时间`}
        actions={showViewToggle ? (
          <SegmentedToggle<'mine' | 'company'>
            ariaLabel={t('dashboard.workbench.view.enterprise')}
            value={view}
            options={[
              { value: 'company', label: t('dashboard.workbench.view.enterprise') },
              { value: 'mine', label: t('dashboard.workbench.view.mine') },
            ]}
            onChange={setUserView}
          />
        ) : undefined}
      />

      <ApiKeySummaryCards items={apiKeyItems} summary={summary} loading={isLoading} />

      <ApiKeyProtocolBanner
        openAIBaseUrl={openAIBaseUrl}
        anthropicBaseUrl={anthropicBaseUrl}
        docsUrl={docsUrl}
      />

      {/* 工具条：搜索 + 类型/状态/负责人 筛选 + 创建 */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          variant="search"
          prefix={<LuSearch className="w-4 h-4" />}
          placeholder="搜索 Key 名称、负责人"
          className="w-64"
          value={searchValue}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <Select value={typeFilter} onChange={handleTypeFilter} className="w-32">
          <SelectItem value={ALL}>全部类型</SelectItem>
          <SelectItem value={'personal' satisfies ApiKeyType}>私有 Key</SelectItem>
          {/* 个人租户无成员 Key（PRD §7.4） */}
          {!isPersonalTenant && <SelectItem value={'member' satisfies ApiKeyType}>成员 Key</SelectItem>}
          <SelectItem value={'service' satisfies ApiKeyType}>服务 Key</SelectItem>
        </Select>
        <Select value={statusFilter} onChange={handleStatusFilter} className="w-32">
          {/* PRD §5.2：轮转是动作过渡态，不作为常规状态筛选项 */}
          <SelectItem value={ALL}>全部状态</SelectItem>
          <SelectItem value="active">启用中</SelectItem>
          <SelectItem value="limited">已达限额</SelectItem>
          <SelectItem value="expired">已过期</SelectItem>
          <SelectItem value="disabled">已停用</SelectItem>
          <SelectItem value="expiring">即将过期</SelectItem>
        </Select>
        <Select value={ownerFilter} onChange={handleOwnerFilter} className="w-36">
          <SelectItem value={ALL}>全部负责人</SelectItem>
          {ownerOptions.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
          ))}
        </Select>
        <div className="ml-auto">
          {canCreate && (
            <Button variant="brand" onClick={() => openCreate('toolbar')} className="rounded-full px-6 h-10 shadow-lg shadow-brand-glow/20">
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
        canEdit={canEdit}
        canReveal={canReveal}
        hasKeys={apiKeyItems.length > 0}
        isFiltered={isFiltered}
        canCreate={canCreate}
        onCreate={() => openCreate('empty_state')}
        onClearFilters={clearFilters}
        onOpenDetail={(item) => { trackEvent('api_keys:detail', { ...commonEventProps, key_type: deriveKeyType(item) }, { source: 'table_row', is_space_owner: isActiveWorkspaceOwner }); setDetailKey(item) }}
        onToggleStatus={handleToggleStatus}
        onCopyKey={handleCopyKey}
        copyingKeyId={copyingKeyId}
      />

      <ApiKeyDetailDrawer
        open={!!detailKey}
        onClose={() => setDetailKey(null)}
        workspaceId={activeWorkspaceId}
        item={detailKey}
        canEdit={canEdit}
        canRevoke={canRevoke}
        rowScope={rowScope}
        onToggleStatus={handleToggleStatus}
        onRotate={() => { /* 轮转接口 #384 未交付，按钮已 gate 隐藏；落地后接入 */ }}
        onChangeOwner={(item) => { setNewOwnerId(''); setChangeOwnerTarget(item) }}
        onEdit={setEditGuardrailKey}
        onRevoke={setRevokeTarget}
      />

      {/* 创建成功：完整密钥只展示一次（PRD 原型无「接入中心」，接入入口收进此处） */}
      <Modal
        open={createdVisible}
        onClose={() => setCreatedVisible(false)}
        title="API Key 创建成功"
        description="请立即复制并保存，关闭后将无法再查看完整密钥。"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => { setCreatedVisible(false); setConnectVisible(true) }}>快速接入</Button>
            <Button variant="brand" onClick={handleSecretSaved}>我已保存密钥</Button>
          </>
        }
      >
        <div className="py-2">
          <div className="flex items-center gap-2 rounded-md border border-mg-border bg-mg-code-bg px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-sm font-bold text-mg-success select-all">{createdKeyText}</span>
            <CopyButton value={createdKeyText} aria-label="复制密钥" toast="密钥已复制" size="md" />
          </div>
        </div>
      </Modal>

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
