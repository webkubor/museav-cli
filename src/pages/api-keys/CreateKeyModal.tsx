/**
 * 创建 API Key 弹窗：名称、作用域、成员、护栏、消费限额、过期时间，自带成员/护栏查询与创建请求
 */
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select, { SelectItem } from '@/components/ui/Select'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createApiKey } from '@/services/api-keys'
import { listWorkspaceMembers } from '@/services/workspaces'
import { listGuardrails } from '@/services/guardrails'
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
  const [guardrailId, setGuardrailId] = useState('')
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
        guardrail_id: guardrailId && guardrailId !== 'none' ? guardrailId : undefined,
      }),
    onSuccess: (newKey) => {
      appToast.success(t('apiKeys.toast.createSuccess', { name: newKey.name }))
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
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
  )
}
