/**
 * API Key 管理页
 * 路由：/api-keys
 * API：GET/POST/DELETE /api/v1/workspaces/:workspace_id/api-keys
 */

import { useState, useEffect, useCallback } from 'react'
import { useCopy } from '@/hooks/use-copy'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
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
import {
  LuSearch,
  LuPlus,
  LuCopy,
  LuCheck,
  LuX,
  LuUser,
  LuBuilding2,
  LuUsers,
  LuKey,
  LuZap,
  LuChevronRight,
  LuKeyRound,
  LuTriangleAlert,
  LuCommand,
  LuTerminal,
  LuCode,
  LuFileJson,
  LuBookOpen,
  LuExternalLink,
} from 'react-icons/lu'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { resolveVendorIcon } from '@/features/models/components/vendor-icons'
import { getMarketConfig } from '@/config/market'
import { listApiKeys, createApiKey, revokeApiKey } from '@/services/api-keys'
import { listWorkspaceMembers } from '@/services/workspaces'
import { listGuardrails } from '@/services/guardrails'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { appToast } from '@/lib/app-toast'
import { useCurrency } from '@/hooks/use-platform-config'
import { useMarket } from '@/hooks/useMarket'
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

const CONNECT_ACTIONS = [
  {
    key: 'cc-switch',
    label: 'CC Switch',
    desc: '一键切换',
    icon: <LuCommand className="w-3.5 h-3.5" />,
  },
  {
    key: 'claude-code',
    label: 'Claude Code',
    desc: '终端接入',
    icon: <LuTerminal className="w-3.5 h-3.5" />,
  },
  {
    key: 'codex',
    label: 'Codex',
    desc: '兼容网关',
    icon: <LuCode className="w-3.5 h-3.5" />,
  },
  {
    key: 'openai-sdk',
    label: 'OpenAI SDK',
    desc: '代码示例',
    icon: <LuFileJson className="w-3.5 h-3.5" />,
  },
  {
    key: 'curl',
    label: 'cURL',
    desc: '连通检查',
    icon: <LuBookOpen className="w-3.5 h-3.5" />,
  },
]



