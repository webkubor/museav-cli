import { useState, useEffect } from 'react'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
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
import { LuSearch, LuPlus, LuCopy, LuCheck, LuX, LuUser, LuBuilding2, LuUsers, LuKey, LuChevronDown, LuZap, LuArrowRight, LuChevronRight } from 'react-icons/lu'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Anthropic from '@lobehub/icons/es/Anthropic'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/api-keys'
import { listWorkspaceMembers } from '@/services/workspaces'
import { listGuardrails } from '@/services/guardrails'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
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

const EXPIRATION_PRESETS = [
  { key: 'all', label: '永不过期' },
  { key: '24h', label: '24 小时后' },
  { key: '7d', label: '7 天后' },
  { key: '30d', label: '30 天后' },
  { key: 'custom', label: '自定义截止日期' }
]



export default function ApiKeysPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchValue, setSearchValue] = useState('')
  const [createVisible, setCreateVisible] = useState(false)
  const [revealVisible, setRevealVisible] = useState(false)
  const [createdKeyText, setCreatedKeyText] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickCopied, setQuickCopied] = useState<string | null>(null)

  // 表单状态
  const [name, setName] = useState('')
  const [scope, setScope] = useState<ScopeType>('workspace')
  const [memberAccountId, setMemberAccountId] = useState('')
  const [copied, setCopied] = useState(false)
  const [guardrailId, setGuardrailId] = useState('')
  // 限额与过期时间（可选）
  const [spendingEnabled, setSpendingEnabled] = useState(false)
  const [spendingAmount, setSpendingAmount] = useState('')
  const [spendingPeriod, setSpendingPeriod] = useState<'total' | 'monthly'>('monthly')
  const todayStr = new Date().toISOString().split('T')[0]
  const [expiryRange, setExpiryRange] = useState<DateRangeValue>({
    preset: 'all',
    startDate: todayStr,
    endDate: ''
  })

  const { currency, symbol } = useCurrency()

  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspaceId) || '01HV3KWS000000000000001'
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMS.API_KEYS_CREATE)
  const canRevoke = hasPermission(PERMS.API_KEYS_REVOKE)

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

  const guardrailsQuery = useQuery({
    queryKey: ['guardrails', activeWorkspaceId],
    queryFn: () => listGuardrails(activeWorkspaceId).then((res) => res.items ?? []),
    enabled: !!activeWorkspaceId && createVisible,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!guardrailsQuery.data?.length) return
    const defaultGuardrail = guardrailsQuery.data.find((g) => g.is_default)
    if (defaultGuardrail && !guardrailId) {
      setGuardrailId(defaultGuardrail.id ?? '')
    }
  }, [guardrailsQuery.data])

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey(activeWorkspaceId, {
        name: name.trim(),
        scope,
        member_account_id: scope === 'member' ? memberAccountId : undefined,
        spending_limit: spendingEnabled && spendingAmount
          ? { amount: spendingAmount, currency, period: spendingPeriod }
          : undefined,
        expires_at: (() => {
          if (expiryRange.preset === 'all' || !expiryRange.preset) return undefined
          if (expiryRange.preset === 'custom' && expiryRange.endDate) {
            return new Date(expiryRange.endDate).toISOString()
          }
          const now = new Date()
          if (expiryRange.preset === '1h') now.setHours(now.getHours() + 1)
          else if (expiryRange.preset === '24h') now.setDate(now.getDate() + 1)
          else if (expiryRange.preset === '7d') now.setDate(now.getDate() + 7)
          else if (expiryRange.preset === '30d') now.setDate(now.getDate() + 30)
          return now.toISOString()
        })(),
        guardrail_id: guardrailId && guardrailId !== 'none' ? guardrailId : undefined,
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
    setScope('workspace')
    setMemberAccountId('')
    setSpendingEnabled(false)
    setSpendingAmount('')
    setSpendingPeriod('monthly')
    setExpiryRange({
      preset: 'all',
      startDate: todayStr,
      endDate: ''
    })
    setGuardrailId('')
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
      <div className="rounded-2xl border border-mg-border overflow-hidden bg-mg-bg-0 shadow-sm">
        {/* 标题栏 */}
        <div
          className="px-5 py-3.5 flex items-center gap-2.5 cursor-pointer select-none hover:bg-mg-fill-0/30 transition-colors"
          onClick={() => setQuickOpen(o => !o)}
        >
          <div className="w-7 h-7 rounded-lg bg-brand-base/10 flex items-center justify-center shrink-0">
            <LuZap size={14} className="text-brand-base" />
          </div>
          <div className="flex-1">
            <span className="text-[13px] font-bold text-mg-text-0">Agent 快速接入</span>
            <span className="text-[11px] text-mg-text-2 font-normal ml-2">复制 Base URL 到你的 Agent 设置</span>
          </div>
          <LuChevronDown
            size={14}
            className="text-mg-text-2 transition-transform duration-200 shrink-0"
            style={{ transform: quickOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>

        {quickOpen && (
        <div className="border-t border-mg-border/60">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-mg-border/60">
            {[
              {
                ...GATEWAY_ENDPOINTS[0],
                agents: ['Cursor', 'Claude Code', 'Cline', 'Windsurf'],
                icon: <OpenAI.Avatar size={32} />,
              },
              {
                ...GATEWAY_ENDPOINTS[1],
                agents: ['Anthropic SDK', 'Claude API', 'Amazon Bedrock'],
                icon: <Anthropic.Avatar size={32} />,
              },
            ].map(({ label, baseUrl: value, agents, icon }) => (
              <div key={label} className="p-5 flex flex-col gap-3">
                {/* 协议标识 */}
                <div className="flex items-center gap-3">
                  <div className="shrink-0">{icon}</div>
                  <div className="text-[13px] font-bold text-mg-text-0">{label}</div>
                </div>

                {/* Base URL 复制行 */}
                <div
                  onClick={() => handleQuickCopy(label, value)}
                  className={`group flex items-center gap-2 rounded-lg px-3.5 py-2.5 cursor-pointer transition-all duration-200 border ${
                    quickCopied === label
                      ? 'bg-mg-success/5 border-mg-success/30'
                      : 'bg-mg-bg-1/60 border-mg-border/50 hover:border-brand-base/40 hover:bg-brand-base/3'
                  }`}
                >
                  <code className="flex-1 font-mono text-[13px] font-semibold text-mg-text-0 truncate select-all">
                    {value}
                  </code>
                  <span className={`shrink-0 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                    quickCopied === label ? 'text-mg-success' : 'text-mg-text-2 group-hover:text-brand-base'
                  }`}>
                    {quickCopied === label
                      ? <><LuCheck size={12} /> 已复制</>
                      : <><LuCopy size={12} /> 复制</>}
                  </span>
                </div>

                {/* 适用 Agent 标签 */}
                <div className="flex flex-wrap gap-1.5">
                  {agents.map((a) => (
                    <span key={a} className="text-[10px] font-semibold text-mg-text-2 bg-mg-fill-0/80 border border-mg-border/40 rounded-md px-2 py-0.5">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 底部提示 */}
          <div className="px-5 py-3 border-t border-mg-border/40 bg-mg-bg-1/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <LuArrowRight size={12} className="text-brand-base shrink-0" />
              <span className="text-[11px] text-mg-text-2">
                将 Base URL 和 API Key 填入 Agent 配置即可接入全部模型，无需额外代码。
              </span>
            </div>
            <button
              onClick={() => navigate('/models/catalog')}
              className="text-[11.5px] font-bold text-brand-base hover:text-brand-deep hover:underline flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
            >
              浏览支持的模型 ID <LuChevronRight size={11} className="mt-0.5" />
            </button>
          </div>
        </div>
        )}
      </div>

      {/* 新建密钥横幅 */}
      {revealVisible && (
        <div className="card-shadow-adaptive border-l-4 border-l-mg-success p-5 bg-card-bg relative overflow-hidden transition-all animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-sm font-bold text-mg-text-0 flex items-center gap-2">
<LuKey size={14} className="shrink-0" /> {t('apiKeys.revealModal.title')}
              </div>
              <div className="text-xs text-mg-warning mt-1.5 max-w-3xl leading-relaxed font-semibold">
                {t('apiKeys.revealModal.warning')}
              </div>
              <div className="text-xs text-mg-warning mt-1 font-bold flex items-center gap-1">
                ⚠ 请立即复制，关闭后将无法再查看完整密钥
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
              <div className="bg-mg-code-bg border border-mg-border text-mg-success px-4 py-3 rounded-lg font-mono text-sm flex items-center justify-between font-bold select-all tracking-wider shadow-inner">
                <span className="truncate">{createdKeyText}</span>
                <button
                  onClick={() => handleCopyText(createdKeyText)}
                  className="text-mg-success hover:text-mg-success/80 transition-colors p-1.5 hover:bg-mg-fill-1 rounded ml-2 shrink-0 cursor-pointer"
                >
                  {copied ? <LuCheck className="w-4 h-4" /> : <LuCopy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                onClick={() => {
                  setRevealVisible(false)
                  navigate('/models/catalog')
                }}
                className="h-11 rounded-lg px-4 font-semibold text-brand-base border-brand-base/30 hover:bg-brand-base/5 cursor-pointer"
              >
                复制并去挑选模型
              </Button>
              <Button variant="brand" onClick={() => setRevealVisible(false)} className="h-11 rounded-lg px-6 font-semibold cursor-pointer">
                {t('apiKeys.revealModal.done')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 搜索 + 创建 */}
      <div className="flex justify-between items-center gap-4">
        <Input
          variant="search"
          prefix={<LuSearch className="w-4 h-4" />}
          placeholder={t('apiKeys.search')}
          className="w-72"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        {canCreate && (
          <Button variant="brand" onClick={handleOpenCreate} className="rounded-full px-6 h-10 shadow-lg shadow-brand-glow/20">
            <LuPlus className="w-4 h-4 mr-1.5" />
            {t('apiKeys.create')}
          </Button>
        )}
      </div>

      {/* 列表 */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('apiKeys.table.name')}</TableHead>
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
              <TableCell colSpan={6} className="text-center py-10 text-mg-text-2">{t('common.loading')}</TableCell>
            </TableRow>
          ) : filteredData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-10 text-mg-text-2">{t('apiKeys.table.noData')}</TableCell>
            </TableRow>
          ) : (
            filteredData.map((record) => (
              <TableRow key={record.api_key_id}>
                <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">{record.name}</TableCell>
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
                      title="仅显示掩码，创建时应已复制完整密钥"
                      className="text-brand-base hover:text-brand-deep transition-colors cursor-pointer"
                    >
                      {t('apiKeys.table.copy')}
                    </button>
                    {canRevoke && (
                      <button
                        onClick={() => setRevokeTarget({ id: record.api_key_id, name: record.name })}
                        className="text-mg-danger hover:text-mg-danger/80 transition-colors cursor-pointer"
                      >
                        {t('apiKeys.table.revoke')}
                      </button>
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
          {/* 名称 */}
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

          {/* 绑定护栏 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-1 mb-2">
              {t('apiKeys.createModal.guardrailLabel')}
            </label>
            <Select
              value={guardrailId}
              onChange={setGuardrailId}
              placeholder={t('apiKeys.createModal.guardrailPlaceholder')}
              className="w-full"
            >
              {(guardrailsQuery.data ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </Select>
          </div>

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
            <DateRangePicker
              value={expiryRange}
              onChange={setExpiryRange}
              presets={EXPIRATION_PRESETS}
              customTitle="过期预设"
              customLabel="选择截止时间"
              hideStartDate={true}
              placeholder="选择过期失效时间"
              className="w-full rounded-xl h-10 justify-between"
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
