/**
 * 编辑 API Key 弹窗：名称、护栏（多选）、消费限额、过期时间
 * 作用域只读（创建后不可变）。
 */
import { useEffect, useState } from 'react'
import { LuLock, LuPlus } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select, { SelectItem } from '@/components/ui/Select'
import { TagInput } from '@/components/ui/TagInput'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { updateApiKey } from '@/services/api-keys'
import { listGuardrails } from '@/services/guardrails'
import { appToast } from '@/lib/app-toast'
import { useCurrency } from '@/hooks/use-platform-config'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { SCOPE_OPTIONS, EXPIRATION_PRESETS, resolveExpiryISO } from './constants'
import { CreateGuardrailDialog } from './CreateGuardrailDialog'
import { deriveScope } from '@/pages/guardrails/derive'
import { PERIOD_LABEL } from '@/constants/status'
import type { ApiKeyItem, SpendingPeriodUnit } from '@/types'
import type { GuardrailDetail } from '@/interfaces/guardrails'

type Props = {
  open: boolean
  onClose: () => void
  workspaceId: string
  apiKey: ApiKeyItem | null
}

export function EditKeyModal({ open, onClose, workspaceId, apiKey }: Props) {
  const queryClient = useQueryClient()
  const { currency, symbol } = useCurrency()
  const { hasPermission } = usePermissions()

  const [name, setName] = useState('')
  const [guardrailIds, setGuardrailIds] = useState<string[]>([])
  const [guardrailDialogOpen, setGuardrailDialogOpen] = useState(false)
  const [spendingAmount, setSpendingAmount] = useState('')
  const [spendingPeriodUnit, setSpendingPeriodUnit] = useState<SpendingPeriodUnit>('month')
  const todayStr = new Date().toISOString().split('T')[0]
  const [expiryRange, setExpiryRange] = useState<DateRangeValue>({ preset: 'all', startDate: todayStr, endDate: '' })

  const guardrailsQuery = useQuery({
    queryKey: ['guardrails', workspaceId],
    queryFn: () => listGuardrails(workspaceId).then((res) => res.items ?? []),
    enabled: !!workspaceId && open,
    staleTime: 60_000,
  })

  // 打开时用当前 apiKey 数据填充表单
  useEffect(() => {
    if (!open || !apiKey) return
    /* eslint-disable react-hooks/set-state-in-effect -- 弹窗打开时同步重置表单 */
    setName(apiKey.name)
    const limit = apiKey.limit
    if (limit?.amount && parseFloat(limit.amount) > 0) {
      setSpendingAmount(limit.amount)
      setSpendingPeriodUnit(limit.period_unit ?? 'month')
    } else {
      setSpendingAmount('')
      setSpendingPeriodUnit('month')
    }
    if (apiKey.expires_at) {
      setExpiryRange({ preset: 'custom', startDate: todayStr, endDate: apiKey.expires_at.split('T')[0] })
    } else {
      setExpiryRange({ preset: 'all', startDate: todayStr, endDate: '' })
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, apiKey])  // eslint-disable-line react-hooks/exhaustive-deps

  // 护栏数据就绪后，从 assignments 反查该 key 已绑定的护栏 ID
  useEffect(() => {
    const guardrails = Array.isArray(guardrailsQuery.data) ? guardrailsQuery.data : []
    if (!guardrails.length || !apiKey) return
    const bound: string[] = []
    for (const g of guardrails) {
      const isAssigned = g.assignments?.some(
        (a) => a.subject_type === 'api_key' && a.api_key_id === apiKey.api_key_id
      )
      if (isAssigned) bound.push(g.id)
    }
    const defaultId = guardrails.find((g) => g.is_default)?.id
    const ordered = defaultId
      ? [defaultId, ...bound.filter((id) => id !== defaultId)]
      : bound
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuardrailIds(ordered.length > 0 ? ordered : defaultId ? [defaultId] : [])
  }, [guardrailsQuery.data, apiKey?.api_key_id])  // eslint-disable-line react-hooks/exhaustive-deps

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!apiKey) throw new Error('no key')
      // PATCH 契约用可空包装 {set,value}（发裸值会被后端判为「参数校验失败 _root」）。set=true=本次设置(含清空)。
      // 永不过期 → ''（清空）；其余折算成绝对 ISO 时刻，自定义日按本地当天结束（见 resolveExpiryISO）。
      const expiresValue = resolveExpiryISO(expiryRange) ?? ''
      return updateApiKey(workspaceId, apiKey.api_key_id, {
        name: name.trim(),
        spending_limit: {
          set: true,
          value: spendingAmount
            ? { amount: spendingAmount, currency, period_unit: spendingPeriodUnit, period_length: 1 }
            : null,
        },
        expires_at: { set: true, value: expiresValue },
        guardrail_ids: guardrailIds.length > 0 ? guardrailIds : null,
      })
    },
    onSuccess: () => {
      appToast.success('API Key 已更新')
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
      onClose()
    },
    onError: (err: unknown) => {
      appToast.requestError(err, '更新失败')
    },
  })

  function handleSubmit() {
    if (!name.trim()) { appToast.error('请填写名称'); return }
    updateMutation.mutate()
  }

  function handleGuardrailCreated(g: GuardrailDetail) {
    setGuardrailIds((prev) => prev.includes(g.id) ? prev : [...prev, g.id])
  }

  const allGuardrails = Array.isArray(guardrailsQuery.data) ? guardrailsQuery.data : []
  const defaultGuardrail = allGuardrails.find((g) => g.is_default)
  const defaultId = defaultGuardrail?.id ?? ''
  const extraIds = guardrailIds.filter((id) => id !== defaultId)
  const scopeOpt = SCOPE_OPTIONS.find((o) => o.value === apiKey?.scope)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="编辑 API Key"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button variant="brand" loading={updateMutation.isPending} onClick={handleSubmit}>保存修改</Button>
          </>
        }
      >
        <div className="flex flex-col gap-7 py-3">
          {/* 名称 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">名称</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="API Key 名称" />
          </div>

          {/* 作用域（只读）*/}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              作用域 <span className="text-mg-text-3 font-normal ml-1">（创建后不可更改）</span>
            </label>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-mg-border bg-mg-fill-0/50 text-xs text-mg-text-2">
              {scopeOpt && <span className="text-mg-text-3">{scopeOpt.icon}</span>}
              {scopeOpt?.label ?? apiKey?.scope ?? '—'}
            </div>
          </div>

          {/* 安全护栏 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-mg-text-2">安全护栏</label>
              {/* 附建护栏恒为常规 Key 护栏 → 按 guardrails.key:create gate（#479 · PRD §11） */}
              {hasPermission(PERMS.GUARDRAILS_CREATE_KEY) && (
                <button
                  type="button"
                  onClick={() => setGuardrailDialogOpen(true)}
                  className="flex items-center gap-1 text-xs text-brand-base hover:opacity-70 transition-opacity"
                >
                  <LuPlus className="w-3.5 h-3.5" />新建护栏
                </button>
              )}
            </div>
            <div className="space-y-2">
              {defaultGuardrail && (
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-base/10 border border-brand-base/20 text-xs font-bold text-brand-base">
                    <LuLock className="w-3 h-3 shrink-0" />
                    {defaultGuardrail.name}
                    <span className="font-normal text-mg-text-3 ml-0.5">默认</span>
                  </div>
                </div>
              )}
              <TagInput
                value={extraIds}
                onChange={(addIds) => setGuardrailIds([...(defaultId ? [defaultId] : []), ...addIds])}
                options={allGuardrails
                  // 只叠加 Key 作用域护栏（含提额，可从 Key 详情页附加）；不列个人/全局
                  .filter((g) => !g.is_default && deriveScope(g) === 'key')
                  .map((g) => ({ value: g.id, label: g.name }))}
                placeholder="可选：叠加其他护栏"
                hint="默认护栏始终绑定，可继续叠加多个护栏共同生效"
              />
            </div>
          </div>

          {/* 消费限额 —— 直接显示，留空即不限额；时间维度对齐安全护栏 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-3">
              消费限额 <span className="text-mg-text-3 font-normal">（可选，留空则不限额）</span>
            </label>
            <div className="flex gap-3">
              <Input
                type="number" min="0" step="0.01"
                value={spendingAmount}
                onChange={(e) => setSpendingAmount(e.target.value)}
                placeholder="0.00"
                prefix={<span className="text-xs text-mg-text-3 font-mono select-none">{symbol}</span>}
                className="flex-1"
              />
              <Select value={spendingPeriodUnit} onChange={(v) => setSpendingPeriodUnit(v as SpendingPeriodUnit)} className="w-28">
                {(Object.entries(PERIOD_LABEL) as [SpendingPeriodUnit, string][]).map(([k, label]) => (
                  <SelectItem key={k} value={k}>每{label}</SelectItem>
                ))}
              </Select>
            </div>
          </div>

          {/* 过期时间 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              过期时间 <span className="text-mg-text-3 font-normal">（可选，不填则永不过期）</span>
            </label>
            <DateRangePicker
              value={expiryRange}
              onChange={setExpiryRange}
              presets={EXPIRATION_PRESETS}
              customTitle="过期预设"
              customLabel="选择截止时间"
              hideStartDate={true}
              placeholder="选择过期失效时间"
              className="w-full rounded-md h-10 justify-between"
            />
          </div>
        </div>
      </Modal>

      <CreateGuardrailDialog
        open={guardrailDialogOpen}
        onClose={() => setGuardrailDialogOpen(false)}
        workspaceId={workspaceId}
        onCreated={handleGuardrailCreated}
      />
    </>
  )
}
