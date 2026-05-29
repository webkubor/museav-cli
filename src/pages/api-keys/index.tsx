import { useState } from 'react'
import { getMarket } from '@/lib/market'
import { getMarketConfig } from '@/config/market'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { SelectItem } from '@/components/ui/Select'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell
} from '@/components/ui/Table'
import { LuSearch, LuPlus, LuCopy, LuCheck, LuX, LuUser, LuBuilding2, LuUsers, LuKey, LuCode, LuChevronDown } from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/api-keys'
import { listWorkspaceMembers } from '@/services/workspaces'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import { useCurrency } from '@/hooks/use-platform-config'
import { pageItems } from '@/lib/utils'
import { formatDateTime } from '@/lib/format-date'

type ScopeType = 'personal' | 'workspace' | 'member'

const SCOPE_OPTIONS: { value: ScopeType; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    value: 'personal',
    icon: <LuUser className="w-4 h-4" />,
    label: '个人',
    desc: '仅供当前账户个人使用',
  },
  {
    value: 'workspace',
    icon: <LuBuilding2 className="w-4 h-4" />,
    label: '工作区',
    desc: '工作区服务集成使用',
  },
  {
    value: 'member',
    icon: <LuUsers className="w-4 h-4" />,
    label: '成员',
    desc: '代表指定成员创建密钥',
  },
]


const _market = getMarket()
const _marketConfig = getMarketConfig(_market)

type QuickTab = 'python' | 'node' | 'curl'

function getQuickSnippet(tab: QuickTab, baseUrl: string): string {
  if (tab === 'python') return `import openai

client = openai.OpenAI(
    api_key="YOUR_API_KEY",
    base_url="${baseUrl}"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`

  if (tab === 'node') return `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "YOUR_API_KEY",
  baseURL: "${baseUrl}",
});

const res = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(res.choices[0].message.content);`

  return `curl ${baseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`
}

