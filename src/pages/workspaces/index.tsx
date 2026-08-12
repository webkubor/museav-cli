/**
 * 空间管理页
 * 路由：/workspaces
 * API：GET /workspaces、POST /workspaces
 */
import { useEffect, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useTranslation } from 'react-i18next'
import {
  LuSearch,
  LuPlus,
  LuFolderKanban
} from 'react-icons/lu'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces } from '@/services/workspaces'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/utils'
import { trackAction, trackPageView, trackEvent } from '@/lib/track'
import { PERMS } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { WorkspaceDashboard } from './workspace-dashboard'
import { WorkspaceCreateModal } from './workspace-create-modal'

export default function WorkspacesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountId = useAuthStore((s) => s.account?.account_id)
  const { isEnterprise, tenant } = useTenantRole()
  const { hasPermission } = usePermissions()
  // 具体角色由后端角色矩阵决定；前端只消费当前会话的 Permission ID。
  const canCreateWorkspace = hasPermission(PERMS.WORKSPACE_CREATE)

  useEffect(() => {
    trackPageView('workspaces')
  }, [])

  const [searchValue, setSearchValue] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  // 深链支持：其他页面（如调用日志「去开启日志与转发」）跳转过来时带 ?ws=<id>&tab=logs，
  // 直接展开对应空间详情并落在指定页签，不再指向已弃用的 /workspace/:id/observability。
  const [searchParams] = useSearchParams()
  const linkedWorkspaceId = searchParams.get('ws') ?? ''
  const linkedTab = searchParams.get('tab')
  const initialTab = linkedTab === 'members' || linkedTab === 'logs' || linkedTab === 'settings' ? linkedTab : undefined
  // 单页结构：选中卡片在下方展开详情（不跳路由，对齐原型 .space-detail-shell）
  const [selectedId, setSelectedId] = useState<string>(linkedWorkspaceId)

  // ─── 1. TanStack Query 真实获取工作空间接口数据 ─────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then(res => res.items || []),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  // 工作空间数已达当前租户上限（现有 ['tenants'] query，不重复发请求）
  const atWorkspaceLimit = Boolean(
    tenant && tenant.current_workspace_count >= tenant.max_workspaces
  )

  // 默认选中第一个空间（对齐原型 selectedWorkspaceId 默认 records[0]）；
  // 列表变化时若选中项已不存在，回落到第一个。派生有效选中 id，避免 effect 级联渲染。
  const items = data || []
  const validSelectedId = items.some((w) => w.workspace_id === selectedId)
    ? selectedId
    : (items[0]?.workspace_id ?? '')

  // 支持按名称、slug、workspace_id、描述、负责人模糊搜索。
  // 全量拉取（GET /workspaces 省略 page_size = 返回全部，企业租户上限 20 个）+
  // 前端搜索，保证搜索永远是对全量数据搜——分页只做「展示层」切片，不影响搜索范围。
  const searchKeyword = searchValue.trim().toLowerCase()
  const filteredData = (data || []).filter((item) => {
    if (!searchKeyword) return true
    return [item.name, item.slug, item.workspace_id, item.description, item.owner?.display_name].some((value) =>
      (value ?? '').toLowerCase().includes(searchKeyword),
    )
  })

  const selectWorkspace = (workspaceId: string) => {
    trackEvent('workspaces:space_card_select', { workspace_id: workspaceId })
    setSelectedId(workspaceId)
  }

  const handleWorkspaceCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, workspaceId: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectWorkspace(workspaceId)
  }

  // 摘要条派生数据（PRD 原型：我的工作空间 / 我负责的空间 / 日志采集 / 转发状态）
  const list = data || []
  // 我负责的空间：对齐 PRD 原型口径（records.filter(owner === 当前身份)）——按空间负责人 account_id 判定，
  // 而非依赖 my_role 字段（owner 恒返回，更可靠）
  const myOwnedCount = currentAccountId
    ? list.filter((w) => w.owner?.account_id === currentAccountId).length
    : list.filter((w) => w.my_role === 'ws_owner').length
  const loggingKnown = list.some((w) => w.logging_enabled !== undefined)
  const forwardKnown = list.some((w) => w.forward_enabled !== undefined)
  const loggingOnCount = list.filter((w) => w.logging_enabled).length
  const forwardOnCount = list.filter((w) => w.forward_enabled).length
  const dash = '—'

  // 摘要条对齐 PRD space-summary-strip：4 项等分、仅「标签 + 值」，无图标/无状态徽标。
  const summaryItems = [
    { label: t('workspaces.summary.myWorkspaces'), value: String(list.length) },
    { label: t('workspaces.summary.myOwned'), value: String(myOwnedCount) },
    { label: t('workspaces.summary.logging'), value: t('workspaces.summary.enabledCount', { count: loggingKnown ? loggingOnCount : 0 }) },
    { label: t('workspaces.summary.forwarding'), value: t('workspaces.summary.enabledCount', { count: forwardKnown ? forwardOnCount : 0 }) },
  ]

  return (
    // space-y-6（非 flex gap）：PageHeader 的 mb-6 与容器间距折叠为 24px，对齐企业管理页（需求方#167）
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 头部标题与描述 */}
      <PageHeader
        title={t('workspaces.title')}
        description={t(isEnterprise ? 'workspaces.subtitle' : 'workspaces.subtitlePersonal')}
        actions={
          canCreateWorkspace ? (
          <Button
            variant="brand"
            data-track="workspaces:create"
            disabled={atWorkspaceLimit}
            title={atWorkspaceLimit && tenant ? t('workspaces.toast.limitReached', { max: tenant.max_workspaces }) : undefined}
            onClick={() => { trackAction(PERMS.WORKSPACE_CREATE); setModalVisible(true) }}
            className="!rounded-full px-6 h-[38px] font-bold"
          >
            <LuPlus className="mr-1 shrink-0" /> {t('workspaces.createBtn')}
          </Button>
          ) : undefined
        }
      />

      {/* 摘要条（对齐 PRD space-summary-strip：4 项等分、竖线分隔、仅标签+值） */}
      <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-mg-border/30 overflow-hidden">
        {summaryItems.map((item) => (
          <div key={item.label} className="flex flex-col gap-1 px-5 py-4 min-w-0">
            <span className="text-xs font-bold text-mg-text-3 uppercase tracking-wider truncate">{item.label}</span>
            <span className="text-lg font-bold text-mg-text-1 truncate">{item.value}</span>
          </div>
        ))}
      </div>

      {/* 空间列表面板（对齐 PRD panel.space-list-panel：工具条 + 卡片网格同处一个面板内） */}
      <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-4 flex flex-col gap-3.5">
        {/* 工具条：搜索框 + 空间计数（对齐 PRD space-toolbar） */}
        <div className="flex items-center gap-3">
          <Input
            variant="search"
            placeholder={t('workspaces.searchPlaceholder')}
            prefix={<LuSearch className="opacity-50" />}
            className="w-full"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
          <span className="text-xs font-bold text-mg-text-3 whitespace-nowrap">
            {t('workspaces.countSuffix', { count: filteredData.length })}
          </span>
        </div>

        {/* 卡片网格（对齐 PRD space-card-grid：两列等分） */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-mg-text-3 gap-2">
            <svg className="animate-spin h-5 w-5 text-brand-base" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="font-semibold tracking-wide text-sm">{t('workspaces.loading')}</span>
          </div>
        ) : filteredData.length === 0 ? (
          /* 空态（对齐 PRD space-empty-state：图标 + 文案 + 清空搜索） */
          <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-mg-border rounded-lg py-14 text-mg-text-3">
            <LuFolderKanban size={24} />
            <strong className="text-sm font-bold text-mg-text-2">{t('workspaces.noMatchTitle')}</strong>
            {searchValue.trim() && (
              <button type="button" onClick={() => setSearchValue('')} className="text-xs font-bold text-brand-base hover:underline">
                {t('workspaces.clearSearch')}
              </button>
            )}
          </div>
        ) : (
          // 限高 + 内部滚动：空间多时列表不再无限撑高页面（需求方）；pr-1 给滚动条留位
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
            {filteredData.map((ws) => {
              const isSelected = validSelectedId === ws.workspace_id
              return (
                <Card
                  key={ws.workspace_id}
                  level={2}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => selectWorkspace(ws.workspace_id)}
                  onKeyDown={(event) => handleWorkspaceCardKeyDown(event, ws.workspace_id)}
                  className={cn(
                    "flex flex-col gap-2.5 p-3.5 min-h-[176px] cursor-pointer transition-colors border rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2",
                    isSelected
                      ? "border-brand-base bg-brand-base/5"
                      : "bg-mg-bg-0 border-mg-border/40 hover:bg-mg-fill-0/20 hover:border-mg-border/60"
                  )}
                >
                  {/* 头部：名称 + slug / 默认标识（对齐 PRD space-card-head） */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-mg-text-1 text-[15px] truncate">{ws.name}</h3>
                      <div className="font-mono text-xs text-mg-text-3 truncate mt-1">@{ws.slug}</div>
                    </div>
                    {ws.is_default && (
                      <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-mg-warning/8 text-mg-warning">
                        {t('workspaces.defaultBadge')}
                      </span>
                    )}
                  </div>

                  {/* 描述（对齐 PRD space-card p） */}
                  <p className="text-xs text-mg-text-3 leading-relaxed line-clamp-2" title={ws.description || undefined}>
                    {ws.description || dash}
                  </p>

                  {/* 元信息 2×2（对齐 PRD space-card-meta：负责人 / 成员 / API Keys / 护栏） */}
                  <div className="mt-auto grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs text-mg-text-3">
                    <span className="truncate">{t('workspaces.card.owner')} {ws.owner?.display_name || dash}</span>
                    {isEnterprise && <span className="truncate">{t('workspaces.card.metaMembers', { count: ws.member_count ?? 0 })}</span>}
                    <span className="truncate">{t('workspaces.card.metaKeys', { count: ws.api_key_count ?? 0 })}</span>
                    <span className="truncate">{t('workspaces.card.metaGuardrails', { count: ws.guardrail_count ?? 0 })}</span>
                  </div>

                  {/* 状态行（对齐 PRD space-card-status-row：采集 / 转发 状态胶囊） */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      ws.logging_enabled ? "bg-mg-success/10 text-mg-success" : "bg-mg-fill-0/40 text-mg-text-3"
                    )}>
                      {ws.logging_enabled ? t('workspaces.card.collectOn') : t('workspaces.card.collectOff')}
                    </span>
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      ws.forward_enabled ? "bg-mg-success/10 text-mg-success" : "bg-mg-fill-0/40 text-mg-text-3"
                    )}>
                      {ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.card.forwardOff')}
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* 下方详情区改为主工作台 */}
      {validSelectedId && !isLoading && filteredData.length > 0 && (
        <WorkspaceDashboard
          workspaceId={validSelectedId}
          initialTab={validSelectedId === linkedWorkspaceId ? initialTab : undefined}
          onDeleted={() => {
            setSelectedId('')
            queryClient.invalidateQueries({ queryKey: ['workspaces', activeTenantId] })
          }}
        />
      )}

      {/* 真实创建工作空间的表单对话框 */}
      <WorkspaceCreateModal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        workspaceCount={items.length}
      />
    </div>
  )
}
