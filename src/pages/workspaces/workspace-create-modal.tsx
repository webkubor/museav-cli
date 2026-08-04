/**
 * 新建空间表单对话框（负责人 + 初始成员配置）
 */
import { useMemo, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createWorkspace } from '@/services/workspaces'
import { listTenantMembers } from '@/services/tenants'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { TagInput, type TagOption } from '@/components/ui/TagInput'
import { trackEvent } from '@/lib/track'
import { errorCodeOf } from '@/lib/request-error-message'
import { MAX_INVITE_MEMBERS, slugify, fallbackSlug } from './workspace-utils'

interface WorkspaceCreateModalProps {
  open: boolean
  onClose: () => void
  workspaceCount: number
}

export function WorkspaceCreateModal({ open, onClose, workspaceCount }: WorkspaceCreateModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountEmail = useAuthStore((s) => s.account?.email)
  const { isEnterprise, tenant } = useTenantRole()

  // 受控表单状态
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  // 用户是否手动改过 Slug：改过之后名称变化不再联动覆盖
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  // 创建空间先选负责人，再选初始成员；接口用 ws_owner / ws_member 区分两者。
  const [ownerEmail, setOwnerEmail] = useState(currentAccountEmail ?? '')
  const [selectedMemberEmails, setSelectedMemberEmails] = useState<string[]>([])

  // 企业组织成员（初始成员 combobox 数据源）；个人租户没有其他企业成员，不发这个请求
  const tenantMembersQuery = useQuery({
    queryKey: ['tenant-members', activeTenantId],
    queryFn: () => listTenantMembers(activeTenantId!, { page_size: 100 }),
    enabled: Boolean(activeTenantId) && isEnterprise,
    staleTime: 60_000,
  })

  const ownerOptions: TagOption[] = useMemo(() => {
    const items = tenantMembersQuery.data?.items ?? []
    // 过滤 email 为空的成员：Radix Select.Item 的 value 不允许空字符串(空串留给 clear/placeholder),
    // 空 email 会渲染出 value="" 的 Option 直接抛错致整页白屏(需求方#222);负责人必须有 email,空的本就不可选。
    return items
      .filter((m) => !!m.account.email)
      .map((m) => ({
        value: m.account.email,
        label: `${m.account.display_name} (${m.account.email})`,
      }))
  }, [tenantMembersQuery.data])

  // 初始成员 chip 行含负责人（锁定不可移除）+ 其他成员；候选池用 ownerOptions 全量，
  // TagInput 内部会把已选（含负责人）从下拉里排除，故不再单独过滤负责人。
  // 负责人+其他成员合成 chip 行的展示值；负责人排首位并锁定。
  const memberChipValue = useMemo(
    () => (ownerEmail ? [ownerEmail, ...selectedMemberEmails.filter((e) => e !== ownerEmail)] : selectedMemberEmails),
    [ownerEmail, selectedMemberEmails],
  )

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
      // 「新建空间」弹窗的实际提交动作埋点（对齐按钮 data-track="workspaces:create_submit"）
      trackEvent('workspaces:create_submit', undefined, { result: 'success' })
      toast.success(t('workspaces.toast.createSuccess', { name: newWorkspace.name }))
      onClose()
      setName('')
      setSlug('')
      setSlugTouched(false)
      setDescription('')
      setOwnerEmail(currentAccountEmail ?? '')
      setSelectedMemberEmails([])
      queryClient.invalidateQueries({ queryKey: ['workspaces', activeTenantId] })
    },
    onError: (err: unknown) => {
      trackEvent('workspaces:create_submit', undefined, { result: 'fail', error_code: errorCodeOf(err) })
      const message = err instanceof Error
        ? err.message
        : (typeof err === 'object' && err !== null && 'message' in err
            ? String((err as Record<string, unknown>).message)
            : '')
      toast.error(message || t('workspaces.toast.createError'))
    }
  })

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
    const finalSlug = slugify(slug) || slugify(name) || fallbackSlug(tenant?.slug, workspaceCount)
    createMutation.mutate({ name, slug: finalSlug, description, owner: ownerEmail, members: selectedMemberEmails })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('workspaces.modal.title')}
      description={t('workspaces.modal.subtitle', { tenant: tenant?.name ?? '' })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('workspaces.modal.cancel')}</Button>
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
                if (!slugTouched) setSlug(slugify(v) || fallbackSlug(tenant?.slug, workspaceCount))
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
                  value={memberChipValue}
                  onChange={(next) => setSelectedMemberEmails(next.filter((email) => email !== ownerEmail))}
                  options={ownerOptions}
                  lockedValues={ownerEmail ? [ownerEmail] : undefined}
                  lockedBadge="负责人"
                  placeholder="搜索企业成员，回车添加"
                />
              </div>
            </div>
          )}
        </div>
    </Modal>
  )
}
