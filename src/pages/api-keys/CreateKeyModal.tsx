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
import { createApiKey, getEffectiveGuardrailPreview } from '@/services/api-keys'
import { listWorkspaceMembers } from '@/services/workspaces'
import { listGuardrails } from '@/services/guardrails'
import { appToast } from '@/lib/app-toast'
import { useCurrency } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { EXPIRATION_PRESETS, resolveExpiryISO, LIMIT_PERIOD_OPTIONS, type LimitPeriod, type ScopeType } from './constants'
import { CreateGuardrailDialog } from './CreateGuardrailDialog'
import { KEY_TYPE_LABEL, KEY_TYPE_DESC, buildSpendingLimit } from './derive'
import { trackEvent } from '@/lib/track'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import {
  activeGlobalGuardrail,
  deriveKind,
  deriveScope,
  PROMPT_INJECTION_LABEL,
  PERIOD_LABEL,
  resolveKeyPromptInjection,
  metadataList,
  primaryBudget,
  formatBudget,
} from '@/pages/guardrails/derive'
import { groupThousands, trimAmountScale } from '@/pages/guardrails/budget'
import type { ApiKeyCreated, ApiKeyType } from '@/types'

/** PRD「Key 类型」→ 后端 scope 映射（私有→personal / 成员→member / 服务→workspace） */
const TYPE_CARDS: { type: ApiKeyType; scope: ScopeType }[] = [
  { type: 'personal', scope: 'personal' },
  { type: 'member', scope: 'member' },
  { type: 'service', scope: 'workspace' },
]

/** scope → Key 类型（埋点 key_type 用） */
const KEY_TYPE_OF_SCOPE: Record<ScopeType, ApiKeyType> = {
  personal: 'personal',
  member: 'member',
  workspace: 'service',
}

type Props = {
  open: boolean
  onClose: () => void
  workspaceId: string
  onCreated: (created: ApiKeyCreated) => void
}

