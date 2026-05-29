import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableHead, 
  TableRow, 
  TableCell 
} from '@/components/ui/Table'
import { LuSearch, LuPlus, LuCopy, LuCheck, LuX } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/api-keys'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import { pageItems } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'

export default function ApiKeysPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [createVisible, setCreateVisible] = useState(false)
  const [revealVisible, setRevealVisible] = useState(false)
  const [createdKeyText, setCreatedKeyText] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)

  // 受控表单状态
  const [name, setName] = useState('')
  const [env, setEnv] = useState<'live' | 'test'>('live')
  const [copied, setCopied] = useState(false)

  // 获取全局活跃的当前 workspace_id
  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId) || '01HV3KWS000000000000001'

  // ─── 1. TanStack Query 真实加载当前工作空间的 API Keys 列表 ──────
  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId).then(pageItems),
    enabled: !!activeWorkspaceId
  })

  // ─── 2. Mutation 真实绑定新建 API Key 接口 ───────────────────────
  const createMutation = useMutation({
    mutationFn: (vals: { name: string; env?: 'live' | 'test' }) => {
      return createApiKey(activeWorkspaceId, {
        name: vals.name,
        env: vals.env || 'live'
      })
    },
    onSuccess: (newKey) => {
      appToast.success(t('apiKeys.toast.createSuccess', { name: newKey.name }))
      setCreateVisible(false)
      // 捕获仅返回一次的明文 key 字符串以供用户复制
      setCreatedKeyText(newKey.key)
      setRevealVisible(true)
      setName('')
      setEnv('live')
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: any) => {
      appToast.error(err?.message || t('apiKeys.toast.createError'))
    }
  })

  // ─── 3. Mutation 真实绑定撤销 (Revoke) API Key 接口 ─────────────
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      appToast.success(t('apiKeys.toast.revokeSuccess'))
      setRevokeTarget(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: any) => {
      appToast.error(err?.message || t('apiKeys.toast.revokeError'))
    }
  })

  const filteredData = pageItems(data).filter(item =>
    item.name.toLowerCase().includes(searchValue.toLowerCase()) || 
    (item.masked ?? '').toLowerCase().includes(searchValue.toLowerCase())
  )

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      appToast.error(t('apiKeys.createModal.nameRequired'))
      return
    }
    createMutation.mutate({ name, env })
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    appToast.success(t('apiKeys.table.copyMaskedSuccess'))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* 头部标题与描述 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">
          {t('apiKeys.title')}
        </h1>
        <p className="text-sm text-mg-text-1 mt-1.5">
          {t('apiKeys.desc')}
        </p>
      </div>

      {/* 🔑 新建密钥就绪横幅 (Apple-style 顶部警示质感) */}
      {revealVisible && (
        <div className="card-shadow-adaptive border-l-4 border-l-emerald-500 p-5 bg-card-bg relative overflow-hidden transition-all animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-sm font-bold text-mg-text-0 flex items-center gap-2">
                <span>🔑</span> {t('apiKeys.revealModal.title')}
              </div>
              <div className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 max-w-3xl leading-relaxed font-semibold">
                {t('apiKeys.revealModal.warning')}
              </div>
            </div>
            <button 
              onClick={() => setRevealVisible(false)}
              className="text-mg-text-2 hover:text-mg-text-0 p-1 rounded transition-colors cursor-pointer"
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="bg-slate-900 border border-slate-800 text-emerald-400 px-4 py-3 rounded-lg font-mono text-sm flex items-center justify-between font-bold select-all tracking-wider shadow-inner">
                <span className="truncate">{createdKeyText}</span>
                <button 
                  onClick={() => handleCopyText(createdKeyText)}
                  className="text-emerald-500 hover:text-emerald-400 transition-colors p-1.5 hover:bg-white/5 rounded ml-2 shrink-0 cursor-pointer"
                >
                  {copied ? <LuCheck className="w-4 h-4" /> : <LuCopy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button 
              variant="brand"
              onClick={() => setRevealVisible(false)}
              className="h-11 rounded-lg px-6 font-semibold shrink-0"
            >
              {t('apiKeys.revealModal.done')}
            </Button>
          </div>
        </div>
      )}

      {/* 控制台操作区域（搜索框 + 药丸动作按钮） */}
      <div className="flex justify-between items-center gap-4">
        {/* 圆角微阴影输入框 */}
        <div className="relative w-72">
          <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mg-text-2 w-4 h-4 pointer-events-none" />
          <Input
            placeholder={t('apiKeys.search')}
            className="pl-10 rounded-full bg-mg-bg-1/40 hover:bg-mg-bg-1/80 focus:bg-card-bg"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>

        {/* 核心主动作按钮 (跟随品牌色变量) */}
        <Button
          variant="brand"
          onClick={() => setCreateVisible(true)}
          className="rounded-full px-6 h-10 shadow-lg shadow-brand-glow/20"
        >
          <LuPlus className="w-4 h-4 mr-1.5" />
          {t('apiKeys.create')}
        </Button>
      </div>

      {/* 声明式 Table 视图 */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('apiKeys.table.name')}</TableHead>
            <TableHead>{t('apiKeys.table.env')}</TableHead>
            <TableHead>{t('apiKeys.table.credentials')}</TableHead>
            <TableHead>{t('apiKeys.table.status')}</TableHead>
            <TableHead>{t('apiKeys.table.totalSpend')}</TableHead>
            <TableHead>{t('apiKeys.table.createdAt')}</TableHead>
            <TableHead className="text-right">{t('apiKeys.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10 text-mg-text-2">
                {t('common.loading')}
              </TableCell>
            </TableRow>
          ) : filteredData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10 text-mg-text-2">
                {t('apiKeys.table.noData')}
              </TableCell>
            </TableRow>
          ) : (
            filteredData.map((record) => (
              <TableRow key={record.api_key_id}>
                <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">
                  {record.name}
                </TableCell>
                <TableCell>
                  <Badge variant={record.env === 'live' ? 'success' : 'warning'}>
                    {record.env.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs bg-mg-bg-1 border border-mg-border px-2.5 py-1 rounded text-mg-text-1">
                    {record.masked}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={record.status === 'active' ? 'success' : 'outline'} dot={record.status === 'active'}>
                    {record.status === 'active' ? t('apiKeys.table.active') : t('apiKeys.table.disabled')}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-mg-text-0 tabular-nums">
                  {record.total_spend?.amount
                    ? `${record.total_spend.currency} ${parseFloat(record.total_spend.amount).toFixed(4)}`
                    : <span className="text-mg-text-2">—</span>
                  }
                </TableCell>
                <TableCell className="text-xs text-mg-text-1">
                  {formatDateTime(record.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-4 text-xs font-bold">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(record.prefix + '••••••••')
                        appToast.success(t('apiKeys.table.copyMaskedSuccess'))
                      }}
                      className="text-brand-base hover:text-brand-deep transition-colors cursor-pointer"
                    >
                      {t('apiKeys.table.copy')}
                    </button>
                    {record.status === 'active' ? (
                      <button 
                        onClick={() => setRevokeTarget({ id: record.api_key_id, name: record.name })}
                        className="text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                      >
                        {t('apiKeys.table.revoke')}
                      </button>
                    ) : (
                      <span className="text-mg-text-2 cursor-not-allowed">{t('apiKeys.table.disabled')}</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* 创建 API Key 的表单 Modal */}
      <Modal
        open={createVisible}
        onClose={() => setCreateVisible(false)}
        title={t('apiKeys.createModal.title')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateVisible(false)}>
              {t('apiKeys.createModal.cancel')}
            </Button>
            <Button
              variant="brand"
              loading={createMutation.isPending}
              onClick={handleCreateSubmit}
            >
              {t('apiKeys.createModal.confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 py-2">
          <div>
            <label className="block text-xs font-bold text-mg-text-1 mb-2">
              {t('apiKeys.createModal.nameLabel')}
            </label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder={t('apiKeys.createModal.namePlaceholder')} 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-mg-text-1 mb-2">
              {t('apiKeys.createModal.envLabel')}
            </label>
            <Select
              value={env}
              onChange={val => setEnv(val as any)}
              className="w-full"
            >
              <Select.Option value="live">{t('apiKeys.createModal.live')}</Select.Option>
              <Select.Option value="test">{t('apiKeys.createModal.test')}</Select.Option>
            </Select>
          </div>
        </div>
      </Modal>

      {/* 撤销确认 Modal */}
      <Modal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title={t('apiKeys.revokeConfirm.title')}
        description={t('apiKeys.revokeConfirm.content')}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              {t('apiKeys.createModal.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={revokeMutation.isPending}
              onClick={() => {
                if (revokeTarget) {
                  revokeMutation.mutate(revokeTarget.id)
                }
              }}
            >
              {t('apiKeys.table.revoke')}
            </Button>
          </>
        }
      />
    </div>
  )
}
