/**
 * 空间管理页
 * 路由：/workspaces
 * API：GET /workspaces、POST /workspaces
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useTranslation } from 'react-i18next'
import {
  LuSearch,
  LuPlus,
  LuFolderKanban
} from 'react-icons/lu'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces } from '@/services/workspaces'
import { getProfile, setDefaultWorkspace } from '@/services/account'
import { appToast } from '@/lib/app-toast'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { InfoTip } from '@/components/ui/InfoTip'
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
  const { isEnterprise, tenant, canManage: canManageTenant } = useTenantRole()
  const { hasPermission } = usePermissions()
  // 具体角色由后端角色矩阵决定；前端只消费当前会话的 Permission ID。
  const canCreateWorkspace = hasPermission(PERMS.WORKSPACE_CREATE)

  useEffect(() => {
    trackPageView('workspaces')
  }, [])

  const [searchValue, setSearchValue] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  // 深链支持：从日志页「去开启日志与转发」等入口带 ?workspaceId=&tab= 跳过来时，
  // 直接选中该空间并展开对应 Tab（仅影响首次挂载的初始值，之后用户点击卡片/Tab 不受影响）。
  const [searchParams] = useSearchParams()
  const deepLinkTab = searchParams.get('tab')
  const initialTab = (['overview', 'members', 'logs', 'settings'] as const)
    .find((value) => value === deepLinkTab)
  // 单页结构：选中卡片在下方展开详情（不跳路由，对齐原型 .space-detail-shell）
  const [selectedId, setSelectedId] = useState<string>(() => searchParams.get('workspaceId') ?? '')

  // ─── 1. TanStack Query 真实获取工作空间接口数据 ─────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces(),
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

  // ─── 默认空间（prd46#1209，原型 a4c9a2b/bb5fae1：入口在卡片上）────────────
  // 「默认」是账户偏好（GET /account/profile.default_workspace_id，#1097 契约；提示文案
  // 「仅对当前账户生效」即产品口径）。账户还没设偏好时回退 is_default——此时登录实际落到的
  // 就是它，显示是准确的。不再只读 is_default：否则设完标签不动，用户必然以为没生效（#1207 ①）。
  const profileQuery = useQuery({ queryKey: ['account-profile'], queryFn: getProfile })
  // 偏好指向的空间不在当前列表里（如已被移出该空间）也回退 is_default，否则所有卡片都没有「默认」
  const preferredId = profileQuery.data?.default_workspace_id
  const defaultWorkspaceId = (preferredId && items.some((w) => w.workspace_id === preferredId) ? preferredId : '')
    || items.find((w) => w.is_default)?.workspace_id
    || ''
  const setDefaultMutation = useMutation({
    mutationFn: (workspaceId: string) => setDefaultWorkspace({ workspace_id: workspaceId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['account-profile'] })
      appToast.success(t('workspaces.detail.settings.preferenceSaved'))
    },
    onError: (err: unknown) => appToast.requestError(err, t('workspaces.detail.settings.preferenceError')),
  })
  // 按钮只给能管理该空间的人（原型 canManageWorkspace：租户 owner/admin 或空间负责人）
  // 空间负责人与本文件「我负责的空间」同口径：优先 owner.account_id，没有当前账号时退 my_role
  const canSetDefault = (ws: { my_role?: string; owner?: { account_id?: string } }) => canManageTenant
    || (currentAccountId ? ws.owner?.account_id === currentAccountId : ws.my_role === 'ws_owner')


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
            prefix={<LuSearch className="w-4 h-4 opacity-50" />}
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
                  className={cn(
                    "group/card relative flex flex-col gap-2.5 p-3.5 min-h-[176px] cursor-pointer transition-colors border rounded-lg has-[[data-card-select]:focus-visible]:ring-2 has-[[data-card-select]:focus-visible]:ring-brand-base has-[[data-card-select]:focus-visible]:ring-offset-2",
                    isSelected
                      ? "border-brand-base bg-brand-base/5"
                      : "bg-mg-bg-0 border-mg-border/40 hover:bg-mg-fill-0/20 hover:border-mg-border/60"
                  )}
                >
                  {/* 选中卡片的是铺满卡片的透明按钮，「设为默认空间」是它的兄弟节点而非子节点
                      （原型 space-card-select）：不再 role=button 里嵌 button——读屏会把整张卡连同提示
                      念成一个按钮名、浏览模式下找不到里面的按钮（prd46#1209 review）。卡片内容
                      pointer-events-none 让点击落到这层；设默认按钮单独 pointer-events-auto + 叠在上面。 */}
                  <button
                    type="button"
                    data-card-select
                    aria-label={ws.name}
                    aria-pressed={isSelected}
                    onClick={() => selectWorkspace(ws.workspace_id)}
                    className="absolute inset-0 rounded-lg cursor-pointer focus-visible:outline-none"
                  />
                  {/* 头部：名称 + 默认标识（对齐 PRD space-card-head）；slug 展示按需求方反馈删除 (prd#596) */}
                  <div className="pointer-events-none relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-mg-text-1 text-[15px] truncate">{ws.name}</h3>
                    </div>
                    {ws.workspace_id === defaultWorkspaceId ? (
                      <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-mg-warning/8 text-mg-warning">
                        {t('workspaces.defaultBadge')}
                      </span>
                    ) : !profileQuery.isPending && canSetDefault(ws) ? (
                      // 偏好读失败也给入口（这里是默认空间唯一入口），写操作本身不依赖读结果
                      // 悬停/聚焦卡片才显示（原型 .space-card:hover / :focus-within）；触屏无 hover 时常显。
                      // 点击不冒泡：不选中卡片、不跳转、不改写当前活动空间（#1209 验收）
                      <InfoTip
                        text={t('workspaces.card.setDefaultTip')}
                        id={`ws-default-tip-${ws.workspace_id}`}
                        side="bottom"
                        align="end"
                        className="pointer-events-auto z-[1] shrink-0"
                      >
                        <Button
                          variant="secondary"
                          size="small"
                          aria-describedby={`ws-default-tip-${ws.workspace_id}`}
                          loading={setDefaultMutation.isPending && setDefaultMutation.variables === ws.workspace_id}
                          disabled={setDefaultMutation.isPending}
                          onClick={() => setDefaultMutation.mutate(ws.workspace_id)}
                          className="h-[26px] px-2 text-xs font-semibold transition-opacity duration-150 opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto group-focus-within/card:opacity-100 group-focus-within/card:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                        >
                          {t('workspaces.card.setDefault')}
                        </Button>
                      </InfoTip>
                    ) : null}
                  </div>

                  {/* 描述（对齐 PRD space-card p）。没填就整行不渲染——原先回落「—」占一行
                      却不带信息，而且它正好落在早先 @slug 的位置，被连着误认成「slug 显示成
                      —」报了缺陷（需求方#632）。slug 本身按 prd#596 已在 6815dbf8 移除。 */}
                  {ws.description && (
                    <p className="pointer-events-none relative text-xs text-mg-text-3 leading-relaxed line-clamp-2" title={ws.description}>
                      {ws.description}
                    </p>
                  )}

                  {/* 元信息 2×2（对齐 PRD space-card-meta：负责人 / 成员 / API Keys / 护栏） */}
                  <div className="pointer-events-none relative mt-auto grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs text-mg-text-3">
                    <span className="truncate">{t('workspaces.card.owner')} {ws.owner?.display_name || dash}</span>
                    {isEnterprise && <span className="truncate">{t('workspaces.card.metaMembers', { count: ws.member_count ?? 0 })}</span>}
                    <span className="truncate">{t('workspaces.card.metaKeys', { count: ws.api_key_count ?? 0 })}</span>
                    <span className="truncate">{t('workspaces.card.metaGuardrails', { count: ws.guardrail_count ?? 0 })}</span>
                  </div>

                  {/* 状态行（对齐 PRD space-card-status-row：采集 / 转发 状态胶囊） */}
                  <div className="pointer-events-none relative flex flex-wrap items-center gap-2">
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
          initialTab={initialTab}
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