export function CreateKeyModal({ open, onClose, workspaceId, onCreated }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { currency, symbol } = useCurrency()
  // 个人租户可选 个人/项目 作用域，但没有「成员」（企业专属）
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const tenants = useAuthStore((s) => s.tenants)
  const account = useAuthStore((s) => s.account)
  const isPersonalTenant = tenants.find((t) => t.tenant_id === activeTenantId)?.type === 'personal'
  // 企业下非 Owner/Admin（含空间负责人）：不可永不过期，必须设过期时间（需求方#104：
  // 空间负责人 qa-test03 被点名要求禁永不过期——本单把范围从「仅普通成员」扩到「含空间负责人」，
  // 即企业内只有 Owner/Admin 可永不过期；PRD §8.2 原只禁普通成员，此处按 #104 加严）。
  // 个人租户 owner 不受限（isEnterprise=false）。
  const { isEnterprise, canManage } = useTenantRole()
  const mustSetExpiry = isEnterprise && !canManage
  // Key 类型按各自细粒度创建权限 gate（#54 · PRD §8.1/§8.2）：无权限类型置灰并提示，绝不靠角色启发式
  const { hasPermission } = usePermissions()
  const canCreateScope: Record<ScopeType, boolean> = {
    personal: hasPermission(PERMS.API_KEYS_CREATE_PERSONAL),
    member: hasPermission(PERMS.API_KEYS_CREATE_MEMBER),
    workspace: hasPermission(PERMS.API_KEYS_CREATE_SERVICE),
  }

  const [name, setName] = useState('')
  const [scope, setScope] = useState<ScopeType>('workspace')
  // 个人租户无「成员」Key，member 落到 workspace；类型可选性由上面的细粒度权限控制
  const effectiveScope: ScopeType = isPersonalTenant && scope === 'member' ? 'workspace' : scope
  const [memberAccountId, setMemberAccountId] = useState('')
  const [guardrailIds, setGuardrailIds] = useState<string[]>([])
  const [guardrailDialogOpen, setGuardrailDialogOpen] = useState(false)

  const [spendingAmount, setSpendingAmount] = useState('')
  // 限额周期（PRD §8.2）：不限额 / 每日 / 每月 / 总额；默认不限额（金额禁用）
  const [limitPeriod, setLimitPeriod] = useState<LimitPeriod>('none')
  // 服务 Key 维护人（复用成员下拉）；个人租户固定为自己
  const needsMaintainer = effectiveScope === 'workspace' && !isPersonalTenant
  const todayStr = new Date().toISOString().split('T')[0]
  const [expiryRange, setExpiryRange] = useState<DateRangeValue>({
    preset: 'all',
    startDate: todayStr,
    endDate: '',
  })
  // 必须设过期者不可「永不过期」：移除该预设，默认档落「1 年后」（需求方#104：默认 1 年）
  const expiryPresets = mustSetExpiry ? EXPIRATION_PRESETS.filter((p) => p.key !== 'all') : EXPIRATION_PRESETS
  useEffect(() => {
    if (mustSetExpiry && expiryRange.preset === 'all') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpiryRange({ preset: '1y', startDate: todayStr, endDate: '' })
    }
  }, [mustSetExpiry, expiryRange.preset, todayStr])
  // 当前选中的类型无创建权限时，落到第一个有权限的类型（个人租户排除成员 Key）
  useEffect(() => {
    if (!open || canCreateScope[effectiveScope]) return
    const firstAllowed = (['personal', 'member', 'workspace'] as ScopeType[]).find(
      (s) => canCreateScope[s] && !(isPersonalTenant && s === 'member'),
    )
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (firstAllowed) setScope(firstAllowed)
  }, [open, effectiveScope, canCreateScope, isPersonalTenant])

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => listWorkspaceMembers(workspaceId, { page_size: 100 }),
    enabled: !!workspaceId && open && (effectiveScope === 'member' || needsMaintainer),
    staleTime: 60_000,
  })

  const guardrailsQuery = useQuery({
    queryKey: ['guardrails', workspaceId],
    queryFn: () => listGuardrails(workspaceId).then((res) => res.items ?? []),
    enabled: !!workspaceId && open,
    staleTime: 60_000,
  })

  // 默认护栏自动选中，始终排首位。
  // 仅选 active 的默认护栏（需求方#96）：inactive/archived 的 default 后端 byID 收不到，
  // 自动塞进 guardrail_ids 会导致建 key 报 GUARDRAIL_NOT_FOUND「selected guardrail not found」。
  useEffect(() => {
    const guardrails = Array.isArray(guardrailsQuery.data) ? guardrailsQuery.data : []
    if (!guardrails.length) return
    const def = guardrails.find((g) => g.is_default && g.status === 'active')
    if (def && !guardrailIds.includes(def.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuardrailIds((prev) => [def.id, ...prev.filter((id) => id !== def.id)])
    }
  }, [guardrailIds, guardrailsQuery.data])

  // create_submit 埋点公共属性（PRD §11）：占位 prd_version，row_scope 在页面层带
  const submitTrackProps = () => ({
    prd_version: 'api_keys_v0_1',
    key_type: KEY_TYPE_OF_SCOPE[effectiveScope],
    has_key_guardrail: guardrailIds.length > 0,
    has_limit: limitPeriod !== 'none' && !!spendingAmount,
    limit_period: limitPeriod,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey(workspaceId, {
        name: name.trim(),
        scope: effectiveScope,
        // 成员 Key → 目标成员；服务 Key → 维护人（个人租户维护人固定自己，留空由后端默认创建者）
        member_account_id:
          effectiveScope === 'member' || needsMaintainer ? memberAccountId || undefined : undefined,
        spending_limit: buildSpendingLimit(limitPeriod, spendingAmount, currency),
        expires_at: resolveExpiryISO(expiryRange) ?? undefined,
        guardrail_ids: guardrailIds.length > 0 ? guardrailIds : undefined,
      }),
    onSuccess: (newKey) => {
      appToast.success(t('apiKeys.toast.createSuccess', { name: newKey.name }))
      queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] })
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } })
      trackEvent('api_keys:create_submit', submitTrackProps(), { source: 'create_modal', result: 'success' })
      onCreated(newKey)
    },
    onError: (err: unknown) => {
      appToast.requestError(err, t('apiKeys.toast.createError'))
      trackEvent('api_keys:create_submit', submitTrackProps(), { source: 'create_modal', result: 'fail' })
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
    if (needsMaintainer && !memberAccountId) {
      appToast.error('请选择服务 Key 维护人')
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

  // 生效规则预览：提示词注入最终模式 + 来源（常规 Key 护栏显式 > 启用全局 > 关闭）
  const selectedGuardrails = allGuardrails.filter((g) => guardrailIds.includes(g.id))
  const piResolved = resolveKeyPromptInjection(selectedGuardrails, activeGlobalGuardrail(allGuardrails))

  // 生效规则预览（PRD §8.2 预算闸门/模型黑名单/IP 白名单）：
  // 后端已交付工作区级生效预览接口（qa#420 第1项）：与调用时网关同一 resolver——黑名单并集/白名单交集/预算最严。
  // 优先读真接口；加载中/失败回退「全局护栏 + 所选 Key 护栏」本地叠加，不阻塞、不回归。
  const previewQuery = useQuery({
    queryKey: ['guardrail-effective-preview', workspaceId, effectiveScope, memberAccountId, extraIds[0] ?? '', account?.account_id ?? ''],
    queryFn: () =>
      getEffectiveGuardrailPreview(workspaceId, {
        api_key_type: effectiveScope,
        responsible_member_id: effectiveScope === 'member' || needsMaintainer ? memberAccountId || undefined : undefined,
        key_guardrail_id: extraIds[0] || undefined,
        created_by_member_id: account?.account_id || undefined,
      }).catch(() => undefined),
    enabled: !!workspaceId && open,
    staleTime: 30_000,
  })
  const eff = previewQuery.data?.effective

  // 本地兜底源（真接口不可用时用）
  const globalGuardrail = activeGlobalGuardrail(allGuardrails)
  const previewGuardrails = [globalGuardrail, ...selectedGuardrails]
    .filter((g): g is GuardrailDetail => !!g)
    .filter((g, i, arr) => arr.findIndex((x) => x.id === g.id) === i)

  // 预算闸门展示：真接口按 aggregation_scope 取最严；兜底按护栏名叠加
  const AGG_LABEL: Record<string, string> = { guardrail_total: '总额', per_member: '每人', per_api_key: '每 Key' }
  const budgetDisplay: string[] = eff
    ? (eff.budgets ?? [])
        .filter((b) => Number(b.spend_limit_amount) > 0)
        .map(
          (b) =>
            `${symbol}${groupThousands(trimAmountScale(b.spend_limit_amount))} / ${PERIOD_LABEL[b.period_unit] ?? b.period_unit}（${AGG_LABEL[b.aggregation_scope] ?? b.aggregation_scope}）`,
        )
    : previewGuardrails
        .map((g) => ({ name: g.name, text: formatBudget(symbol, primaryBudget(g)) }))
        .filter((b) => b.text !== '不限额')
        .map((b) => `${b.text}（${b.name}）`)
  const modelBlacklist = eff
    ? eff.model_blacklist
    : [...new Set(previewGuardrails.flatMap((g) => metadataList(g, 'model_blacklist')))]
  const ipWhitelist = eff
    ? eff.ip_whitelist
    : [...new Set(previewGuardrails.flatMap((g) => metadataList(g, 'ip_whitelist')))]

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
            <Button variant="brand" data-track="api_keys:create_submit" loading={createMutation.isPending} onClick={handleSubmit}>
              {t('apiKeys.createModal.confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-7 py-3">
          {/* 名称（PRD §8.2：放弹窗首位） */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              {t('apiKeys.createModal.nameLabel')}
            </label>
            <Input
              value={name}
              data-track="api_keys:field_name"
              onChange={(e) => setName(e.target.value)}
              placeholder={t('apiKeys.createModal.namePlaceholder')}
            />
          </div>

          {/* Key 类型（PRD §10.1）——卡片栅格，映射到后端 scope；个人租户无「成员 Key」 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">Key 类型</label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {TYPE_CARDS
                .filter((c) => !(isPersonalTenant && c.type === 'member'))
                .filter((c) => !(isPersonalTenant && c.type === 'member'))
                .map((c) => {
                const active = effectiveScope === c.scope
                const allowed = canCreateScope[c.scope]
                return (
                  <button
                    key={c.type}
                    type="button"
                    data-track={`api_keys:type_${c.type}`}
                    disabled={!allowed}
                    title={!allowed ? '你没有创建此类型 Key 的权限' : undefined}
                    onClick={() => { if (!allowed) return; setScope(c.scope); setMemberAccountId('') }}
                    className={[
                      'rounded-lg border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40',
                      active
                        ? 'border-brand-base bg-brand-base/5 ring-1 ring-brand-base/30'
                        : 'border-mg-border bg-mg-fill-0/40 enabled:hover:border-brand-base/35',
                    ].join(' ')}
                  >
                    <div className="text-xs font-bold text-mg-text-1">{KEY_TYPE_LABEL[c.type]}</div>
                    <div className="mt-1 text-xs leading-relaxed text-mg-text-3">{KEY_TYPE_DESC[c.type]}</div>
                    {!allowed && <div className="mt-1.5 text-[11px] text-mg-text-4">无创建权限</div>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 负责人（成员 Key）：管理员代建指定被负责成员 */}
          {effectiveScope === 'member' && (
            <div>
              <label className="block text-xs font-bold text-mg-text-2 mb-2">负责人</label>
              <Select value={memberAccountId} onChange={setMemberAccountId} placeholder="请选择工作区成员" className="w-full" data-track="api_keys:field_owner">
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

          {/* 维护人（服务 Key，PRD §8.2 必填）：企业租户选空间成员；个人租户固定自己 */}
          {effectiveScope === 'workspace' && (
            <div>
              <label className="block text-xs font-bold text-mg-text-2 mb-2">维护人</label>
              {isPersonalTenant ? (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-mg-border bg-mg-fill-0/50 text-xs text-mg-text-2">
                  {account?.display_name || account?.email || '当前账户'}
                  <span className="text-mg-text-3">（个人租户固定为你自己）</span>
                </div>
              ) : (
                <>
                  <Select value={memberAccountId} onChange={setMemberAccountId} placeholder="请选择服务 Key 维护人" className="w-full" data-track="api_keys:field_maintainer">
                    {(membersQuery.data?.items ?? []).map((m) => (
                      <SelectItem key={m.account.account_id} value={m.account.account_id}>
                        {m.account.display_name || m.account.email}
                      </SelectItem>
                    ))}
                  </Select>
                  {membersQuery.data?.items.length === 0 && (
                    <p className="text-xs text-mg-text-3 mt-1.5">该工作区暂无成员</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* 安全护栏 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-mg-text-2">
                {t('apiKeys.createModal.guardrailLabel')}
              </label>
              {/* 附建护栏恒为常规 Key 护栏 → 按 guardrails.key:create gate（#479 · PRD §11） */}
              {hasPermission(PERMS.GUARDRAILS_CREATE_KEY) && (
                <button
                  type="button"
                  onClick={() => setGuardrailDialogOpen(true)}
                  className="flex items-center gap-1 text-xs text-brand-base hover:opacity-70 transition-opacity"
                >
                  <LuPlus className="w-3.5 h-3.5" />
                  新建护栏
                </button>
              )}
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
                  // 文档：创建 API Key 只展示常规 Key 护栏，不展示 Key 提额、个人或全局护栏
                  .filter((g) => !g.is_default && deriveScope(g) === 'key' && deriveKind(g) === 'regular')
                  .map((g) => ({ value: g.id, label: g.name }))}
                placeholder="可选：叠加其他护栏"
                hint="默认护栏始终绑定，可继续叠加多个护栏共同生效"
              />
            </div>
            {/* 生效规则预览（PRD §8.2）：提示词注入 + 预算闸门 / 模型黑名单 / IP 白名单叠加结果 */}
            <div className="mt-2 space-y-1.5 rounded-md bg-brand-base/5 px-2.5 py-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-mg-text-3 shrink-0">提示词注入</span>
                <span className="font-bold text-mg-text-1">{PROMPT_INJECTION_LABEL[piResolved.mode]}</span>
                <span className="text-mg-text-3">· 来自 {piResolved.sourceLabel}</span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-mg-text-3 shrink-0">预算闸门</span>
                {budgetDisplay.length > 0 ? (
                  <span className="font-semibold text-mg-text-1">{budgetDisplay.join('，')}</span>
                ) : (
                  <span className="text-mg-text-3">—</span>
                )}
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-mg-text-3 shrink-0">模型黑名单</span>
                <span className={modelBlacklist.length > 0 ? 'font-semibold text-mg-text-1' : 'text-mg-text-3'}>
                  {modelBlacklist.length > 0 ? modelBlacklist.join('、') : '—'}
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-mg-text-3 shrink-0">IP 白名单</span>
                <span className={ipWhitelist.length > 0 ? 'font-mono font-semibold text-mg-text-1' : 'text-mg-text-3'}>
                  {ipWhitelist.length > 0 ? ipWhitelist.join(', ') : '—'}
                </span>
              </div>
              {/* 后端生效预览已交付（内部跟踪 #420 第1项）；提示词注入不在该接口内，仍由前端解析。 */}
              <p className="text-mg-text-4 leading-relaxed">以上为按当前配置的三层生效预览（黑名单取并集、白名单取交集、预算取最严），与调用时网关一致；Key 创建后可在详情查看最终生效。</p>
            </div>
          </div>

          {/* 消费限额 —— 周期=不限额时金额禁用（PRD §8.2） */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-3">
              消费限额 <span className="text-mg-text-3 font-normal">（选择周期后填写金额，不限额则无需填写）</span>
            </label>
            <div className="flex gap-3">
              <Input
                type="number" min="0" step="0.01"
                value={spendingAmount}
                onChange={(e) => setSpendingAmount(e.target.value)}
                placeholder="0.00"
                disabled={limitPeriod === 'none'}
                prefix={<span className="text-xs text-mg-text-3 font-mono select-none">{symbol}</span>}
                className="flex-1"
              />
              <Select value={limitPeriod} onChange={(v) => setLimitPeriod(v as LimitPeriod)} className="w-28">
                {LIMIT_PERIOD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </Select>
            </div>
          </div>

          {/* 过期时间 */}
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              过期时间 <span className="text-mg-text-3 font-normal">{mustSetExpiry ? '（必填，不可永不过期）' : '（可选，不填则永不过期）'}</span>
            </label>
            <DateRangePicker
              value={expiryRange}
              onChange={setExpiryRange}
              presets={expiryPresets}
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
