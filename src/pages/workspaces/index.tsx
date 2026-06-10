import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuPlus, LuKey, LuShield, LuActivity, LuArrowRight } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces, createWorkspace } from '@/services/workspaces'
import { formatDateTime } from '@/lib/format-date'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'

export default function WorkspacesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const [searchValue, setSearchValue] = useState('')
  const [modalVisible, setModalVisible] = useState(false)

  // 受控表单状态
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  // ─── 1. TanStack Query 真实获取工作空间接口数据 ─────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then(res => res.items || []),
    enabled: !!activeTenantId,
  })

  // ─── 2. Mutation 真实绑定新建工作空间接口 ─────────────────────
  const createMutation = useMutation({
    mutationFn: (vals: { name: string; slug: string; description?: string }) => {
      return createWorkspace({
        name: vals.name,
        slug: vals.slug,
        description: vals.description,
        kind: 'team'
      })
    },
    onSuccess: (newWorkspace) => {
      toast.success(t('workspaces.toast.createSuccess', { name: newWorkspace.name }))
      setModalVisible(false)
      setName('')
      setSlug('')
      setDescription('')
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

  // 支持模糊搜索
  const filteredData = (data || []).filter(item => 
    item.name.toLowerCase().includes(searchValue.toLowerCase()) || 
    item.workspace_id.toLowerCase().includes(searchValue.toLowerCase())
  )

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
    createMutation.mutate({ name, slug, description })
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 头部标题与描述 */}
      <PageHeader
        title={t('workspaces.title')}
        description={t('workspaces.desc')}
        className="mb-0"
      />

      {/* 控制台操作区域 */}
      <div className="flex justify-between items-center gap-4">
        {/* 圆角微阴影输入框 */}
        <Input
          placeholder={t('workspaces.searchPlaceholder')}
          prefix={<LuSearch className="opacity-50" />}
          className="w-[290px] !rounded-full bg-mg-fill-0/30"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />

        {/* 黑色药丸主动作按钮 */}
        <Button
          variant="brand"
          onClick={() => setModalVisible(true)}
          className="!rounded-full px-6 h-[38px] font-bold"
        >
          <LuPlus className="mr-1 shrink-0" /> {t('workspaces.createBtn', { count: (data || []).length })}
        </Button>
      </div>

      {/* 卡片网格 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-mg-text-2 gap-2">
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
              onClick={() => navigate(`/settings/workspace/${ws.workspace_id}`)}
              className="group relative p-5 flex flex-col gap-4 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-mg-text-0 text-[15px] truncate">{ws.name}</h3>
                    {ws.is_default && (
                      <Badge variant="warning" dot className="shrink-0">{t('workspaces.defaultBadge')}</Badge>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-mg-text-2 mt-1 block truncate">{ws.workspace_id}</span>
                </div>
                <div className="shrink-0 w-9 h-9 rounded-xl bg-brand-base/8 border border-brand-base/15 flex items-center justify-center text-brand-base">
                  <LuKey size={16} />
                </div>
              </div>

              {ws.description && (
                <p className="text-xs text-mg-text-2 leading-relaxed line-clamp-2">{ws.description}</p>
              )}

              <div className="flex items-center gap-4 text-[11px] text-mg-text-2 font-medium mt-auto">
                <span className="flex items-center gap-1"><LuShield size={12} />{formatDateTime(ws.created_at)}</span>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-mg-border/30">
                <div className="flex items-center gap-3 text-[11px] text-mg-text-2">
                  <span className="flex items-center gap-1"><LuKey size={11} />API Keys</span>
                  <span className="flex items-center gap-1"><LuShield size={11} />Guardrails</span>
                  <span className="flex items-center gap-1"><LuActivity size={11} />Logs</span>
                </div>
                <span className="flex items-center gap-0.5 text-xs font-bold text-brand-base opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('workspaces.table.edit')} <LuArrowRight size={12} />
                </span>
              </div>
            </Card>
          ))}
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
              <div className="text-xs font-bold text-mg-text-1">{t('workspaces.modal.nameLabel')}</div>
              <Input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder={t('workspaces.modal.namePlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-1">{t('workspaces.modal.slugLabel')}</div>
              <Input 
                value={slug} 
                onChange={e => setSlug(e.target.value)} 
                placeholder={t('workspaces.modal.slugPlaceholder')}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-mg-text-1">{t('workspaces.modal.descLabel')}</div>
              <Input 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                placeholder={t('workspaces.modal.descPlaceholder')}
              />
            </div>
          </div>
      </Modal>
    </div>
  )
}
