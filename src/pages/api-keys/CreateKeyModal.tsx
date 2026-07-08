/**
 * 创建 API Key 弹窗：作用域（Tab）、名称、护栏、消费限额、过期时间
 */
import { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'
import { LuPlus, LuShieldCheck } from 'react-icons/lu'
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
import { listGuardrails } from '@/services/guardrails'
import { appToast } from '@/lib/app-toast'
import { useCurrency } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { EXPIRATION_PRESETS, resolveExpiryISO, type ScopeType } from './constants'
import { CreateGuardrailDialog } from './CreateGuardrailDialog'
import { KEY_TYPE_LABEL, KEY_TYPE_DESC } from './derive'
import { PERIOD_LABEL } from '@/constants/status'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import type { ApiKeyType, SpendingPeriodUnit } from '@/types'

/** PRD「Key 类型」→ 后端 scope 映射（私有→personal / 成员→member / 服务→workspace） */
const TYPE_CARDS: { type: ApiKeyType; scope: ScopeType }[] = [
  { type: 'personal', scope: 'personal' },
  { type: 'member', scope: 'member' },
  { type: 'service', scope: 'workspace' },
]

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
  // 个人租户可选 个人/项目 作用域，但没有「成员」（企业专属）
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const tenants = useAuthStore((s) => s.tenants)
  const isPersonalTenant = tenants.find((t) => t.tenant_id === activeTenantId)?.type === 'personal'

  const [name, setName] = useState('')
  const [scope, setScope] = useState<ScopeType>('workspace')
  // 个人租户可选 个人/项目（无成员）；兜底防止残留的 member 被提交
  const effectiveScope: ScopeType = isPersonalTenant && scope === 'member' ? 'workspace' : scope
  const [memberAccountId, setMemberAccountId] = useState('')
  const [guardrailIds, setGuardrailIds] = useState<string[]>([])
  const [guardrailDialogOpen, setGuardrailDialogOpen] = useState(false)

  const [spendingAmount, setSpendingAmount] = useState('')
  const [spendingPeriodUnit, setSpendingPeriodUnit] = useState<SpendingPeriodUnit>('month')
  const todayStr = new Date().toISOString().split('T')[0]
  const [expiryRange, setExpiryRange] = useState<DateRangeValue>({
    preset: 'all',
    startDate: todayStr,
    endDate: '',
  })

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => listWorkspaceMembers(workspaceId, { page_size: 100 }),
    enabled: !!workspaceId && open && effectiveScope === 'member',
    staleTime: 60_000,
  })

  const guardrailsQuery = useQuery({
    queryKey: ['guardrails', workspaceId],
    queryFn: () => listGuardrails(workspaceId).then((res) => res.items ?? []),
    enabled: !!workspaceId && open,
    staleTime: 60_000,
  })

  // 默认护栏自动选中，始终排首位
  useEffect(() => {
    const guardrails = Array.isArray(guardrailsQuery.data) ? guardrailsQuery.data : []
    if (!guardrails.length) return
    const def = guardrails.find((g) => g.is_default)
    if (def && !guardrailIds.includes(def.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuardrailIds((prev) => [def.id, ...prev.filter((id) => id !== def.id)])
    }
  }, [guardrailIds, guardrailsQuery.data])

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey(workspaceId, {
        name: name.trim(),
        scope: effectiveScope,
        member_account_id: effectiveScope === 'member' ? memberAccountId : undefined,
        spending_limit: spendingAmount
          ? { amount: spendingAmount, currency, period_unit: spendingPeriodUnit, period_length: 1 }
          : undefined,
        expires_at: resolveExpiryISO(expiryRange) ?? undefined,
        guardrail_ids: guardrailIds.length > 0 ? guardrailIds : undefined,
      }),
    onSuccess: (newKey) => {
      appToast.success(t('apiKeys.toast.createSuccess', { name: newKey.name }))
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } })
      onCreated(newKey.key)
    },
    onError: (err: unknown) => {
      appToast.requestError(err, t('apiKeys.toast.createError'))
    },
  })

  function handleSubmit() {
    if (!name.trim()) {
      appToast.error(t('apiKeys.createModal.nameRequired'))
      return
    }
    if (effectiveScope === 'member' && !memberAccountId) {
      appToast.error('请选择目标成员')
      return
    }
    createMutation.mutate()
  }

  function handleGuardrailCreated(g: GuardrailDetail) {
    setGuardrailIds((prev) => prev.includes(g.id) ? prev : [...prev, g.id])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = guardrailsQuery.data as any
  const allGuardrails: GuardrailDetail[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.items)
      ? rawData.items
      : []
  const defaultGuardrail = allGuardrails.find((g) => g.is_default)
  const defaultId = defaultGuardrail?.id ?? ''
  const extraIds = guardrailIds.filter((id) => id !== defaultId)

  return (
    <>
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
          {/* Key 类型（PRD §10.1）——卡片栅格，映射到后端 scope；个人租户无「成员 Key」 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">Key 类型</label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {TYPE_CARDS.filter((c) => !(isPersonalTenant && c.type === 'member')).map((c) => {
                const active = scope === c.scope
                return (
                  <button
                    key={c.type}
                    type="button"
                    onClick={() => { setScope(c.scope); setMemberAccountId('') }}
                    className={[
                      'rounded-lg border p-3 text-left transition-all',
                      active
                        ? 'border-brand-base bg-brand-base/5 ring-1 ring-brand-base/30'
                        : 'border-mg-border bg-mg-fill-0/40 hover:border-brand-base/35',
                    ].join(' ')}
                  >
                    <div className="text-xs font-bold text-mg-text-1">{KEY_TYPE_LABEL[c.type]}</div>
                    <div className="mt-1 text-xs leading-relaxed text-mg-text-3">{KEY_TYPE_DESC[c.type]}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 名称 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              {t('apiKeys.createModal.nameLabel')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('apiKeys.createModal.namePlaceholder')}
            />
          </div>

          {/* 负责人（仅 成员 Key）：管理员代建时指定负责人；其余类型维护人为自己 */}
          {effectiveScope === 'member' && (
            <div>
              <label className="block text-xs font-bold text-mg-text-2 mb-2">负责人</label>
              <Select value={memberAccountId} onChange={setMemberAccountId} placeholder="请选择工作区成员" className="w-full">
                {(membersQuery.data?.items ?? []).map((m) => (
                  <SelectItem key={m.account.account_id} value={m.account.account_id}>
                    {m.account.display_name || m.account.email}
                  </SelectItem>
                ))}
              </Select>
              {membersQuery.data?.items.length === 0 && (
                <p className="text-xs text-mg-text-3 mt-1.5">该工作区暂无成员</p>
              )}
            </div>
          )}

          {/* 安全护栏 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-mg-text-2">
                {t('apiKeys.createModal.guardrailLabel')}
              </label>
              <button
                type="button"
                onClick={() => setGuardrailDialogOpen(true)}
                className="flex items-center gap-1 text-xs text-brand-base hover:opacity-70 transition-opacity"
              >
                <LuPlus className="w-3.5 h-3.5" />
                新建护栏
              </button>
            </div>
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
                value={extraIds}
                onChange={(addIds) => setGuardrailIds([...(defaultId ? [defaultId] : []), ...addIds])}
                options={allGuardrails
                  .filter((g) => !g.is_default)
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