export default function ApiKeysPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const market = useMarket()
  const docsUrl = getMarketConfig(market).docsUrl
  const [searchValue, setSearchValue] = useState('')
  const [createVisible, setCreateVisible] = useState(false)
  const [revealVisible, setRevealVisible] = useState(false)
  const [connectVisible, setConnectVisible] = useState(false)
  const [createdKeyText, setCreatedKeyText] = useState('')

  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null)
  const [quickCopied, setQuickCopied] = useState<string | null>(null)
  const [connectCopied, setConnectCopied] = useState<string | null>(null)
  const { copy: copyText, copied } = useCopy()

  // 表单状态
  const [name, setName] = useState('')
  const [scope, setScope] = useState<ScopeType>('workspace')
  const [memberAccountId, setMemberAccountId] = useState('')
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuardrailId(defaultGuardrail.id ?? '')
    }
  }, [guardrailId, guardrailsQuery.data])

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
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('apiKeys.toast.createError'))
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(activeWorkspaceId, keyId),
    onSuccess: () => {
      appToast.success(t('apiKeys.toast.revokeSuccess'))
      setRevokeTarget(null)
      queryClient.invalidateQueries({ queryKey: ['api-keys', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('apiKeys.toast.revokeError'))
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

  const handleCopyText = useCallback(async (text: string) => {
    const ok = await copyText(text)
    if (!ok) {
      appToast.error('复制失败，请手动复制')
      return
    }
    appToast.success(t('apiKeys.table.copyMaskedSuccess'))
  }, [copyText, t])

  const handleOpenConnectWindow = useCallback(() => {
    setConnectVisible(true)
  }, [])

  const handleConfirmSaved = useCallback(async () => {
    await copyText(createdKeyText)
    setRevealVisible(false)
  }, [copyText, createdKeyText])

  async function handleQuickCopy(key: string, text: string) {
    const ok = await copyText(text)
    if (!ok) {
      appToast.error('复制失败，请手动复制')
      return
    }
    setQuickCopied(key)
    setTimeout(() => setQuickCopied(null), 2000)
  }

  async function handleConnectCopy(key: string, text: string) {
    const ok = await copyText(text)
    if (!ok) {
      appToast.error('复制失败，请手动复制')
      return
    }
    setConnectCopied(key)
    appToast.success('配置已复制')
    setTimeout(() => setConnectCopied(null), 2000)
  }

  const openAIBaseUrl = GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''
  const anthropicBaseUrl = GATEWAY_ENDPOINTS[1]?.baseUrl ?? openAIBaseUrl
  const keyForSnippet = createdKeyText || '<YOUR_MODELGO_API_KEY>'
  const connectSnippets = [
    {
      id: 'cc-switch',
      label: 'CC Switch',
      title: 'CC Switch Provider 配置',
      desc: '在 CC Switch 里新增 Provider，选择对应工具后粘贴下面配置。',
      content: [
        'Provider Name: ModelGo',
        `API Key: ${keyForSnippet}`,
        `OpenAI Base URL: ${openAIBaseUrl}`,
        `Anthropic Base URL: ${anthropicBaseUrl}`,
        '',
        '适用工具: Claude Code / Codex / OpenClaw / Hermes Agent',
      ].join('\n'),
    },
    {
      id: 'claude-code',
      label: 'Claude Code',
      title: 'Claude Code 环境变量',
      desc: '适合本地终端临时接入，复制后在当前 shell 执行。',
      content: [
        `export ANTHROPIC_BASE_URL="${anthropicBaseUrl}"`,
        `export ANTHROPIC_API_KEY="${keyForSnippet}"`,
        'claude',
      ].join('\n'),
    },
    {
      id: 'codex',
      label: 'Codex',
      title: 'OpenAI 兼容环境变量',
      desc: 'Codex 或 OpenAI 兼容工具可使用这组 Base URL 与 API Key。',
      content: [
        `export OPENAI_BASE_URL="${openAIBaseUrl}"`,
        `export OPENAI_API_KEY="${keyForSnippet}"`,
      ].join('\n'),
    },
    {
      id: 'openai-sdk',
      label: 'OpenAI SDK',
      title: 'Node.js SDK 示例',
      desc: '用于快速验证 Key 与网关是否可用。',
      content: [
        "import OpenAI from 'openai'",
        '',
        'const client = new OpenAI({',
        `  apiKey: '${keyForSnippet}',`,
        `  baseURL: '${openAIBaseUrl}',`,
        '})',
        '',
        "const models = await client.models.list()",
        'process.stdout.write(JSON.stringify(models.data, null, 2))',
      ].join('\n'),
    },
    {
      id: 'curl',
      label: 'cURL',
      title: '接口连通性检查',
      desc: '直接请求模型列表，适合排查本地环境变量和代理问题。',
      content: [
        `curl "${openAIBaseUrl}/models" \\`,
        `  -H "Authorization: Bearer ${keyForSnippet}"`,
      ].join('\n'),
    },
  ]

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <PageHeader title={t('apiKeys.title')} description={t('apiKeys.desc')} className="mb-0" />


      {/* 接入参数 */}
      <div className="rounded-xl border border-mg-border bg-mg-bg-0 shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid min-w-0 flex-1 gap-1.5">
            {GATEWAY_ENDPOINTS.map(({ label, baseUrl: value }, index) => (
              <button
                key={label}
                type="button"
                onClick={() => handleQuickCopy(label, value)}
                className={`group flex h-9 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left transition-colors cursor-pointer ${
                  quickCopied === label
                    ? 'bg-mg-success/5 border-mg-success/30'
                    : 'bg-mg-bg-1/55 border-mg-border/70 hover:border-brand-base/40 hover:bg-brand-base/5'
                }`}
              >
                <span className="w-6 h-6 rounded-md bg-mg-bg-0 border border-mg-border flex items-center justify-center shrink-0">
                  {resolveVendorIcon(index === 0 ? 'openai' : 'anthropic', 16)}
                </span>
                <span className="w-20 shrink-0 text-[11px] font-bold text-mg-text-0">{label}</span>
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-mg-text-1">
                  {value}
                </code>
                <span className={`shrink-0 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                  quickCopied === label ? 'text-mg-success' : 'text-mg-text-2 group-hover:text-brand-base'
                }`}>
                  {quickCopied === label
                    ? <><LuCheck size={12} /> 已复制</>
                    : <><LuCopy size={12} /> 复制</>}
                </span>
              </button>
            ))}
          </div>

          <div className="min-w-0 shrink-0 lg:w-[520px]">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <div className="text-[11px] font-bold text-mg-text-1">接入方式</div>
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-base hover:text-brand-deep hover:underline"
              >
                开发文档
                <LuExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
              {CONNECT_ACTIONS.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={handleOpenConnectWindow}
                  className="group flex h-8 items-center gap-1.5 rounded-lg border border-mg-border bg-mg-bg-1/55 px-2 text-left transition-colors hover:border-brand-base/40 hover:bg-brand-base/5 cursor-pointer"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-base/10 text-brand-base group-hover:bg-brand-base group-hover:text-white transition-colors">
                    {action.icon}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-bold text-mg-text-0">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 新建密钥横幅 */}
      {revealVisible && (
        <div className="rounded-2xl border border-mg-success/35 bg-mg-success/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-mg-success/15 flex items-center justify-center shrink-0 border border-mg-success/20">
                  <LuKey size={17} className="text-mg-success" />
                </div>
                <div>
                  <div className="text-sm font-bold text-mg-text-0">您的新 API Key 已就绪</div>
                  <div className="text-xs text-mg-warning font-semibold mt-1 flex items-center gap-1.5">
                    <LuTriangleAlert size={12} className="shrink-0" />
                    请立即复制并保存，关闭后将无法再查看完整密钥
                  </div>
                </div>
              </div>
              <button
                onClick={() => setRevealVisible(false)}
                className="text-mg-text-3 hover:text-mg-text-1 p-1.5 rounded-lg hover:bg-mg-fill-1 transition-colors cursor-pointer shrink-0"
              >
                <LuX className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 bg-mg-code-bg border border-mg-border rounded-xl px-4 py-3 font-mono text-sm font-bold select-all tracking-wider">
              <span className="flex-1 truncate text-mg-success">{createdKeyText}</span>
              <button
                onClick={() => handleCopyText(createdKeyText)}
                className={[
                  'shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer',
                  copied
                    ? 'bg-mg-success/15 text-mg-success'
                    : 'bg-mg-fill-1 text-mg-text-1 hover:bg-mg-fill-2 hover:text-mg-text-0',
                ].join(' ')}
              >
                {copied ? <LuCheck className="w-3.5 h-3.5" /> : <LuCopy className="w-3.5 h-3.5" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          </div>

          <div className="border-t border-mg-border/40 bg-mg-bg-1/35 px-5 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleOpenConnectWindow}
                className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-brand-base transition-colors hover:text-brand-deep hover:underline cursor-pointer"
              >
                接入工具窗口 <LuChevronRight size={12} />
              </button>
              <Button variant="brand" onClick={handleConfirmSaved} className="h-9 rounded-lg px-5 text-sm font-semibold cursor-pointer">
                我已复制并妥善保存
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
            <TableHead>作用域</TableHead>
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
            <EmptyState
              icon={<LuKeyRound />}
              title={t('apiKeys.table.noData')}
              colSpan={7}
            />
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
                  {record.scope
                    ? (() => {
                        const opt = SCOPE_OPTIONS.find((o) => o.value === record.scope)
                        return opt ? (
                          <span className="inline-flex items-center gap-1 text-xs text-mg-text-1">
                            <span className="text-mg-text-2">{opt.icon}</span>
                            {opt.label}
                          </span>
                        ) : <span className="text-mg-text-2 text-xs">—</span>
                      })()
                    : <span className="text-mg-text-2 text-xs">—</span>
                  }
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={record.status}
                    statusMap={{
                      active: { label: t('apiKeys.table.active'), variant: 'success', dot: true },
                      inactive: { label: t('apiKeys.table.disabled'), variant: 'outline' },
                    }}
                    fallback={record.status}
                  />
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
                      onClick={() => handleCopyText(record.masked || `${record.prefix}••••••••`)}
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

      {/* ── API Key 接入工具弹窗 ─────────────────────────────────────── */}
      <Modal
        open={connectVisible}
        onClose={() => setConnectVisible(false)}
        title="立即接入"
        description="不离开当前页面，复制对应工具的接入配置即可开始使用。"
        size="lg"
        className="sm:max-w-[840px]"
      >
        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-mg-border bg-mg-bg-1/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-base/10 flex items-center justify-center shrink-0">
                  <LuZap size={16} className="text-brand-base" />
                </div>
                <div>
                  <div className="text-sm font-bold text-mg-text-0">ModelGo 接入参数</div>
                  <div className="text-xs text-mg-text-2 mt-1">
                    API Key 只在创建后展示一次，关闭横幅后将无法再次查看完整密钥。
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConnectCopy('api-key', createdKeyText)}
                className="shrink-0"
              >
                {connectCopied === 'api-key'
                  ? <><LuCheck className="w-3.5 h-3.5 mr-1.5" />已复制 Key</>
                  : <><LuCopy className="w-3.5 h-3.5 mr-1.5" />复制 API Key</>}
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-mg-border/60 bg-mg-bg-0 px-3 py-2">
                <div className="text-mg-text-2 mb-1">OpenAI 兼容地址</div>
                <code className="font-mono text-mg-text-0 break-all">{openAIBaseUrl}</code>
              </div>
              <div className="rounded-lg border border-mg-border/60 bg-mg-bg-0 px-3 py-2">
                <div className="text-mg-text-2 mb-1">Anthropic 兼容地址</div>
                <code className="font-mono text-mg-text-0 break-all">{anthropicBaseUrl}</code>
              </div>
            </div>
          </div>

          <Tabs defaultValue="cc-switch">
            <TabsList variant="pills" className="w-full justify-start overflow-x-auto">
              {connectSnippets.map((item) => (
                <TabsTrigger key={item.id} value={item.id} variant="pills" className="shrink-0">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {connectSnippets.map((item) => (
              <TabsContent key={item.id} value={item.id}>
                <div className="rounded-xl border border-mg-border bg-mg-bg-0 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-bold text-mg-text-0">{item.title}</div>
                      <div className="text-xs text-mg-text-2 mt-1">{item.desc}</div>
                    </div>
                    <Button
                      variant="brand"
                      size="sm"
                      onClick={() => handleConnectCopy(item.id, item.content)}
                      className="shrink-0"
                    >
                      {connectCopied === item.id
                        ? <><LuCheck className="w-3.5 h-3.5 mr-1.5" />已复制</>
                        : <><LuCopy className="w-3.5 h-3.5 mr-1.5" />复制配置</>}
                    </Button>
                  </div>
                  <pre className="mt-4 max-h-[300px] overflow-auto rounded-lg border border-mg-border bg-mg-code-bg p-4 text-xs leading-6 text-mg-text-0">
                    <code>{item.content}</code>
                  </pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </Modal>

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
