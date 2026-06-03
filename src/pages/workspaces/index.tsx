import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuPlus } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listWorkspaces, createWorkspace } from '@/services/workspaces'
import { formatDateTime } from '@/lib/format-date'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { toast } from 'sonner'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'

export default function WorkspacesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [modalVisible, setModalVisible] = useState(false)

  // 受控表单状态
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  // ─── 1. TanStack Query 真实获取工作空间接口数据 ─────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => listWorkspaces().then(res => res.items || [])
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
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: any) => {
      toast.error(err?.message || t('workspaces.toast.createError'))
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
      <div>
        <h1 className="text-2xl font-bold text-mg-text-0 tracking-tight mb-1.5">
          {t('workspaces.title')}
        </h1>
        <p className="text-[13px] text-mg-text-2 leading-relaxed">
          {t('workspaces.desc')}
        </p>
      </div>

      {/* 当前工作区展示栏 */}
      <div className="flex items-center gap-3 text-[13px] text-mg-text-1 font-bold">
        <span>{t('workspaces.currentLabel')}</span>
        <Select defaultValue="default" placeholder={t('workspaces.defaultOption')} className="w-[170px]">
          <Select.Option value="default">{t('workspaces.defaultOption')}</Select.Option>
        </Select>
      </div>

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

      {/* 极简细线条无框 Table 视图 */}
      <div className="rounded-xl border border-mg-border/60 overflow-hidden bg-mg-bg-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('workspaces.table.name')}</TableHead>
              <TableHead>{t('workspaces.table.workspaceId')}</TableHead>
              <TableHead>{t('workspaces.table.createdAt')}</TableHead>
              <TableHead className="text-right">{t('workspaces.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-mg-text-2">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-brand-base" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>{t('workspaces.loading')}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-mg-text-2">
                  {t('workspaces.empty')}
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((row) => (
                <TableRow
                  key={row.workspace_id}
                  className="cursor-pointer hover:bg-mg-fill-0/30 transition-colors"
                  onClick={() => navigate(`/settings/workspace/${row.workspace_id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-mg-text-0 text-[13.5px]">{row.name}</span>
                      {row.is_default && (
                        <>
                          <Badge variant="success" dot>{t('workspaces.currentBadge')}</Badge>
                          <Badge variant="secondary">{t('workspaces.defaultBadge')}</Badge>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-mg-fill-0 px-2 py-0.5 rounded border border-mg-border/60">
                      {row.workspace_id}
                    </span>
                  </TableCell>
                  <TableCell className="text-mg-text-2">{formatDateTime(row.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-brand-base hover:text-brand-deep cursor-pointer font-bold transition-colors duration-200">
                      {t('workspaces.table.edit')} →
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
