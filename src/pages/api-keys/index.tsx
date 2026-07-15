/**
 * API Key 管理页（PRD v1.0.3）
 * 路由：/workspace/:workspaceId/api-keys
 * API：GET/POST/DELETE/PATCH /api/v1/workspaces/:workspace_id/api-keys（+ enable/disable/change-owner/reveal）
 * 作用域=当前工作空间，行可见性按角色由后端裁剪（#358/#359）。
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { useParams } from 'react-router-dom'
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
import { LuSearch, LuPlus } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
  rotateApiKey,
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
import { useCursorPager } from '@/hooks/use-cursor-pager'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Pagination } from '@/components/ui/Pagination'
import type { ApiKeyListParams } from '@/interfaces/api-keys'
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
/** 表格游标分页每页条数（#60） */
const PAGE_SIZE = 20

export default function ApiKeysPage() {
  const { t } = useTranslation()
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
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
  // 轮转成功后一次性明文（旧 Token 过渡期仍可用）——复用「一次性展示」承接，避免密钥丢失
  const [rotatedKey, setRotatedKey] = useState<{ name: string; key: string } | null>(null)

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
  // 细粒度动作权限（#54）：停用/轮换/改负责人各用自己的 key,不再复用 edit
  const canDisable = hasPermission(PERMS.API_KEYS_DISABLE)
  const canRotate = hasPermission(PERMS.API_KEYS_ROTATE)
  const canChangeOwner = hasPermission(PERMS.API_KEYS_CHANGE_OWNER)
  // 埋点顶层字段 is_space_owner：当前用户对本页作用域工作空间的 my_role 是否为 ws_owner
  // （不是 useTenantRole().isSpaceOwner —— 那个是「企业成员+自领至少一个空间」的 PRD 空间视图判定，口径更窄）
  const { ownedWorkspaceIds } = useTenantRole()
  const isActiveWorkspaceOwner = ownedWorkspaceIds.includes(workspaceId)

  // PRD 定稿：运行页无视图概念，作用域恒＝当前工作空间，行可见性纯由后端按角色裁剪
  // （租户级角色 + 空间负责人看全部，普通成员只看自己）。不再有企业/我的视图切换。
  useEffect(() => {
    trackPageView('api-keys', undefined, { is_space_owner: isActiveWorkspaceOwner })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pager = useCursorPager()
  // 切换工作空间回到第一页——渲染期调整状态模式（同 AuditTab），避免 useEffect 级联渲染
  const [observedWorkspaceId, setObservedWorkspaceId] = useState(workspaceId)
  if (workspaceId !== observedWorkspaceId) {
    setObservedWorkspaceId(workspaceId)
    pager.reset()
  }
  // 搜索防抖：settle 350ms 后才进 queryKey，避免每次按键触发请求（同 logs 页）
  const debouncedSearch = useDebouncedValue(searchValue.trim(), 350)

  // #60 列表接口已改为 CursorPage 分页对象：表格走真·游标分页（page_size=20，不处理 has_more 会漏显）。
  // q / key_type / responsible_member_id 三个后端支持的筛选下推服务端，跨页命中不漏；
  // status 后端无筛选参数（#383），仍在当前页客户端过滤（见 filteredData）。
  const listParams: ApiKeyListParams = {
    page_size: PAGE_SIZE,
    cursor: pager.cursor,
    q: debouncedSearch || undefined,
    key_type: typeFilter === ALL ? undefined : (typeFilter as ApiKeyListParams['key_type']),
    responsible_member_id: ownerFilter === ALL ? undefined : ownerFilter,
  }
  const { data, isLoading, isFetching, error: listError } = useQuery({
    queryKey: ['api-keys', workspaceId, 'page', pager.page, pager.cursor, debouncedSearch, typeFilter, ownerFilter],
    queryFn: () => listApiKeys(workspaceId, listParams),
    enabled: !!workspaceId,
    placeholderData: keepPreviousData,
    retry: false, // 40301/无权限不重试，直接走兼容态
    meta: { forbiddenHandled: true }, // 40301 由本页 ForbiddenState 承接，不弹全局 toast
  })

  // 汇总卡兜底/负责人筛选下拉/作用域提示需要全量视角：不带分页参数（page_size:0=不限）拉全量（#60 下拉候选类语义），
  // 与 logs/tasks/guardrails 共用 ['api-keys', workspaceId] 缓存（同 key 只存 CursorPage 一种形状，杜绝 #44 类形状冲突）
  const { data: allKeysPage, isLoading: allKeysLoading } = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () => listApiKeys(workspaceId),
    enabled: !!workspaceId,
    staleTime: 60_000,
    retry: false,
    meta: { forbiddenHandled: true },
  })
  const allKeys = allKeysPage?.items ?? []

  // 接口正常但业务码 40301（无权限，典型是进了自己无权的工作空间 API Keys 页）→ 403 兼容态，
  // 而不是让空数据伪装成「暂无 Key」空态。
  const forbidden = isApiErrorCode(listError, 40301)

  // 摘要卡：后端 /summary（#383）未交付时静默降级（catch→undefined，避免全局错误 toast），
  // 由 SummaryCards 从列表派生兜底。
  const { data: summary } = useQuery({
    queryKey: ['api-keys-summary', workspaceId],
    queryFn: () => getApiKeySummary(workspaceId).catch(() => undefined),
    enabled: !!workspaceId,
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
    workspaces.find((w) => w.workspace_id === workspaceId)?.name ?? t('header.defaultWorkspace')

  const apiKeyItems = data?.items ?? []
  const hasMore = Boolean(data?.has_more && data.next_cursor)
  // #358 角色可见性：可见范围完全由后端返回的行决定（成员只回自己的，此处据「返回是否含他人」派生页头提示）；
  // 用全量视角判定，避免翻页/筛选后的单页样本误判作用域
  const showsOthers = allKeys.some(
    (k) => k.owner?.account_id && k.owner.account_id !== currentAccountId,
  )
  const distinctOwnerCount = new Set(allKeys.map((k) => k.owner?.account_id).filter(Boolean)).size
  // 埋点 row_scope（PRD §11.1）：能看到他人 Key = workspace_all，否则 self
  const rowScope = showsOthers ? 'workspace_all' : 'self'
  const commonEventProps = { prd_version: 'api_keys_v0_1', row_scope: rowScope }

  // 负责人筛选项（全量列表去重——分页后单页去重会漏掉其他页的负责人，#60）
  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>()
    allKeys.forEach((k) => {
      const r = responsibleOf(k)
      if (r.account_id) map.set(r.account_id, r.display_name || r.email || r.account_id)
    })
    return [...map.entries()].map(([id, label]) => ({ id, label }))
  }, [allKeys])

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(workspaceId, keyId),
    onSuccess: () => {
      appToast.success(t('apiKeys.toast.revokeSuccess'))
      setRevokeTarget(null)
      setDetailKey(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
    },
    onError: (err: unknown) => appToast.requestError(err, t('apiKeys.toast.revokeError')),
  })

  const enableMutation = useMutation({
    mutationFn: (keyId: string) => enableApiKey(workspaceId, keyId),
    onSuccess: () => {
      appToast.success('已启用')
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      trackEvent('api_keys:enable', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '启用失败')
      trackEvent('api_keys:enable', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  const disableMutation = useMutation({
    mutationFn: (keyId: string) => disableApiKey(workspaceId, keyId),
    onSuccess: () => {
      appToast.success('已停用')
      setDisableTarget(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
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
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => listWorkspaceMembers(workspaceId, { page_size: 100 }),
    enabled: !!workspaceId && !!changeOwnerTarget,
    staleTime: 60_000,
  })
  const changeOwnerMutation = useMutation({
    mutationFn: () => changeApiKeyOwner(workspaceId, changeOwnerTarget!.api_key_id, { new_owner_account_id: newOwnerId }),
    onSuccess: () => {
      appToast.success('负责人已变更')
      setChangeOwnerTarget(null)
      setNewOwnerId('')
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      trackEvent('api_keys:change_owner', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '变更负责人失败')
      trackEvent('api_keys:change_owner', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  // 轮转（#384/#385）：路由未就绪时后端返 40401，错误层归一为「服务暂不可用」（见 request-error-message）；
  // 交付后成功返回一次性 new_key，走下方 rotatedKey 弹窗一次性展示。不做死按钮、不硬隐藏。
  const rotateMutation = useMutation({
    mutationFn: (item: ApiKeyItem) => rotateApiKey(workspaceId, item.api_key_id),
    onSuccess: (res, item) => {
      setRotatedKey({ name: item.name, key: res.new_key })
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['api-key-detail', workspaceId, item.api_key_id] })
      trackEvent('api_keys:rotate', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '轮转失败')
      trackEvent('api_keys:rotate', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  const { copy } = useCopy()
  const [copyingKeyId, setCopyingKeyId] = useState<string | null>(null)
  // #298 复制完整明文：reveal → 剪贴板（WebKit 手势栈内 ClipboardItem 模式，明文不落 state）
  const handleCopyKey = useCallback(
    async (item: ApiKeyItem) => {
      if (!canReveal || copyingKeyId) return
      setCopyingKeyId(item.api_key_id)
      const plaintextPromise = revealApiKey(workspaceId, item.api_key_id).then((r) => r.key)
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
    [workspaceId, canReveal, copy, copyingKeyId, t]
  )

  // 搜索/类型/负责人已下推服务端（见 listParams）；status 后端无筛选参数，仅在当前页客户端过滤
  const filteredData = useMemo(() => {
    return apiKeyItems.filter((item) => {
      if (statusFilter === ALL) return true
      if (statusFilter === 'expiring') return isExpiringSoon(item)
      return item.status === statusFilter
    })
  }, [apiKeyItems, statusFilter])

  const isFiltered = searchValue.trim() !== '' || typeFilter !== ALL || statusFilter !== ALL || ownerFilter !== ALL

  // 筛选/搜索埋点（PRD §11.2）；筛选条件变化后回到第一页，避免把旧条件的 cursor 发给新数据源
  const handleTypeFilter = (v: string) => {
    setTypeFilter(v)
    pager.reset()
    trackEvent('api_keys:filter_change', { ...commonEventProps, filter_type: 'type', filter_value: v }, { source: 'toolbar' })
  }
  const handleStatusFilter = (v: string) => {
    setStatusFilter(v)
    trackEvent('api_keys:filter_change', { ...commonEventProps, filter_type: 'status', filter_value: v }, { source: 'toolbar' })
  }
  const handleOwnerFilter = (v: string) => {
    setOwnerFilter(v)
    pager.reset()
    // 负责人为 PII，仅上报是否命中而非 account_id
    trackEvent('api_keys:filter_change', { ...commonEventProps, filter_type: 'responsible', filter_value: v === ALL ? 'all' : 'selected' }, { source: 'toolbar' })
  }
  const handleSearchChange = (v: string) => {
    setSearchValue(v)
    pager.reset()
    trackEvent('api_keys:search', { ...commonEventProps, query_length: v.length }, { source: 'toolbar' })
  }
  const clearFilters = () => {
    setSearchValue('')
    setTypeFilter(ALL)
    setStatusFilter(ALL)
    setOwnerFilter(ALL)
    pager.reset()
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
    queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
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
      />

      <ApiKeySummaryCards items={allKeys} summary={summary} loading={allKeysLoading} />

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
            <Button variant="brand" data-track="api_keys:create" onClick={() => openCreate('toolbar')} className="rounded-full px-6 h-10 shadow-lg shadow-brand-glow/20">
              <LuPlus className="w-4 h-4 mr-1.5" />
              {t('apiKeys.create')}
            </Button>
          )}
        </div>
      </div>

      {!allKeysLoading && allKeys.length > 0 && (
        <p className="-mt-2 mg-text-caption text-mg-text-3">
          {showsOthers
            ? `作用域：当前工作空间 · 显示本空间全部成员的 API Key（${distinctOwnerCount} 位成员）`
            : '作用域：当前工作空间 · 仅展示由你负责的 Key'}
        </p>
      )}

      <ApiKeyTable
        isLoading={isLoading}
        items={filteredData}
        canDisable={canDisable}
        canReveal={canReveal}
        hasKeys={allKeys.length > 0}
        isFiltered={isFiltered}
        canCreate={canCreate}
        selfScopeOnly={!showsOthers}
        onCreate={() => openCreate('empty_state')}
        onClearFilters={clearFilters}
        onOpenDetail={(item) => { trackEvent('api_keys:detail', { ...commonEventProps, key_type: deriveKeyType(item) }, { source: 'table_row', is_space_owner: isActiveWorkspaceOwner }); setDetailKey(item) }}
        onToggleStatus={handleToggleStatus}
        onCopyKey={handleCopyKey}
        copyingKeyId={copyingKeyId}
      />

      {/* #60 游标翻页：首页且无更多时隐藏（同 AuditTab）；status 页内过滤可能使当前页显示少于 PAGE_SIZE 条 */}
      {(pager.page > 1 || hasMore) && (
        <Pagination
          mode="cursor"
          page={pager.page}
          hasMore={hasMore}
          loading={isFetching}
          onPrev={pager.prev}
          onNext={() => pager.next(data?.next_cursor)}
        />
      )}

      <ApiKeyDetailDrawer
        open={!!detailKey}
        onClose={() => setDetailKey(null)}
        workspaceId={workspaceId}
        item={detailKey}
        canEdit={canEdit}
        canRevoke={canRevoke}
        canDisable={canDisable}
        canRotate={canRotate}
        canChangeOwner={canChangeOwner}
        rowScope={rowScope}
        onToggleStatus={handleToggleStatus}
        onRotate={(item) => rotateMutation.mutate(item)}
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

      {/* 轮转成功：新 Token 只展示一次（旧 Token 过渡期内仍可用，验证通过后在详情点「已轮转」使其失效） */}
      <Modal
        open={!!rotatedKey}
        onClose={() => setRotatedKey(null)}
        title="轮转成功"
        description="新 Token 已生效、只展示一次，请立即复制保存。旧 Token 仍在过渡期，验证无误后再点「已轮转」使其失效。"
        size="md"
        footer={<Button variant="brand" onClick={() => setRotatedKey(null)}>我已保存新 Token</Button>}
      >
        <div className="py-2">
          <div className="flex items-center gap-2 rounded-md border border-mg-border bg-mg-code-bg px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-sm font-bold text-mg-success select-all">{rotatedKey?.key}</span>
            <CopyButton value={rotatedKey?.key ?? ''} aria-label="复制新 Token" toast="新 Token 已复制" size="md" />
          </div>
        </div>
      </Modal>

      <CreateKeyModal
        key={createNonce}
        open={createVisible}
        onClose={() => setCreateVisible(false)}
        workspaceId={workspaceId}
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
        workspaceId={workspaceId}
        apiKey={editGuardrailKey}
      />
    </div>
  )
}
