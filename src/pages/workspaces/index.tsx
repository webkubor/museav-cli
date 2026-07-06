/**
 * 项目管理页
 * 路由：/workspaces
 * API：GET /workspaces、POST /workspaces
 */
import { useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuPlus, LuKey, LuArrowRight } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces, createWorkspace } from '@/services/workspaces'
import { WorkspaceDetailContent } from '@/pages/settings/workspace-detail'
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

type InviteRole = 'ws_admin' | 'ws_member'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_INVITE_MEMBERS = 20

function parseInviteEmails(value: string) {
  return Array.from(new Set(value.split(/[\s,;，；]+/).map((email) => email.trim()).filter(Boolean)))
}

export default function WorkspacesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const [searchValue, setSearchValue] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  // 单页结构：选中卡片在下方展开详情（不跳路由，对齐原型 .space-detail-shell）
  const [selectedId, setSelectedId] = useState<string>('')

  // 受控表单状态
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('ws_member')

  // ─── 1. TanStack Query 真实获取工作空间接口数据 ─────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then(res => res.items || []),
    enabled: !!activeTenantId,
    staleTime: 60_000,
  })

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
      setDescription('')
      setInviteEmails('')
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

  // 支持按项目名称、slug、workspace_id 模糊搜索。
  const searchKeyword = searchValue.trim().toLowerCase()
  const filteredData = (data || []).filter((item) => {
    if (!searchKeyword) return true
    return [item.name, item.slug, item.workspace_id].some((value) =>
      value.toLowerCase().includes(searchKeyword),
    )
  })

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      toast.error(t('workspaces.toast.nameRequired'))
      return
    }
    if (!slug.trim()) {
      toast.error(t('workspaces.toast.slugRequired'))
      return
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      toast.error(t('workspaces.toast.slugFormat'))
      return
    }
    const inviteMembers = parseInviteEmails(inviteEmails)
    if (inviteMembers.length > MAX_INVITE_MEMBERS) {
      toast.error(t('workspaces.toast.inviteLimit', { count: MAX_INVITE_MEMBERS }))
      return
    }
    if (inviteMembers.some((email) => !EMAIL_PATTERN.test(email))) {
      toast.error(t('workspaces.toast.inviteEmailInvalid'))
      return
    }
    createMutation.mutate({ name, slug, description, inviteMembers, inviteRole })
  }

  // 摘要条派生数据（PRD 原型：我的工作空间 / 我负责的空间 / 日志采集 / 转发状态）
  const list = data || []
  const myOwnedCount = list.filter((w) => w.my_role === 'ws_owner').length
  const loggingKnown = list.some((w) => w.logging_enabled !== undefined)
  const forwardKnown = list.some((w) => w.forward_enabled !== undefined)
  const loggingOnCount = list.filter((w) => w.logging_enabled).length
  const forwardOnCount = list.filter((w) => w.forward_enabled).length
  const dash = '—'

  const summary: { label: string; value: React.ReactNode }[] = [
    { label: t('workspaces.summary.myWorkspaces'), value: list.length },
    { label: t('workspaces.summary.myOwned'), value: myOwnedCount },
    { label: t('workspaces.summary.logging'), value: loggingKnown ? t('workspaces.summary.enabledCount', { count: loggingOnCount }) : dash },
    { label: t('workspaces.summary.forwarding'), value: forwardKnown ? t('workspaces.summary.enabledCount', { count: forwardOnCount }) : dash },
  ]

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 头部标题与描述 */}
      <PageHeader title={t('workspaces.title')} description={t('workspaces.subtitle')} />

      {/* 摘要条 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summary.map((s) => (
          <div key={s.label} className="bg-mg-bg-0 border border-mg-border/50 rounded-lg p-4 shadow-xs">
            <div className="text-[11px] font-bold text-mg-text-3 uppercase tracking-wider mb-1">{s.label}</div>
            <div className="text-xl font-bold text-mg-text-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* 控制台操作区域 */}
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          {/* 圆角微阴影输入框 */}
          <Input
            placeholder={t('workspaces.searchPlaceholder')}
            prefix={<LuSearch className="opacity-50" />}
            className="w-[290px] !rounded-full bg-mg-fill-0/30"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
          {/* 空间计数（对齐原型：X 个空间） */}
          <span className="text-xs text-mg-text-3 whitespace-nowrap">
            {t('workspaces.countSuffix', { count: filteredData.length })}
          </span>
        </div>

        {/* 黑色药丸主动作按钮 */}
        <Button
          variant="brand"
          data-umami-event="create_workspace"
          onClick={() => setModalVisible(true)}
          className="!rounded-full px-6 h-[38px] font-bold"
        >
          <LuPlus className="mr-1 shrink-0" /> {t('workspaces.createBtn')}
        </Button>
      </div>

      {/* 卡片网格 */}
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredData.map((ws) => (
            <Card
              key={ws.workspace_id}
              level={2}
              hoverable
              onClick={() => setSelectedId(ws.workspace_id)}
              className={`group relative p-5 flex flex-col gap-4 cursor-pointer transition-all ${
                validSelectedId === ws.workspace_id
                  ? 'ring-2 ring-brand-base border-brand-base'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-mg-text-1 text-[15px] truncate">{ws.name}</h3>
                    {ws.is_default && (
                      <Badge variant="warning" dot className="shrink-0">{t('workspaces.defaultBadge')}</Badge>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-mg-text-3 mt-1 block truncate">@{ws.slug}</span>
                </div>
                <div className="shrink-0 w-9 h-9 rounded-md bg-brand-base/8 border border-brand-base/15 flex items-center justify-center text-brand-base">
                  <LuKey size={16} />
                </div>
              </div>

              {ws.description && (
                <p className="text-xs text-mg-text-3 leading-relaxed line-clamp-2">{ws.description}</p>
              )}

              {/* 负责人 */}
              <div className="text-[11px] text-mg-text-3 mt-auto">
                {t('workspaces.card.owner')} <span className="font-semibold text-mg-text-2">{ws.owner?.display_name || dash}</span>
              </div>

              {/* 成员 / API Keys / 护栏 */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-sm font-bold text-mg-text-1">{ws.member_count}</div><div className="text-[10px] text-mg-text-3">{t('workspaces.card.members')}</div></div>
                <div><div className="text-sm font-bold text-mg-text-1">{ws.api_key_count}</div><div className="text-[10px] text-mg-text-3">API Keys</div></div>
                <div><div className="text-sm font-bold text-mg-text-1">{ws.guardrail_count ?? dash}</div><div className="text-[10px] text-mg-text-3">{t('workspaces.card.guardrails')}</div></div>
              </div>

              {/* 采集 / 转发状态 */}
              <div className="flex items-center justify-between pt-3 border-t border-mg-border/30">
                <div className="flex items-center gap-2">
                  <Badge variant={ws.logging_enabled ? 'success' : 'secondary'} size="xs">
                    {ws.logging_enabled === undefined ? t('workspaces.card.collectUnknown') : ws.logging_enabled ? t('workspaces.card.collectOn') : t('workspaces.card.collectOff')}
                  </Badge>
                  <Badge variant={ws.forward_enabled ? 'success' : 'secondary'} size="xs">
                    {ws.forward_enabled === undefined ? t('workspaces.card.forwardUnknown') : ws.forward_enabled ? t('workspaces.card.forwardOn') : t('workspaces.card.forwardOff')}
                  </Badge>
                </div>
                <span className="flex items-center gap-0.5 text-xs font-bold text-brand-base opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('workspaces.table.edit')} <LuArrowRight size={12} />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 详情区：选中卡片后在此展开（单页结构，对齐原型 .space-detail-shell）。
          不跳路由；onDeleted 清空选中态回落到第一个。 */}
      {validSelectedId && !isLoading && filteredData.length > 0 && (
        <div className="mt-2 rounded-lg border border-mg-border/50 bg-mg-bg-0 p-6 shadow-xs">
          <WorkspaceDetailContent
            workspaceId={validSelectedId}
            onDeleted={() => {
              setSelectedId('')
              queryClient.invalidateQueries({ queryKey: ['workspaces', activeTenantId] })
            }}
          />
        </div>
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
                onChange={e => setName(e.target.value)} 
                placeholder={t('workspaces.modal.namePlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.slugLabel')}</div>
              <Input 
                value={slug} 
                onChange={e => setSlug(e.target.value)} 
                placeholder={t('workspaces.modal.slugPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.descLabel')}</div>
              <Input 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                placeholder={t('workspaces.modal.descPlaceholder')}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_128px]">
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold text-mg-text-2">{t('workspaces.modal.inviteLabel')}</div>
                <Textarea
                  value={inviteEmails}
                  onChange={(e) => setInviteEmails(e.target.value)}
                  placeholder={t('workspaces.modal.invitePlaceholder')}
                  rows={3}
                  className="min-h-[84px]"
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
          </div>
      </Modal>
    </div>
  )
}
