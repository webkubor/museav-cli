import { useState } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select'

export default function WorkspacesPage() {
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
      toast.success(`工作区 "${newWorkspace.name}" 创建成功`)
      setModalVisible(false)
      setName('')
      setSlug('')
      setDescription('')
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
    onError: (err: any) => {
      toast.error(err?.message || '创建工作区失败')
    }
  })

  // 支持模糊搜索
  const filteredData = (data || []).filter(item => 
    item.name.toLowerCase().includes(searchValue.toLowerCase()) || 
    item.workspace_id.toLowerCase().includes(searchValue.toLowerCase())
  )

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      toast.error('工作区名称不能为空')
      return
    }
    if (!slug.trim()) {
      toast.error('唯一标识不能为空')
      return
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      toast.error('唯一标识仅支持小写字母、数字和连字符')
      return
    }
    createMutation.mutate({ name, slug, description })
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      {/* 头部标题与描述 */}
      <div>
        <h1 className="text-2xl font-bold text-semi-color-text-0 tracking-tight mb-1.5">
          工作区
        </h1>
        <p className="text-[13px] text-semi-color-text-2 leading-relaxed">
          管理工作区信息、可用模型和使用限额。
        </p>
      </div>

      {/* 当前工作区展示栏 */}
      <div className="flex items-center gap-3 text-[13px] text-semi-color-text-1 font-bold">
        <span>当前工作区</span>
        <Select defaultValue="default">
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="选择工作区" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">默认工作区</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 控制台操作区域 */}
      <div className="flex justify-between items-center gap-4">
        {/* 圆角微阴影输入框 */}
        <Input
          placeholder="按名称或工作区 ID 搜索"
          prefix={<LuSearch className="opacity-50" />}
          className="w-[290px] !rounded-full bg-semi-color-fill-0/30"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />

        {/* 黑色药丸主动作按钮 */}
        <Button
          variant="brand"
          onClick={() => setModalVisible(true)}
          className="!rounded-full px-6 h-[38px] font-bold"
        >
          <LuPlus className="mr-1 shrink-0" /> 创建工作区 ({(data || []).length}/20)
        </Button>
      </div>

      {/* 极简细线条无框 Table 视图 */}
      <div className="rounded-xl border border-semi-color-border/60 overflow-hidden bg-semi-color-bg-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>工作区 ID</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-semi-color-text-2">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-brand-base" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>正在获取数据...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-semi-color-text-2">
                  暂无匹配的工作区数据
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((row) => (
                <TableRow key={row.workspace_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-semi-color-text-0 text-[13.5px]">{row.name}</span>
                      {row.is_default && (
                        <>
                          <Badge variant="success" dot>当前</Badge>
                          <Badge variant="secondary">默认</Badge>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-semi-color-fill-0 px-2 py-0.5 rounded border border-semi-color-border/60">
                      {row.workspace_id}
                    </span>
                  </TableCell>
                  <TableCell className="text-semi-color-text-2">{formatDateTime(row.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-brand-base hover:text-brand-deep cursor-pointer font-bold transition-colors duration-200">
                      编辑
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 真实创建工作空间的表单对话框 */}
      <Dialog open={modalVisible} onOpenChange={setModalVisible}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>创建新工作区</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-semi-color-text-1">空间名称</div>
              <Input 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="如：生产环境应用区" 
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-semi-color-text-1">唯一标识 (Slug)</div>
              <Input 
                value={slug} 
                onChange={e => setSlug(e.target.value)} 
                placeholder="如：prod-app" 
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs font-bold text-semi-color-text-1">空间描述 (选填)</div>
              <Input 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                placeholder="简述该工作区的用途..." 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalVisible(false)}>
              取消
            </Button>
            <Button variant="brand" loading={createMutation.isPending} onClick={handleCreateSubmit}>
              确认创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
