/**
 * 空间管理页
 * 路由：/workspaces
 * API：GET /workspaces、POST /workspaces
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useAuthStore } from '@/store/auth'
import { useTranslation } from 'react-i18next'
import {
  LuSearch,
  LuPlus,
  LuKey,
  LuUser,
  LuClipboardList,
  LuSend,
  LuChevronRight,
  LuCircleDollarSign,
  LuActivity,
  LuDatabase,
  LuFileText,
  LuLayoutGrid,
  LuLayoutList
} from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces, createWorkspace, getWorkspace } from '@/services/workspaces'
import { listTenantMembers } from '@/services/tenants'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { useClientPage } from '@/hooks/use-client-page'
import {
  MembersTab,
  LogsForwardingTab,
  SettingsTab
} from '@/pages/settings/workspace-detail'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { TagInput, type TagOption } from '@/components/ui/TagInput'
import { cn, formatMoney as fmtMoney } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/format-date'
import { trackAction, trackPageView, trackEvent } from '@/lib/track'
import { PERMS } from '@/config/permissions'
import { usePermissions } from '@/hooks/use-permissions'
import { useNavigate } from 'react-router-dom'
import type { WorkspaceDetail, Money } from '@/types'

const MAX_INVITE_MEMBERS = 20

/** 名称派生 slug：小写化、空白转短横线，过滤非字母数字短横线的非法字符 */
function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]+/g, '')
}

/**
 * 兜底 slug：中文/纯非 ASCII 名称 slugify 后会变成空字符串，后端 slug 必填（minLength 2），
 * 空值直接 400。用「租户 slug + 当前空间序号」拼一个必定合法、大概率不重复的默认值
 * （对齐用户预期：默认填入，少让手动输入；真撞车了已有的手动改 Slug 兜底路径处理）。
 */
function fallbackSlug(tenantSlug: string | undefined, workspaceCount: number) {
  const base = tenantSlug ? slugify(tenantSlug) : ''
  return `${base || 'space'}-${workspaceCount + 1}`
}

