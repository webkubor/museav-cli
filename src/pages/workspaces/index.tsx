/**
 * 空间管理页
 * 路由：/workspaces
 * API：GET /workspaces、POST /workspaces
 */
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useTranslation } from 'react-i18next'
import {
  LuSearch,
  LuPlus,
  LuKey,
  LuUser,
  LuUsers,
  LuShield,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { TagInput, type TagOption } from '@/components/ui/TagInput'
import { cn, formatMoney as fmtMoney } from '@/lib/utils'
import { trackAction } from '@/lib/track'
import { PERMS } from '@/config/permissions'
import { useNavigate } from 'react-router-dom'
import type { WorkspaceDetail, Money } from '@/types'

type InviteRole = 'ws_admin' | 'ws_member'

const MAX_INVITE_MEMBERS = 20

/** 名称派生 slug：小写化、空白转短横线，过滤非字母数字短横线的非法字符 */
function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]+/g, '')
}

export default function WorkspacesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountEmail = useAuthStore((s) => s.account?.email)
  const { isEnterprise, tenant } = useTenantRole()
  const [searchValue, setSearchValue] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  // 单页结构：选中卡片在下方展开详情（不跳路由，对齐原型 .space-detail-shell）
  const [selectedId, setSelectedId] = useState<string>('')
  // 布局切换：compact（紧凑横滚） | grid（网格展开）
  const [viewMode, setViewMode] = useState<'compact' | 'grid'>('compact')

  // 受控表单状态
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  // 用户是否手动改过 Slug：改过之后名称变化不再联动覆盖
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  // 初始成员：企业租户下从组织成员里搜索选取，值为对方邮箱（直接对齐 invite_members 参数）
  const [selectedMemberEmails, setSelectedMemberEmails] = useState<string[]>([])
  const [inviteRole, setInviteRole] = useState<InviteRole>('ws_member')

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

  // 候选成员：排除自己（创建者自动成为负责人，无需再邀请自己）
  const memberOptions: TagOption[] = useMemo(() => {
    const items = tenantMembersQuery.data?.items ?? []
    return items
      .filter((m) => m.account.email !== currentAccountEmail)
      .map((m) => ({
        value: m.account.email,
        label: `${m.account.display_name} (${m.account.email})`,
      }))
  }, [tenantMembersQuery.data, currentAccountEmail])

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
    mutationFn: (vals: { name: string; slug: string; description?: string; inviteMembers: string[]; inviteRole: InviteRole }) => {
      const invite_members = vals.inviteMembers.length > 0
        ? vals.inviteMembers.map((email) => ({ email, role: vals.inviteRole }))
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
      setSelectedMemberEmails([])
      setInviteRole('ws_member')
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
  const searchKeyword = searchValue.trim().toLowerCase()
  const filteredData = (data || []).filter((item) => {
    if (!searchKeyword) return true
    return [item.name, item.slug, item.workspace_id, item.description, item.owner?.display_name].some((value) =>
      (value ?? '').toLowerCase().includes(searchKeyword),
    )
  })

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      toast.error(t('workspaces.toast.nameRequired'))
      return
    }
    if (selectedMemberEmails.length > MAX_INVITE_MEMBERS) {
      toast.error(t('workspaces.toast.inviteLimit', { count: MAX_INVITE_MEMBERS }))
      return
    }
    // Slug 允许留空：未手动改过就没有兜底，提交时统一派生/清洗，不再硬拦截报错
    const finalSlug = slugify(slug) || slugify(name)
    createMutation.mutate({ name, slug: finalSlug, description, inviteMembers: selectedMemberEmails, inviteRole })
  }

  // 摘要条派生数据（PRD 原型：我的工作空间 / 我负责的空间 / 日志采集 / 转发状态）
  const list = data || []
  const myOwnedCount = list.filter((w) => w.my_role === 'ws_owner').length
  const loggingKnown = list.some((w) => w.logging_enabled !== undefined)
  const forwardKnown = list.some((w) => w.forward_enabled !== undefined)
  const loggingOnCount = list.filter((w) => w.logging_enabled).length
  const forwardOnCount = list.filter((w) => w.forward_enabled).length
  const dash = '—'

  const summaryItems = [
    {
      label: t('workspaces.summary.myWorkspaces'),
      value: list.length,
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
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 头部标题与描述 */}
      <PageHeader
        title={t('workspaces.title')}
        description={t('workspaces.subtitle')}
        actions={
          <Button
            variant="brand"
            disabled={atWorkspaceLimit}
            title={atWorkspaceLimit && tenant ? t('workspaces.toast.limitReached', { max: tenant.max_workspaces }) : undefined}
            onClick={() => { trackAction(PERMS.WORKSPACE_CREATE); setModalVisible(true) }}
            className="!rounded-full px-6 h-[38px] font-bold"
          >
            <LuPlus className="mr-1 shrink-0" /> {t('workspaces.createBtn')}
          </Button>
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
              <div className="text-[11px] font-medium text-mg-text-3">{item.label}</div>
              <div className="text-base font-bold text-mg-text-1 mt-0.5 flex items-baseline gap-1">
                <span>{item.value}</span>
                {item.hasStatus && (
                  <span className={cn("text-[10px] font-semibold ml-1.5 px-1.5 py-0.5 rounded-sm bg-mg-success/8 text-mg-success")}>
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

        {/* 布局切换按钮 */}
        {filteredData.length > 0 && (
          <div className="flex items-center gap-1 bg-mg-fill-0/10 p-0.5 rounded-lg border border-mg-border/20 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('compact')}
              className={cn(
                "h-7 w-7 !rounded-md flex items-center justify-center border transition-all p-0",
                viewMode === 'compact'
                  ? "bg-brand-base/10 text-brand-base shadow-sm border-brand-base/20"
                  : "bg-transparent text-mg-text-3 border-transparent hover:text-mg-text-1 hover:bg-mg-fill-0/20"
              )}
              title="紧凑横滚"
            >
              <LuLayoutList size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('grid')}
              className={cn(
                "h-7 w-7 !rounded-md flex items-center justify-center border transition-all p-0",
                viewMode === 'grid'
                  ? "bg-brand-base/10 text-brand-base shadow-sm border-brand-base/20"
                  : "bg-transparent text-mg-text-3 border-transparent hover:text-mg-text-1 hover:bg-mg-fill-0/20"
              )}
              title="网格展开"
            >
              <LuLayoutGrid size={14} />
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
      ) : viewMode === 'compact' ? (
        /* 紧凑横滚布局 */
        <div className="flex items-center gap-3 overflow-x-auto pb-3 pt-1 scrollbar-thin">
          {filteredData.map((ws) => {
            const isSelected = validSelectedId === ws.workspace_id
            return (
              <Card
                key={ws.workspace_id}
                level={2}
                onClick={() => setSelectedId(ws.workspace_id)}
                className={cn(
                  "group relative p-3 flex flex-row items-center justify-between gap-4 cursor-pointer transition-all border overflow-hidden rounded-lg min-w-[220px] max-w-[260px] shrink-0 h-[64px]",
                  isSelected 
                    ? "bg-brand-base/[0.05] border-brand-base/35 shadow-sm" 
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

                <div className="min-w-0 flex-1 pl-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-mg-text-1 text-[13px] truncate">{ws.name}</h3>
                    {ws.is_default && (
                      <span className="shrink-0 scale-75 origin-left text-[9px] font-semibold px-1.5 py-0.5 rounded-sm bg-mg-warning/8 text-mg-warning border border-mg-warning/15">
                        {t('workspaces.defaultBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-mg-text-3 truncate mt-0.5">@{ws.slug}</div>
                </div>

                <div className="flex items-center justify-center w-6 h-6 rounded bg-brand-base/5 border border-brand-base/10 text-brand-base shrink-0">
                  <LuKey size={11} />
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* 网格展开布局 */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredData.map((ws) => {
            const isSelected = validSelectedId === ws.workspace_id
            return (
              <Card
                key={ws.workspace_id}
                level={2}
                onClick={() => setSelectedId(ws.workspace_id)}
                className={cn(
                  "group relative p-5 flex flex-col gap-4 cursor-pointer transition-all border overflow-hidden rounded-lg",
                  isSelected
                    ? "bg-brand-base/[0.05] border-brand-base/35 shadow-sm"
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
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-mg-text-3">
                      <span className="truncate">@{ws.slug}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-brand-base/8 border border-brand-base/15 flex items-center justify-center text-brand-base">
                      <LuKey size={14} />
                    </div>
                  </div>
                </div>

                {/* 负责人 */}
                <div className="text-[11px] text-mg-text-3 mt-1">
                  {t('workspaces.card.owner')}{' '}
                  <span className="font-semibold text-mg-text-2">
                    {ws.owner?.display_name || dash}
                  </span>
                </div>

                {/* 成员 / API Keys / 护栏 (居中三等分，用细线分割) */}
                <div className="grid grid-cols-3 divide-x divide-mg-border/20 text-center py-2 bg-mg-fill-0/10 rounded-lg border border-mg-border/10">
                  <div>
                    <div className="text-sm font-bold text-mg-text-1">{ws.member_count}</div>
                    <div className="text-[10px] text-mg-text-3 mt-0.5">{t('workspaces.card.members')}</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-mg-text-1">{ws.api_key_count}</div>
                    <div className="text-[10px] text-mg-text-3 mt-0.5">API Keys</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-mg-text-1">{ws.guardrail_count ?? dash}</div>
                    <div className="text-[10px] text-mg-text-3 mt-0.5">{t('workspaces.card.guardrails')}</div>
                  </div>
                </div>

                {/* 日志采集 / 转发状态 */}
                <div className="flex items-center gap-3 pt-3 border-t border-mg-border/30">
                  <div className="flex items-center gap-1.5 text-[11px] text-mg-text-3 bg-mg-fill-0/15 border border-mg-border/20 px-2 py-1 rounded-md">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", ws.logging_enabled ? "bg-mg-success animate-pulse" : "bg-mg-text-3/40")} />
                    <span>
                      {t('workspaces.summary.logging')}{' '}
                      <span className={ws.logging_enabled ? "text-mg-success font-semibold" : "text-mg-text-2"}>
                        {ws.logging_enabled ? t('workspaces.card.collectOn') : t('workspaces.card.collectOff')}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-mg-text-3 bg-mg-fill-0/15 border border-mg-border/20 px-2 py-1 rounded-md">
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
            <Button variant="brand" loading={createMutation.isPending} onClick={handleCreateSubmit}>{t('workspaces.modal.confirm')}</Button>
          </>
        }
      >
        <div className="py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.nameLabel')}</div>
              <Input
                value={name}
                onChange={e => {
                  const v = e.target.value
                  setName(v)
                  // 用户还没手动改过 Slug 时，名称实时派生同步进 Slug
                  if (!slugTouched) setSlug(slugify(v))
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
            {/* 初始成员：仅企业租户可选（个人租户没有其他企业成员可邀请） */}
            {isEnterprise && (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_128px]">
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.inviteLabel')}</div>
                  <TagInput
                    value={selectedMemberEmails}
                    onChange={setSelectedMemberEmails}
                    options={memberOptions}
                    placeholder={t('workspaces.modal.invitePlaceholder')}
                  />
                  <div className="text-[11px] text-mg-text-3">{t('workspaces.modal.inviteHint')}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.inviteRoleLabel')}</div>
                  <Select value={inviteRole} onChange={(value) => setInviteRole(value as InviteRole)}>
                    <Select.Option value="ws_member">{t('workspaces.modal.inviteRoleMember')}</Select.Option>
                    <Select.Option value="ws_admin">{t('workspaces.modal.inviteRoleAdmin')}</Select.Option>
                  </Select>
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
 * 包含近 7 天消费/请求/TOKENS指标、运行资源和快捷入口
 */
function WorkspaceOverview({ ws, onGoLogs }: { ws: WorkspaceDetail; onGoLogs: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const usageCards = [
    {
      label: t('workspaces.detail.overview.spend'),
      value: renderMoney(ws.usage_7d?.spend),
      icon: <LuCircleDollarSign size={20} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
    {
      label: t('workspaces.detail.overview.requests'),
      value: (ws.usage_7d?.requests ?? 0).toLocaleString(),
      icon: <LuActivity size={20} className="text-mg-success" />,
      bg: 'bg-mg-success/8'
    },
    {
      label: t('workspaces.detail.overview.tokens'),
      value: (ws.usage_7d?.tokens ?? 0).toLocaleString(),
      icon: <LuDatabase size={20} className="text-brand-base" />,
      bg: 'bg-brand-base/8'
    },
  ]

  const resources = [
    { label: t('workspaces.card.members'), value: String(ws.member_count ?? 0), icon: <LuUsers size={16} className="text-mg-text-3" /> },
    { label: t('workspaces.detail.overview.apiKeys'), value: String(ws.api_key_count ?? 0), icon: <LuKey size={16} className="text-mg-text-3" /> },
    { label: t('workspaces.card.guardrails'), value: String(ws.guardrail_count ?? 0), icon: <LuShield size={16} className="text-mg-text-3" /> },
    {
      label: t('workspaces.summary.logging'),
      value: ws.logging_enabled ? t('workspaces.card.collectOn') : t('workspaces.card.collectOff'),
      icon: <LuClipboardList size={16} className="text-mg-text-3" />,
      isStatus: true,
      enabled: ws.logging_enabled
    },
    {
      label: t('workspaces.summary.forwarding'),
      value: ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.card.forwardOff'),
      icon: <LuSend size={16} className="text-mg-text-3" />,
      isStatus: true,
      enabled: ws.forward_enabled
    },
  ]

  const shortcuts = [
    {
      title: 'API Keys',
      desc: t('workspaces.detail.overview.keysOwner', { count: ws.api_key_count ?? 0, owner: ws.owner?.display_name || '-' }),
      icon: <LuKey size={18} className="text-brand-base" />,
      bg: 'bg-brand-base/8',
      onClick: () => navigate(`/workspace/${ws.workspace_id}/api-keys`),
    },
    {
      title: t('workspaces.card.guardrails'),
      desc: t('workspaces.detail.overview.goGuardrailsDesc'),
      icon: <LuShield size={18} className="text-brand-base" />,
      bg: 'bg-brand-base/8',
      onClick: () => navigate(`/workspace/${ws.workspace_id}/guardrails`),
    },
    {
      title: t('workspaces.detail.tabs.logs'),
      desc: t('workspaces.detail.overview.goLogsDesc'),
      icon: <LuClipboardList size={18} className="text-brand-base" />,
      bg: 'bg-brand-base/8',
      onClick: () => navigate(`/logs?workspace=${ws.workspace_id}`),
    },
    {
      title: t('workspaces.summary.forwarding'),
      desc: t('workspaces.detail.overview.goForwardingDesc'),
      icon: <LuSend size={18} className="text-brand-base" />,
      bg: 'bg-brand-base/8',
      onClick: onGoLogs,
    },
  ]

  return (
    <div className="space-y-6">
      {/* 3项 7天指标 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {usageCards.map((c) => (
          <div key={c.label} className="flex items-center gap-4 bg-mg-fill-0/10 border border-mg-border/20 rounded-lg p-5">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", c.bg)}>
              {c.icon}
            </div>
            <div>
              <div className="text-[11px] font-medium text-mg-text-3">{c.label}</div>
              <div className="text-base font-bold text-mg-text-1 mt-0.5">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 运行资源 */}
      <div className="bg-mg-fill-0/10 border border-mg-border/20 rounded-lg p-5">
        <div className="text-xs font-bold text-mg-text-1 mb-4">{t('workspaces.detail.overview.resources')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
          {resources.map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-mg-fill-0/20 flex items-center justify-center text-mg-text-3">
                {r.icon}
              </div>
              <div>
                <div className="text-[11px] text-mg-text-3">{r.label}</div>
                {r.isStatus ? (
                  <div className={cn("text-[12px] font-bold mt-0.5", r.enabled ? "text-mg-success" : "text-mg-text-2")}>
                    {r.value}
                  </div>
                ) : (
                  <div className="text-sm font-bold text-mg-text-1 mt-0.5">{r.value}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="bg-mg-fill-0/10 border border-mg-border/20 rounded-lg p-5">
        <div className="text-xs font-bold text-mg-text-1 mb-4">{t('quickAccess')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {shortcuts.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={s.onClick}
              className="text-left bg-mg-bg-0 border border-mg-border/30 rounded-lg p-4 flex items-center justify-between cursor-pointer transition-all hover:border-brand-base/40 hover:bg-mg-fill-0/10 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", s.bg)}>
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-mg-text-1">{s.title}</div>
                  <div className="text-[10px] text-mg-text-3 mt-0.5 truncate">{s.desc}</div>
                </div>
              </div>
              <LuChevronRight size={14} className="text-mg-text-3 group-hover:text-brand-base transition-transform shrink-0" />
            </button>
          ))}
        </div>
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

  return (
    <div className="bg-mg-bg-0 border border-mg-border/40 rounded-lg p-6 flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-6 pb-6 border-b border-mg-border/30">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xs text-mg-text-3 bg-mg-fill-0/20 px-2 py-0.5 rounded">@{ws.slug}</span>
            <h3 className="text-lg font-bold text-mg-text-1 tracking-tight">{ws.name}</h3>
            {ws.is_default && (
              <Badge variant="secondary" className="bg-brand-base/8 text-brand-base border-brand-base/25">
                {t('workspaces.defaultBadge')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-mg-text-3">
            <LuUser size={13} className="text-mg-text-3/60" />
            <span>{t('workspaces.card.owner')}：</span>
            <span className="font-medium text-mg-text-2">{ws.owner?.display_name || '—'}</span>
          </div>
        </div>

        {/* 右侧状态 pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={cn(
            "flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border",
            ws.logging_enabled
              ? "bg-mg-success/5 border-mg-success/20 text-mg-success"
              : "bg-mg-fill-0/20 border-mg-border/40 text-mg-text-3"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", ws.logging_enabled ? "bg-mg-success" : "bg-mg-text-3/40")} />
            <span>{t('workspaces.summary.logging')} {ws.logging_enabled ? t('workspaces.card.collectOn') : t('workspaces.card.collectOff')}</span>
          </div>
          <div className={cn(
            "flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium border",
            ws.forward_enabled
              ? "bg-mg-success/5 border-mg-success/20 text-mg-success"
              : "bg-mg-fill-0/20 border-mg-border/40 text-mg-text-3"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", ws.forward_enabled ? "bg-mg-success" : "bg-mg-text-3/40")} />
            <span>{t('workspaces.summary.forwarding')} {ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.card.forwardOff')}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'overview' | 'members' | 'logs' | 'settings')}>
        <TabsList variant="pills" className="mb-4">
          <TabsTrigger variant="pills" value="overview">{t('workspaces.detail.tabs.overview')}</TabsTrigger>
          {isEnterprise && <TabsTrigger variant="pills" value="members">{t('workspaces.detail.tabs.members')}</TabsTrigger>}
          <TabsTrigger variant="pills" value="logs">{t('workspaces.detail.tabs.logs')}</TabsTrigger>
          <TabsTrigger variant="pills" value="settings">{t('workspaces.detail.tabs.settings')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <WorkspaceOverview ws={ws} onGoLogs={() => setTab('logs')} />
        </TabsContent>
        {isEnterprise && (
          <TabsContent value="members">
            <MembersTab workspaceId={workspaceId} />
          </TabsContent>
        )}
        <TabsContent value="logs">
          <LogsForwardingTab workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab ws={ws} onDeleted={onDeleted} />
        </TabsContent>
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