export default function ApiKeysPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [createVisible, setCreateVisible] = useState(false)
  const [revealVisible, setRevealVisible] = useState(false)
  const [createdKeyText, setCreatedKeyText] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickTab, setQuickTab] = useState<QuickTab>('python')
  const [quickCopied, setQuickCopied] = useState<string | null>(null)

  // 表单状态
  const [name, setName] = useState('')
  const [env, setEnv] = useState<'live' | 'test'>('live')
  const [scope, setScope] = useState<ScopeType>('workspace')
  const [memberAccountId, setMemberAccountId] = useState('')
  const [copied, setCopied] = useState(false)
  // 限额与过期时间（可选）
  const [spendingEnabled, setSpendingEnabled] = useState(false)
  const [spendingAmount, setSpendingAmount] = useState('')
  const [spendingPeriod, setSpendingPeriod] = useState<'total' | 'monthly'>('monthly')
  const [expiresAt, setExpiresAt] = useState('')

  const { currency, symbol } = useCurrency()

  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId) || '01HV3KWS000000000000001'

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId).then(pageItems),
    enabled: !!activeWorkspaceId,
  })

  const membersQuery = useQuery({
    queryKey: ['workspace-members', activeWorkspaceId],
    queryFn: () => listWorkspaceMembers(activeWorkspaceId, { page_size: 100 }),
    enabled: !!activeWorkspaceId && createVisible,
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey(activeWorkspaceId, {
        name: name.trim(),
        env,
        scope,
        member_account_id: scope === 'member' ? memberAccountId : undefined,
        spending_limit: spendingEnabled && spendingAmount
          ? { amount: spendingAmount, currency, period: spendingPeriod }
          : undefined,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    onSuccess: (newKey) => {
      appToast.success(t('apiKeys.toast.createSuccess', { name: newKey.name }))
      setCreateVisible(false)
      setCreatedKeyText(newKey.key)
      setRevealVisible(true)
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: any) => {
      appToast.error(err?.message || t('apiKeys.toast.createError'))
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      appToast.success(t('apiKeys.toast.revokeSuccess'))
      setRevokeTarget(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: any) => {
      appToast.error(err?.message || t('apiKeys.toast.revokeError'))
    },
  })

  function resetForm() {
    setName('')
    setEnv('live')
    setScope('workspace')
    setMemberAccountId('')
    setSpendingEnabled(false)
    setSpendingAmount('')
    setSpendingPeriod('monthly')
    setExpiresAt('')
  }

  function handleOpenCreate() {
    resetForm()
    setCreateVisible(true)
  }

  const filteredData = pageItems(data).filter(
    (item) =>
      item.name.toLowerCase().includes(searchValue.toLowerCase()) ||
      (item.masked ?? '').toLowerCase().includes(searchValue.toLowerCase())
  )

  const handleCreateSubmit = () => {
    if (!name.trim()) {
      appToast.error(t('apiKeys.createModal.nameRequired'))
      return
    }
    if (scope === 'member' && !memberAccountId) {
      appToast.error('请选择目标成员')
      return
    }
    createMutation.mutate()
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    appToast.success(t('apiKeys.table.copyMaskedSuccess'))
    setTimeout(() => setCopied(false), 2000)
  }


  const baseUrl = `https://${_marketConfig.apiDomain}/v1`

  function handleQuickCopy(key: string, text: string) {
    navigator.clipboard.writeText(text)
    setQuickCopied(key)
    setTimeout(() => setQuickCopied(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">{t('apiKeys.title')}</h1>
        <p className="text-sm text-mg-text-1 mt-1.5">{t('apiKeys.desc')}</p>
      </div>


      {/* 快速接入配置 */}
      <div className="rounded-xl border border-mg-border overflow-hidden bg-mg-bg-0">
        {/* 标题栏 — 点击展开/收起 */}
        <div
          className="px-5 py-3.5 flex items-center gap-2 cursor-pointer select-none hover:bg-mg-fill-0/40 transition-colors"
          onClick={() => setQuickOpen(o => !o)}
        >
          <LuCode size={13} className="text-mg-text-2 shrink-0" />
          <span className="text-[13px] font-semibold text-mg-text-0">快速接入</span>
          <span className="text-[12px] text-mg-text-2 font-normal">· OpenAI 兼容格式</span>
          <LuChevronDown
            size={13}
            className="ml-auto text-mg-text-2 transition-transform duration-200 shrink-0"
            style={{ transform: quickOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>

        {quickOpen && (
        <>{/* 配置项 */}
        <div className="border-t border-mg-border/60 px-5 py-4 grid grid-cols-1 gap-2.5 border-b border-mg-border/60">
          {[
            { label: 'Base URL', value: baseUrl },
            { label: 'Authorization', value: 'Bearer YOUR_API_KEY' },
            { label: 'Content-Type', value: 'application/json' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              <span className="w-[130px] shrink-0 text-[12px] font-semibold text-mg-text-2 uppercase tracking-wide">{label}</span>
              <code className="flex-1 font-mono text-[12.5px] text-mg-text-0 bg-mg-fill-0/60 px-3 py-1.5 rounded-lg border border-mg-border/40 truncate">
                {value}
              </code>
              <button
                onClick={() => handleQuickCopy(label, value)}
                className="shrink-0 p-1.5 rounded-md text-mg-text-2 hover:text-mg-text-0 hover:bg-mg-fill-0/60 transition-all cursor-pointer"
              >
                {quickCopied === label ? <LuCheck size={13} className="text-emerald-500" /> : <LuCopy size={13} />}
              </button>
            </div>
          ))}
        </div>

        {/* 代码 Tab + 复制 */}
        <div style={{ background: '#0f172a' }}>
          <div className="flex items-center justify-between px-4 pt-3 pb-0">
            <div className="flex gap-1">
              {(['python', 'node', 'curl'] as QuickTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setQuickTab(tab)}
                  className="px-3 py-1.5 rounded-md text-[11px] font-mono font-semibold transition-all cursor-pointer"
                  style={{
                    color: quickTab === tab ? '#38bdf8' : '#64748b',
                    background: quickTab === tab ? '#1e293b' : 'transparent',
                  }}
                >
                  {tab === 'python' ? 'Python' : tab === 'node' ? 'Node.js' : 'cURL'}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleQuickCopy('code', getQuickSnippet(quickTab, baseUrl))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer"
              style={{ color: quickCopied === 'code' ? '#34d399' : '#64748b' }}
            >
              {quickCopied === 'code'
                ? <><LuCheck size={11} /> 已复制</>
                : <><LuCopy size={11} /> 复制</>}
            </button>
          </div>
          <pre className="px-5 py-4 text-[12.5px] font-mono text-slate-300 leading-relaxed overflow-x-auto whitespace-pre">
            {getQuickSnippet(quickTab, baseUrl)}
          </pre>
        </div>
        </>
        )}
      </div>

      {/* 新建密钥横幅 */}
      {revealVisible && (
        <div className="card-shadow-adaptive border-l-4 border-l-emerald-500 p-5 bg-card-bg relative overflow-hidden transition-all animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-sm font-bold text-mg-text-0 flex items-center gap-2">
<LuKey size={14} className="shrink-0" /> {t('apiKeys.revealModal.title')}
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
            <Button variant="brand" onClick={() => setRevealVisible(false)} className="h-11 rounded-lg px-6 font-semibold shrink-0">
              {t('apiKeys.revealModal.done')}
            </Button>
          </div>
        </div>
      )}

      {/* 搜索 + 创建 */}
      <div className="flex justify-between items-center gap-4">
        <Input
          prefix={<LuSearch className="w-4 h-4" />}
          placeholder={t('apiKeys.search')}
          className="w-72 rounded-full bg-mg-bg-1/40 hover:bg-mg-bg-1/80 focus:bg-card-bg"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        <Button variant="brand" onClick={handleOpenCreate} className="rounded-full px-6 h-10 shadow-lg shadow-brand-glow/20">
          <LuPlus className="w-4 h-4 mr-1.5" />
          {t('apiKeys.create')}
        </Button>
      </div>

      {/* 列表 */}
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
              <TableCell colSpan={7} className="text-center py-10 text-mg-text-2">{t('common.loading')}</TableCell>
            </TableRow>
          ) : filteredData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10 text-mg-text-2">{t('apiKeys.table.noData')}</TableCell>
            </TableRow>
          ) : (
            filteredData.map((record) => (
              <TableRow key={record.api_key_id}>
                <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">{record.name}</TableCell>
                <TableCell>
                  <Badge variant={record.env === 'live' ? 'success' : 'warning'}>{record.env.toUpperCase()}</Badge>
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
                  {record.usage_30d?.amount
                    ? `${record.usage_30d.currency} ${parseFloat(record.usage_30d.amount).toFixed(4)}`
                    : <span className="text-mg-text-2">—</span>}
                </TableCell>
                <TableCell className="text-xs text-mg-text-1">{formatDateTime(record.created_at)}</TableCell>
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

      {/* ── 创建 API Key 弹窗 ─────────────────────────────────────────── */}
      <Modal
        open={createVisible}
        onClose={() => setCreateVisible(false)}
        title={t('apiKeys.createModal.title')}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateVisible(false)}>
              {t('apiKeys.createModal.cancel')}
            </Button>
            <Button variant="brand" loading={createMutation.isPending} onClick={handleCreateSubmit}>
              {t('apiKeys.createModal.confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-7 py-3">
          {/* 名称 + 环境 并排 */}
          <div className="grid grid-cols-2 gap-4">
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
              <Select value={env} onChange={(val) => setEnv(val as 'live' | 'test')} className="w-full">
                <Select.Option value="live">{t('apiKeys.createModal.live')}</Select.Option>
                <Select.Option value="test">{t('apiKeys.createModal.test')}</Select.Option>
              </Select>
            </div>
          </div>

          {/* 作用域选择器 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-1 mb-3">作用域</label>
            <div className="grid grid-cols-3 gap-3">
              {SCOPE_OPTIONS.map((opt) => {
                const active = scope === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setScope(opt.value); setMemberAccountId('') }}
                    className={[
                      'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all duration-200',
                      active
                        ? 'border-brand-base bg-brand-base/5 shadow-sm'
                        : 'border-mg-border bg-mg-bg-1/40 hover:border-mg-border/80 hover:bg-mg-fill-0',
                    ].join(' ')}
                  >
                    <span className={active ? 'text-brand-base' : 'text-mg-text-2'}>
                      {opt.icon}
                    </span>
                    <div>
                      <p className={`text-[13px] font-bold leading-none mb-1 ${active ? 'text-brand-base' : 'text-mg-text-0'}`}>
                        {opt.label}
                      </p>
                      <p className="text-[11px] text-mg-text-2 leading-snug">{opt.desc}</p>
                    </div>
                    {active && (
                      <span className="ml-auto self-end w-2 h-2 rounded-full bg-brand-base shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 成员选择（仅 scope=member 时展示） */}
          {scope === 'member' && (
            <div>
              <label className="block text-xs font-bold text-mg-text-1 mb-2">目标成员</label>
              <Select
                value={memberAccountId}
                onChange={setMemberAccountId}
                placeholder="请选择工作区成员"
                className="w-full"
              >
                {(membersQuery.data?.items ?? []).map((m) => (
                  <SelectItem key={m.account.account_id} value={m.account.account_id}>
                    {m.account.display_name || m.account.email}
                  </SelectItem>
                ))}
              </Select>
              {membersQuery.data?.items.length === 0 && (
                <p className="text-xs text-mg-text-2 mt-1.5">该工作区暂无成员</p>
              )}
            </div>
          )}

          {/* 消费限额 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold text-mg-text-1">消费限额</label>
              <button
                type="button"
                onClick={() => setSpendingEnabled(!spendingEnabled)}
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none',
                  spendingEnabled ? 'bg-brand-base' : 'bg-mg-fill-2',
                ].join(' ')}
              >
                <span className={[
                  'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
                  spendingEnabled ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')} />
              </button>
            </div>
            {spendingEnabled && (
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-mg-text-2 font-mono select-none">{symbol}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={spendingAmount}
                    onChange={(e) => setSpendingAmount(e.target.value)}
                    placeholder="0.00"
                    className="pl-7"
                  />
                </div>
                <Select value={spendingPeriod} onChange={(v) => setSpendingPeriod(v as 'total' | 'monthly')} className="w-28">
                  <SelectItem value="monthly">每月</SelectItem>
                  <SelectItem value="total">总计</SelectItem>
                </Select>
              </div>
            )}
          </div>

          {/* 过期时间 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-1 mb-2">
              过期时间 <span className="text-mg-text-2 font-normal">（可选，不填则永不过期）</span>
            </label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full"
            />
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
              onClick={() => { if (revokeTarget) revokeMutation.mutate(revokeTarget.id) }}
            >
              {t('apiKeys.table.revoke')}
            </Button>
          </>
        }
      />
    </div>
  )
}
