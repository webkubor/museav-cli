/**
 * 创建 API Key 弹窗：名称、作用域、成员、护栏、消费限额、过期时间，自带成员/护栏查询与创建请求
 */
import { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'
import { LuPlus, LuShieldCheck, LuX } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select, { SelectItem } from '@/components/ui/Select'
import { TagInput } from '@/components/ui/TagInput'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createApiKey } from '@/services/api-keys'
import { listWorkspaceMembers } from '@/services/workspaces'
import { listGuardrails, createGuardrail } from '@/services/guardrails'
import { listModels } from '@/services/catalog'
import { appToast } from '@/lib/app-toast'
import { useCurrency } from '@/hooks/use-platform-config'
import { SCOPE_OPTIONS, EXPIRATION_PRESETS, type ScopeType } from './constants'

type Props = {
  open: boolean
  onClose: () => void
  workspaceId: string
  onCreated: (keyText: string) => void
}

export function CreateKeyModal({ open, onClose, workspaceId, onCreated }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { currency, symbol } = useCurrency()

  const [name, setName] = useState('')
  const [scope, setScope] = useState<ScopeType>('workspace')
  const [memberAccountId, setMemberAccountId] = useState('')
  const [guardrailIds, setGuardrailIds] = useState<string[]>([])

  // 内嵌新建护栏
  const [showNewGuardrail, setShowNewGuardrail] = useState(false)
  const [newGName, setNewGName] = useState('')
  const [newGModelBlacklist, setNewGModelBlacklist] = useState<string[]>([])
  const [newGIpWhitelist, setNewGIpWhitelist] = useState<string[]>([])
  const [ipError, setIpError] = useState('')

  const [spendingEnabled, setSpendingEnabled] = useState(false)
  const [spendingAmount, setSpendingAmount] = useState('')
  const [spendingPeriod, setSpendingPeriod] = useState<'total' | 'monthly'>('monthly')
  const todayStr = new Date().toISOString().split('T')[0]
  const [expiryRange, setExpiryRange] = useState<DateRangeValue>({
    preset: 'all',
    startDate: todayStr,
    endDate: '',
  })

  // 表单初始值即默认态；父级通过 key 在每次打开时重挂载本组件，保证打开即重置

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => listWorkspaceMembers(workspaceId, { page_size: 100 }),
    enabled: !!workspaceId && open,
    staleTime: 60_000,
  })

  const guardrailsQuery = useQuery({
    queryKey: ['guardrails', workspaceId],
    queryFn: () => listGuardrails(workspaceId).then((res) => res.items ?? []),
    enabled: !!workspaceId && open,
    staleTime: 60_000,
  })

  const modelsQuery = useQuery({
    queryKey: ['models-catalog'],
    queryFn: () => listModels({ page_size: 100 }),
    staleTime: 5 * 60_000,
  })
  const modelSuggestions = modelsQuery.data?.items?.map((m) => m.model_id) ?? []

  const createGuardrailMutation = useMutation({
    mutationFn: () =>
      createGuardrail(workspaceId, {
        name: newGName.trim(),
        metadata: {
          model_blacklist: newGModelBlacklist,
          ip_whitelist: newGIpWhitelist,
        },
      }),
    onSuccess: (g) => {
      queryClient.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
      setGuardrailIds((prev) => prev.includes(g.id) ? prev : [...prev, g.id])
      setShowNewGuardrail(false)
      setNewGName('')
      setNewGModelBlacklist([])
      setNewGIpWhitelist([])
      appToast.success(`护栏「${g.name}」已创建并绑定`)
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '护栏创建失败')
    },
  })

  const ipValidator = (v: string) => {
    const s = v.trim()
    const m4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/)
    if (m4) {
      const octetsOk = [m4[1], m4[2], m4[3], m4[4]].every((o) => Number(o) <= 255)
      const cidrOk = m4[5] === undefined || Number(m4[5]) <= 32
      return octetsOk && cidrOk
    }
    const m6 = s.match(/^([0-9a-fA-F:]+)(?:\/(\d{1,3}))?$/)
    if (m6 && s.includes(':')) {
      const segsOk = m6[1].split(':').filter(Boolean).every((seg) => /^[0-9a-fA-F]{1,4}$/.test(seg))
      const cidrOk = m6[2] === undefined || Number(m6[2]) <= 128
      return segsOk && cidrOk
    }
    return false
  }

  function handleCreateGuardrail() {
    if (!newGName.trim()) {
      appToast.error('请填写护栏名称')
      return
    }
    createGuardrailMutation.mutate()
  }

  useEffect(() => {
    const guardrails = Array.isArray(guardrailsQuery.data) ? guardrailsQuery.data : []
    if (!guardrails.length) return
    const defaultGuardrail = guardrails.find((g) => g.is_default)
    if (defaultGuardrail && !guardrailIds.includes(defaultGuardrail.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuardrailIds((prev) => [defaultGuardrail.id, ...prev.filter((id) => id !== defaultGuardrail.id)])
    }
  }, [guardrailIds, guardrailsQuery.data])

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey(workspaceId, {
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
        guardrail_ids: guardrailIds.length > 0 ? guardrailIds : undefined,
      }),
    onSuccess: (newKey) => {
      appToast.success(t('apiKeys.toast.createSuccess', { name: newKey.name }))
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } })
      onCreated(newKey.key)
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('apiKeys.toast.createError'))
    },
  })

  function handleSubmit() {
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('apiKeys.createModal.title')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('apiKeys.createModal.cancel')}
          </Button>
          <Button variant="brand" loading={createMutation.isPending} onClick={handleSubmit}>
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
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-mg-text-1">
              {t('apiKeys.createModal.guardrailLabel')}
            </label>
            {!showNewGuardrail && (
              <button
                type="button"
                onClick={() => setShowNewGuardrail(true)}
                className="flex items-center gap-1 text-xs text-brand-base hover:opacity-70 transition-opacity"
              >
                <LuPlus className="w-3.5 h-3.5" />
                新建护栏
              </button>
            )}
          </div>

          {!showNewGuardrail ? (() => {
            const allGuardrails = Array.isArray(guardrailsQuery.data) ? guardrailsQuery.data : []
            const defaultGuardrail = allGuardrails.find((g) => g.is_default)
            const defaultId = defaultGuardrail?.id ?? ''
            const extraIds = guardrailIds.filter((id) => id !== defaultId)
            return (
              <div className="space-y-2">
                {defaultGuardrail && (
                  <div className="flex items-center gap-1.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-xs font-bold text-green-600">
                      <LuShieldCheck className="w-3 h-3 shrink-0" />
                      {defaultGuardrail.name}
                      <span className="font-normal text-green-500/70 ml-0.5">默认</span>
                    </div>
                  </div>
                )}
                <TagInput
                  allowFreeText={false}
                  value={extraIds.map((id) => allGuardrails.find((g) => g.id === id)?.name ?? id)}
                  onChange={(names) => {
                    const addIds = names.map((n) => allGuardrails.find((g) => g.name === n)?.id).filter(Boolean) as string[]
                    setGuardrailIds([...(defaultId ? [defaultId] : []), ...addIds])
                  }}
                  suggestions={allGuardrails
                    .filter((g) => !g.is_default && !guardrailIds.includes(g.id))
                    .map((g) => g.name)}
                  placeholder="可选：叠加其他护栏"
                  hint="默认护栏始终绑定，可继续叠加多个护栏共同生效"
                />
              </div>
            )
          })() : (
            <div className="rounded-xl border border-mg-border bg-mg-bg-1/40 p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LuShieldCheck className="w-4 h-4 text-brand-base" />
                  <span className="text-xs font-bold text-mg-text-1">新建护栏</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewGuardrail(false)}
                  className="text-mg-text-2 hover:text-mg-text-1 transition-colors"
                >
                  <LuX className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-mg-text-1 mb-2">
                  护栏名称 <span className="text-mg-danger ml-0.5">*</span>
                </label>
                <Input
                  value={newGName}
                  onChange={(e) => setNewGName(e.target.value)}
                  placeholder="输入护栏名称"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-mg-text-1 mb-2">模型黑名单</label>
                <TagInput
                  value={newGModelBlacklist}
                  onChange={setNewGModelBlacklist}
                  suggestions={modelSuggestions}
                  placeholder="选择要屏蔽的模型"
                  hint="选中的模型将被禁止通过此护栏调用"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-mg-text-1 mb-2">IP 白名单</label>
                <TagInput
                  value={newGIpWhitelist}
                  onChange={(v) => { setIpError(''); setNewGIpWhitelist(v) }}
                  allowFreeText
                  tagVariant="mono"
                  validator={ipValidator}
                  onValidationError={() => {
                    setIpError('无效的 IP 地址格式')
                    setTimeout(() => setIpError(''), 3000)
                  }}
                  placeholder="输入 IP 或 CIDR，回车确认"
                  hint="为空则允许所有 IP"
                />
                {ipError && <p className="text-xs text-mg-danger mt-1">{ipError}</p>}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-mg-border">
                <Button variant="outline" size="sm" onClick={() => setShowNewGuardrail(false)}>
                  取消
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  loading={createGuardrailMutation.isPending}
                  onClick={handleCreateGuardrail}
                >
                  创建并绑定
                </Button>
              </div>
            </div>
          )}
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
  )
}