export default function WorkspacesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountEmail = useAuthStore((s) => s.account?.email)
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
  // 单页结构：选中卡片在下方展开详情（不跳路由，对齐原型 .space-detail-shell）
  const [selectedId, setSelectedId] = useState<string>('')
  // 卡片密度：detailed=两列大卡（全字段）｜ compact=四列小卡（仅名称/slug/负责人）。
  // 两档都是换行网格、跟随页面纵向滚动，不做横向滚动——密度和"是否横滚"是两件事，
  // 之前把两者混在一起删掉是错的（见反馈）。
  const [density, setDensity] = useState<'detailed' | 'compact'>('detailed')

  // 受控表单状态
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  // 用户是否手动改过 Slug：改过之后名称变化不再联动覆盖
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  // 创建空间先选负责人，再选初始成员；接口用 ws_owner / ws_member 区分两者。
  const [ownerEmail, setOwnerEmail] = useState(currentAccountEmail ?? '')
  const [selectedMemberEmails, setSelectedMemberEmails] = useState<string[]>([])

  // ─── 1. TanStack Query 真实获取工作空间接口数据 ─────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then(res => res.items || []),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

  // 企业组织成员（初始成员 combobox 数据源）；个人租户没有其他企业成员，不发这个请求
  const tenantMembersQuery = useQuery({
    queryKey: ['tenant-members', activeTenantId],
    queryFn: () => listTenantMembers(activeTenantId!, { page_size: 100 }),
    enabled: Boolean(activeTenantId) && isEnterprise,
    staleTime: 60_000,
  })

  const ownerOptions: TagOption[] = useMemo(() => {
    const items = tenantMembersQuery.data?.items ?? []
    return items.map((m) => ({
      value: m.account.email,
      label: `${m.account.display_name} (${m.account.email})`,
    }))
  }, [tenantMembersQuery.data])

  // 初始成员不重复展示负责人；负责人由单独字段选择并随创建请求一起提交。
  const memberOptions: TagOption[] = useMemo(() => {
    return ownerOptions.filter((option) => option.value !== ownerEmail)
  }, [ownerEmail, ownerOptions])

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

  // ─── 2. Mutation 真实绑定新建工作空间接口 ─────────────────────
  const createMutation = useMutation({
    mutationFn: (vals: { name: string; slug: string; description?: string; owner: string; members: string[] }) => {
      const invite_members = isEnterprise
        ? [
            { email: vals.owner, role: 'ws_owner' as const },
            ...vals.members.map((email) => ({ email, role: 'ws_member' as const })),
          ]
        : undefined
      return createWorkspace({
        name: vals.name,
        slug: vals.slug,
        description: vals.description,
        kind: 'team',
        invite_members,
      })
    },
    onSuccess: (newWorkspace) => {
      toast.success(t('workspaces.toast.createSuccess', { name: newWorkspace.name }))
      setModalVisible(false)
      setName('')
      setSlug('')
      setSlugTouched(false)
      setDescription('')
      setOwnerEmail(currentAccountEmail ?? '')
      setSelectedMemberEmails([])
      queryClient.invalidateQueries({ queryKey: ['workspaces', activeTenantId] })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err
            ? String((err as Record<string, unknown>).message)
            : '')
      toast.error(message || t('workspaces.toast.createError'))
    }
  })

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
  // 密度不同、每页展示条数也不同：紧凑卡片小，一页装得下更多。
  // 详细卡固定两行（4 张）封顶卡区高度——多空间时详情面板仍紧跟卡区可见，
  // 不做卡区内嵌滚动（页内嵌套滚动条是布局异味），翻页承接剩余空间。
  const pageSize = density === 'compact' ? 12 : 4
  const { paged: pagedData, page: currentPage, setPage: setCurrentPage, total: pagedTotal } = useClientPage(filteredData, pageSize)

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      toast.error(t('workspaces.toast.nameRequired'))
      return
    }
    if (!ownerEmail) {
      toast.error('请选择空间负责人')
      return
    }
    if (selectedMemberEmails.length > MAX_INVITE_MEMBERS) {
      toast.error(t('workspaces.toast.inviteLimit', { count: MAX_INVITE_MEMBERS }))
      return
    }
    // Slug 允许留空：提交时统一派生/清洗；纯中文等非 ASCII 名称派生结果也可能为空，
    // 最终落到「租户 slug-序号」兜底，保证提交前一定有合法 slug（后端 minLength 2 必填）
    const finalSlug = slugify(slug) || slugify(name) || fallbackSlug(tenant?.slug, items.length)
    createMutation.mutate({ name, slug: finalSlug, description, owner: ownerEmail, members: selectedMemberEmails })
  }

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

  const summaryItems = [
    {
      label: t('workspaces.summary.myWorkspaces'),
      // 工作空间数 / 上限（tenant.max_workspaces），拿不到租户上限时仅显数量
      value: tenant ? `${list.length} / ${tenant.max_workspaces}` : String(list.length),
      icon: <LuFileText size={16} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
    {
      label: t('workspaces.summary.myOwned'),
      value: myOwnedCount,
      icon: <LuUser size={16} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
    {
      label: t('workspaces.summary.logging'),
      value: loggingKnown ? loggingOnCount : 0,
      hasStatus: true,
      enabled: loggingKnown && loggingOnCount > 0,
      icon: <LuClipboardList size={16} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
    {
      label: t('workspaces.summary.forwarding'),
      value: forwardKnown ? forwardOnCount : 0,
      hasStatus: true,
      enabled: forwardKnown && forwardOnCount > 0,
      icon: <LuSend size={16} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
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

      {/* 摘要条 */}
      <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-4 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-0 divide-y lg:divide-y-0 lg:divide-x divide-mg-border/30">
        {summaryItems.map((item, idx) => (
          <div key={item.label} className={cn("flex items-center gap-3", idx > 0 ? "lg:pl-6" : "", idx < 3 ? "lg:pr-6" : "")}>
            <div className="w-9 h-9 rounded-lg bg-brand-base/8 text-brand-base flex items-center justify-center shrink-0">
              {item.icon}
            </div>
            <div>
              <div className="text-xs font-medium text-mg-text-3">{item.label}</div>
              <div className="text-base font-bold text-mg-text-1 mt-0.5 flex items-baseline gap-1">
                <span>{item.value}</span>
                {item.hasStatus && (
                  <span className={cn("text-xs font-semibold ml-1.5 px-1.5 py-0.5 rounded-sm bg-mg-success/8 text-mg-success")}>
                    {item.label === t('workspaces.summary.logging') ? t('workspaces.card.collectOn') : t('workspaces.card.forwardOn')}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 控制台操作区域 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 w-full">
        <div className="flex flex-1 items-center gap-3 w-full max-w-[560px]">
          {/* 圆角微阴影输入框 */}
          <Input
            variant="search"
            placeholder={t('workspaces.searchPlaceholder')}
            prefix={<LuSearch className="opacity-50" />}
            className="w-full"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
          {/* 空间计数（对齐原型：X 个空间） */}
          <span className="text-xs text-mg-text-3 whitespace-nowrap">
            {t('workspaces.countSuffix', { count: filteredData.length })}
          </span>
        </div>

        {/* 密度切换：详细大卡 ↔ 紧凑小卡，两档都是换行网格，不做横向滚动 */}
        {filteredData.length > 0 && (
          <div className="flex items-center gap-1 bg-mg-fill-0/10 p-0.5 rounded-lg border border-mg-border/20 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDensity('detailed')}
              className={cn(
                "h-7 w-7 !rounded-md flex items-center justify-center border transition-all p-0",
                density === 'detailed'
                  ? "bg-brand-base/10 text-brand-base shadow-sm border-brand-base/20"
                  : "bg-transparent text-mg-text-3 border-transparent hover:text-mg-text-1 hover:bg-mg-fill-0/20"
              )}
              title={t('workspaces.density.detailed')}
            >
              <LuLayoutGrid size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDensity('compact')}
              className={cn(
                "h-7 w-7 !rounded-md flex items-center justify-center border transition-all p-0",
                density === 'compact'
                  ? "bg-brand-base/10 text-brand-base shadow-sm border-brand-base/20"
                  : "bg-transparent text-mg-text-3 border-transparent hover:text-mg-text-1 hover:bg-mg-fill-0/20"
              )}
              title={t('workspaces.density.compact')}
            >
              <LuLayoutList size={14} />
            </Button>
          </div>
        )}
      </div>

      {/* 空间列表区域 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-mg-text-3 gap-2">
          <svg className="animate-spin h-5 w-5 text-brand-base" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-semibold tracking-wide text-sm">{t('workspaces.loading')}</span>
        </div>
      ) : filteredData.length === 0 ? (
        <EmptyState title={t('workspaces.empty')} />
      ) : density === 'compact' ? (
        /* 紧凑网格：四列小卡，只留名称/slug/负责人——换行网格，不横滚 */
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {pagedData.map((ws) => {
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
                  "group relative p-3 flex flex-col gap-1.5 cursor-pointer transition-all border overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2",
                  isSelected
                    ? "mg-running-border shadow-sm"
                    : "bg-mg-bg-0 border-mg-border/40 hover:bg-mg-fill-0/20 hover:border-mg-border/60"
                )}
              >
                {isSelected && (
                  <span className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-base opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-base"></span>
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-mg-text-1 text-[13px] truncate">{ws.name}</h3>
                  {ws.is_default && (
                    <span className="shrink-0 scale-75 origin-left text-xs font-semibold px-1.5 py-0.5 rounded-sm bg-mg-warning/8 text-mg-warning border border-mg-warning/15">
                      {t('workspaces.defaultBadge')}
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-mg-text-3 truncate">@{ws.slug}</div>
                <div className="text-xs text-mg-text-3 truncate">
                  {t('workspaces.card.owner')} <span className="font-semibold text-mg-text-2">{ws.owner?.display_name || dash}</span>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* 详细网格：两列大卡，全字段——对齐 PRD .space-card-grid，换行网格随页面纵向滚动 */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pagedData.map((ws) => {
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
                  "group relative p-4 flex flex-col gap-3 cursor-pointer transition-all border overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2",
                  isSelected
                    ? "mg-running-border shadow-sm"
                    : "bg-mg-bg-0 border-mg-border/40 hover:bg-mg-fill-0/20 hover:border-mg-border/60"
                )}
              >
                {/* 右上角品牌色脉动呼吸点 */}
                {isSelected && (
                  <span className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-base opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-base"></span>
                  </span>
                )}

                {/* 头部：名称/默认/钥匙图标和菜单 */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-mg-text-1 text-[15px] truncate">{ws.name}</h3>
                      {ws.is_default && (
                        <Badge variant="warning" dot className="shrink-0">
                          {t('workspaces.defaultBadge')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs font-mono text-mg-text-3">
                      <span className="truncate">@{ws.slug}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-brand-base/8 border border-brand-base/15 flex items-center justify-center text-brand-base">
                      <LuKey size={14} />
                    </div>
                  </div>
                </div>

                {/* 描述恒占一行占位（无描述显 —）：避免同排卡因条件渲染节奏错位 */}
                <p className="text-xs text-mg-text-3 leading-snug truncate" title={ws.description || undefined}>
                  {ws.description || dash}
                </p>

                {/* 负责人 */}
                <div className="text-xs text-mg-text-3">
                  {t('workspaces.card.owner')}{' '}
                  <span className="font-semibold text-mg-text-2">
                    {ws.owner?.display_name || dash}
                  </span>
                </div>

                {/* 成员 / API Keys / 护栏 (居中三等分，用细线分割) */}
                <div className={cn("grid divide-x divide-mg-border/20 text-center py-2 bg-mg-fill-0/10 rounded-lg border border-mg-border/10", isEnterprise ? "grid-cols-3" : "grid-cols-2")}>
                  {isEnterprise && (
                    <div>
                      <div className="text-sm font-bold text-mg-text-1">{ws.member_count}</div>
                      <div className="text-xs text-mg-text-3 mt-0.5">{t('workspaces.card.members')}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-bold text-mg-text-1">{ws.api_key_count}</div>
                    <div className="text-xs text-mg-text-3 mt-0.5">API Keys</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-mg-text-1">{ws.guardrail_count ?? dash}</div>
                    <div className="text-xs text-mg-text-3 mt-0.5">{t('workspaces.card.guardrails')}</div>
                  </div>
                </div>

                {/* 日志采集 / 转发状态（mt-auto 锚底：同排等高时底边始终对齐） */}
                <div className="mt-auto flex items-center gap-3 pt-2.5 border-t border-mg-border/30">
                  <div className="flex items-center gap-1.5 text-xs text-mg-text-3 bg-mg-fill-0/15 border border-mg-border/20 px-2 py-1 rounded-md">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", ws.logging_enabled ? "bg-mg-success animate-pulse" : "bg-mg-text-3/40")} />
                    <span>
                      {t('workspaces.summary.logging')}{' '}
                      <span className={ws.logging_enabled ? "text-mg-success font-semibold" : "text-mg-text-2"}>
                        {ws.logging_enabled ? t('workspaces.card.collectOn') : t('workspaces.card.collectOff')}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-mg-text-3 bg-mg-fill-0/15 border border-mg-border/20 px-2 py-1 rounded-md">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", ws.forward_enabled ? "bg-mg-success animate-pulse" : "bg-mg-text-3/40")} />
                    <span>
                      {t('workspaces.summary.forwarding')}{' '}
                      <span className={ws.forward_enabled ? "text-mg-success font-semibold" : "text-mg-text-2"}>
                        {ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.card.forwardOff')}
                      </span>
                    </span>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* 客户端分页：搜索后的全量结果做展示层切片，不影响搜索范围 */}
      {!isLoading && pagedTotal > pageSize && (
        <Pagination mode="page" page={currentPage} total={pagedTotal} pageSize={pageSize} onPageChange={setCurrentPage} />
      )}

      {/* 下方详情区改为主工作台 */}
      {validSelectedId && !isLoading && filteredData.length > 0 && (
        <WorkspaceDashboard
          workspaceId={validSelectedId}
          onDeleted={() => {
            setSelectedId('')
            queryClient.invalidateQueries({ queryKey: ['workspaces', activeTenantId] })
          }}
        />
      )}

      {/* 真实创建工作空间的表单对话框 */}
      <Modal
        open={modalVisible}
        onClose={() => setModalVisible(false)}
        title={t('workspaces.modal.title')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalVisible(false)}>{t('workspaces.modal.cancel')}</Button>
            <Button variant="brand" data-track="workspaces:create_submit" loading={createMutation.isPending} onClick={handleCreateSubmit}>{t('workspaces.modal.confirm')}</Button>
          </>
        }
      >
        <div className="py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.nameLabel')}</div>
              <Input
                value={name}
                data-track="workspaces:field_name"
                onChange={e => {
                  const v = e.target.value
                  setName(v)
                  // 用户还没手动改过 Slug 时，名称实时派生同步进 Slug；
                  // 纯中文等非 ASCII 名称 slugify 后为空，落到「租户 slug-序号」兜底
                  if (!slugTouched) setSlug(slugify(v) || fallbackSlug(tenant?.slug, items.length))
                }}
                placeholder={t('workspaces.modal.namePlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.slugLabel')}</div>
              <Input
                value={slug}
                onChange={e => { setSlugTouched(true); setSlug(e.target.value) }}
                placeholder={t('workspaces.modal.slugPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.descLabel')}</div>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('workspaces.modal.descPlaceholder')}
                rows={3}
                className="min-h-[84px]"
              />
            </div>
            {/* PRD：先设置负责人，再配置初始成员；不在创建弹窗里配置多个管理员。 */}
            {isEnterprise && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-bold text-mg-text-2">空间负责人</div>
                  <Select
                    value={ownerEmail}
                    onChange={(value) => {
                      setOwnerEmail(value)
                      setSelectedMemberEmails((current) => current.filter((email) => email !== value))
                    }}
                  >
                    {ownerOptions.map((option) => (
                      <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-bold text-mg-text-2">初始成员</div>
                  <TagInput
                    value={selectedMemberEmails}
                    onChange={setSelectedMemberEmails}
                    options={memberOptions}
                    placeholder="搜索企业成员，回车添加"
                  />
                  <div className="text-xs text-mg-text-3">负责人会自动加入空间；其他成员以普通成员身份加入。</div>
                </div>
              </div>
            )}
          </div>
      </Modal>
    </div>
  )
}

/**
 * 空间详情面板（主工作台概览）
 * PRD 原型 WorkspaceOverviewTab（需求方#67）：4 指标卡 + 资源磁贴两行，无「运行资源/快捷入口」分组框。
 */
function WorkspaceOverview({ ws, onGoLogs }: { ws: WorkspaceDetail; onGoLogs: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()

  const usageCards = [
    {
      label: t('workspaces.detail.overview.spend'),
      value: renderMoney(ws.usage_7d?.spend),
      hint: t('workspaces.detail.overview.spendHint'),
      icon: <LuCircleDollarSign size={20} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
    {
      label: t('workspaces.detail.overview.requests'),
      value: (ws.usage_7d?.requests ?? 0).toLocaleString(),
      hint: ws.last_request_at ? formatRelativeTime(ws.last_request_at) : t('workspaces.detail.overview.never'),
      icon: <LuActivity size={20} className="text-mg-success" />,
      bg: 'bg-mg-success/8'
    },
    {
      label: t('workspaces.detail.overview.tokens'),
      value: (ws.usage_7d?.tokens ?? 0).toLocaleString(),
      hint: t('workspaces.detail.overview.tokensHint'),
      icon: <LuDatabase size={20} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
    {
      label: 'API Keys',
      value: (ws.api_key_count ?? 0).toLocaleString(),
      hint: t('workspaces.detail.overview.guardrailsHint', { count: ws.guardrail_count ?? 0 }),
      icon: <LuKey size={20} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
  ]

  // 资源磁贴（原型 SpaceResourceCard：小标签 + 资源名 + 描述 + 动作文本）
  const resourceCards = [
    {
      label: t('workspaces.detail.overview.credLabel'),
      value: 'API Keys',
      meta: t('workspaces.detail.overview.keysOwner', { count: ws.api_key_count ?? 0, owner: ws.owner?.display_name || '—' }),
      action: t('workspaces.detail.overview.viewKey'),
      onClick: () => navigate(`/workspace/${ws.workspace_id}/api-keys`),
      visible: hasPermission(PERMS.API_KEYS_VIEW),
    },
    {
      label: t('workspaces.detail.overview.securityLabel'),
      value: t('workspaces.detail.overview.guardrailsValue'),
      meta: t('workspaces.detail.overview.guardrailsHint', { count: ws.guardrail_count ?? 0 }),
      action: t('workspaces.detail.overview.viewGuardrails'),
      onClick: () => navigate(`/workspace/${ws.workspace_id}/guardrails`),
      visible: hasPermission(PERMS.GUARDRAILS_VIEW),
    },
    {
      label: t('workspaces.detail.overview.troubleshootLabel'),
      value: t('workspaces.detail.overview.logsTitle'),
      meta: ws.last_request_at
        ? `${t('workspaces.detail.overview.lastRequest')} ${formatRelativeTime(ws.last_request_at)}`
        : t('workspaces.detail.overview.goLogsDesc'),
      action: t('workspaces.detail.overview.viewLogs'),
      onClick: () => navigate(`/logs?workspace=${ws.workspace_id}`),
      visible: hasPermission(PERMS.LOGS_VIEW),
    },
    {
      label: t('workspaces.detail.tabs.logs'),
      value: ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.card.forwardOff'),
      meta: `${ws.logging_enabled ? t('workspaces.card.collectOn') : t('workspaces.card.collectOff')} · ${ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.detail.overview.notForwarded')}`,
      action: t('workspaces.detail.overview.configure'),
      onClick: onGoLogs,
      visible: hasPermission(PERMS.OBSERVABILITY_VIEW),
      // 本页内切页签（非外跳）：动作用蓝色内联文本、无外跳箭头（对齐 PRD actionKind="inline"）
      inline: true,
    },
  ]

  return (
    <div className="space-y-4">
      {/* 4项 7天指标（对齐 PRD space-overview-grid：值 + 副行说明） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {usageCards.map((c) => (
          <div key={c.label} className="flex items-center gap-4 bg-mg-fill-0/10 border border-mg-border/20 rounded-lg p-5">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", c.bg)}>
              {c.icon}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-mg-text-3">{c.label}</div>
              <div className="text-base font-bold text-mg-text-1 mt-0.5">{c.value}</div>
              <div className="text-xs text-mg-text-3 mt-0.5 truncate">{c.hint}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 资源磁贴（对齐 PRD space-resource-grid：运行凭证/安全策略/排障入口/日志与转发） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {resourceCards.filter((c) => c.visible).map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={c.onClick}
            className="text-left bg-mg-fill-0/10 border border-mg-border/20 rounded-lg p-5 flex flex-col gap-1 cursor-pointer transition-all hover:border-brand-base/40 hover:bg-mg-fill-0/20 group"
          >
            <span className="text-xs text-mg-text-3">{c.label}</span>
            <span className="text-sm font-bold text-mg-text-1">{c.value}</span>
            <span className="text-xs text-mg-text-3 truncate">{c.meta}</span>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-base group-hover:text-brand-base/80 transition-colors">
              {c.action}
              {!('inline' in c && c.inline) && <LuChevronRight size={12} />}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface WorkspaceDashboardProps {
  workspaceId: string
  onDeleted: () => void
}

/**
 * 空间管理主工作台组件（包含详情头部、状态以及 4 tabs）
 */
function WorkspaceDashboard({ workspaceId, onDeleted }: WorkspaceDashboardProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'overview' | 'members' | 'logs' | 'settings'>('overview')
  // 个人租户没有企业成员，空间管理不该有「成员」tab（无人可邀请/管理）；仅企业租户显示。
  const { isEnterprise } = useTenantRole()
  const { hasPermission } = usePermissions()
  const canViewMembers = isEnterprise && hasPermission(PERMS.WORKSPACE_MEMBERS_VIEW)
  const canViewLogs = hasPermission(PERMS.OBSERVABILITY_VIEW)
  const canViewSettings = hasPermission(PERMS.WORKSPACE_SETTINGS_EDIT)
    || hasPermission(PERMS.WORKSPACE_RENAME)
    || hasPermission(PERMS.WORKSPACE_DELETE)
  const activeTab = (
    (tab === 'members' && !canViewMembers)
    || (tab === 'logs' && !canViewLogs)
    || (tab === 'settings' && !canViewSettings)
  ) ? 'overview' : tab

  const detailQuery = useQuery({
    queryKey: ['workspace-detail', workspaceId],
    queryFn: () => getWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  })

  const ws = detailQuery.data

  if (detailQuery.isLoading) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-6 flex flex-col gap-4 animate-pulse">
        <div className="h-6 bg-mg-fill-0 rounded w-1/3" />
        <div className="h-4 bg-mg-fill-0 rounded w-1/4" />
        <div className="h-40 bg-mg-fill-0 rounded w-full mt-4" />
      </div>
    )
  }

  if (!ws) {
    return (
      <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-6 text-center text-mg-text-3">
        {t('workspaces.detail.notFound')}
      </div>
    )
  }

  // 详情页签（PRD 原型 space-detail-tabs：磁贴式，标题 + 说明副行；需求方#67）
  const detailTabs = [
    { value: 'overview', label: t('workspaces.detail.tabs.overview'), desc: t('workspaces.detail.tabs.overviewDesc'), visible: true },
    { value: 'members', label: t('workspaces.detail.tabs.members'), desc: t('workspaces.detail.tabs.membersDesc'), visible: canViewMembers },
    { value: 'logs', label: t('workspaces.detail.tabs.logs'), desc: t('workspaces.detail.tabs.logsDesc'), visible: canViewLogs },
    { value: 'settings', label: t('workspaces.detail.tabs.settings'), desc: t('workspaces.detail.tabs.settingsDesc'), visible: canViewSettings },
  ].filter((item) => item.visible)

  return (
    <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-6 flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 头部（PRD 原型 space-detail-head：仅 slug + 名称，其余信息归各页签；需求方#67） */}
      <div className="space-y-1">
        <span className="font-mono text-xs text-mg-text-3">@{ws.slug}</span>
        <h3 className="text-lg font-bold text-mg-text-1 tracking-tight m-0">{ws.name}</h3>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { trackEvent('workspaces:tab_click', { tab: v }); setTab(v as 'overview' | 'members' | 'logs' | 'settings') }}>
        <TabsList
          className={cn(
            'grid w-full gap-px overflow-hidden rounded-lg border border-mg-border bg-mg-border/60 p-0',
            detailTabs.length === 2 && 'grid-cols-2',
            detailTabs.length === 3 && 'grid-cols-3',
            detailTabs.length >= 4 && 'grid-cols-2 lg:grid-cols-4',
          )}
        >
          {detailTabs.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-none border-0 bg-mg-bg-0 px-4 py-3 text-left',
                'data-[state=active]:bg-mg-fill-0/40',
              )}
            >
              <strong className={cn('text-[13px] font-bold', activeTab === item.value ? 'text-brand-base' : 'text-mg-text-1')}>
                {item.label}
              </strong>
              <span className="text-xs font-normal text-mg-text-3">{item.desc}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <WorkspaceOverview ws={ws} onGoLogs={() => { if (canViewLogs) setTab('logs') }} />
        </TabsContent>
        {canViewMembers && (
          <TabsContent value="members">
            <MembersTab workspaceId={workspaceId} />
          </TabsContent>
        )}
        {canViewLogs && (
          <TabsContent value="logs">
            <LogsForwardingTab workspaceId={workspaceId} />
          </TabsContent>
        )}
        {canViewSettings && (
          <TabsContent value="settings">
            <SettingsTab ws={ws} onDeleted={onDeleted} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

/**
 * 格式化货币显示
 */
function renderMoney(m?: Money) {
  if (!m) return '—'
  return `${m.currency} ${fmtMoney(m.amount, '')}`
}
