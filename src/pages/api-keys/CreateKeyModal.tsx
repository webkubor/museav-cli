/**
 * 创建 API Key 抽屉：名称、类型、负责人、过期时间、护栏与最终生效规则预览
 */
import { useEffect, useState } from 'react'
import confetti from 'canvas-confetti'
import { SideSheet } from '@/components/ui/SideSheet'
import { DateRangePicker, type DateRangeValue } from '@/components/ui/DateRangePicker'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Select, { SelectItem } from '@/components/ui/Select'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createApiKey, getEffectiveGuardrailPreview } from '@/services/api-keys'
import { listWorkspaceMembers, listWorkspaces } from '@/services/workspaces'
import { listGuardrails } from '@/services/guardrails'
import { appToast } from '@/lib/app-toast'
import { useCurrency } from '@/hooks/use-platform-config'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { PERMS } from '@/config/permissions'
import { EXPIRATION_PRESETS, resolveExpiryISO, type ScopeType } from './constants'
import { KEY_TYPE_LABEL, KEY_TYPE_DESC } from './derive'
import { trackEvent } from '@/lib/track'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import {
  activeDefaultGuardrail,
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
  const { symbol } = useCurrency()
  // 个人租户可选 个人/项目 作用域，但没有「成员」（企业专属）
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const tenants = useAuthStore((s) => s.tenants)
  const account = useAuthStore((s) => s.account)
  const isPersonalTenant = tenants.find((t) => t.tenant_id === activeTenantId)?.type === 'personal'
  // Key 类型按各自细粒度创建权限 gate（#54 · PRD §8.1/§8.2）：无权限类型置灰并提示，绝不靠角色启发式
  const { hasPermission } = usePermissions()
  const { isEnterprise, canManage } = useTenantRole()
  const mustSetExpiry = isEnterprise && !canManage
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
  const todayStr = new Date().toISOString().split('T')[0]
  const [expiryRange, setExpiryRange] = useState<DateRangeValue>({ preset: mustSetExpiry ? '1y' : 'all', startDate: todayStr, endDate: '' })
  const expiryPresets = mustSetExpiry ? EXPIRATION_PRESETS.filter((preset) => preset.key !== 'all') : EXPIRATION_PRESETS
  useEffect(() => {
    if (mustSetExpiry && expiryRange.preset === 'all') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpiryRange({ preset: '1y', startDate: todayStr, endDate: '' })
    }
  }, [mustSetExpiry, expiryRange.preset, todayStr])
  // 服务 Key 负责人（复用成员下拉）；个人租户固定为自己
  const needsMaintainer = effectiveScope === 'workspace' && !isPersonalTenant
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

  const workspaceQuery = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((res) => res.items ?? []),
    enabled: !!activeTenantId && open,
    staleTime: 60_000,
  })
  const workspaceName = workspaceQuery.data?.find((workspace) => workspace.workspace_id === workspaceId)?.name ?? '当前工作空间'

  // 默认护栏自动选中，始终排首位。
  // 仅选 active 的默认护栏（需求方#96）：inactive/archived 的 default 后端 byID 收不到，
  // 自动塞进 guardrail_ids 会导致建 key 报 GUARDRAIL_NOT_FOUND「selected guardrail not found」。
  useEffect(() => {
    const guardrails = Array.isArray(guardrailsQuery.data) ? guardrailsQuery.data : []
    if (!guardrails.length) return
    const def = activeDefaultGuardrail(guardrails)
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
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createApiKey(workspaceId, {
        name: name.trim(),
        scope: effectiveScope,
        // 成员 Key → 目标成员；服务 Key → 负责人（个人租户负责人固定自己，留空由后端默认创建者）
        member_account_id:
          effectiveScope === 'member' || needsMaintainer ? memberAccountId || undefined : undefined,
        guardrail_ids: guardrailIds.length > 0 ? guardrailIds : undefined,
        expires_at: resolveExpiryISO(expiryRange) ?? undefined,
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
      appToast.error('请选择服务 Key 负责人')
      return
    }
    createMutation.mutate()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawData = guardrailsQuery.data as any
  const allGuardrails: GuardrailDetail[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.items)
      ? rawData.items
      : []
  // 只认 active 的默认护栏（需求方#106）：存量数据可能有多条 is_default，其中 inactive 的
  // 后端 byID 收不到，若被 line 402 强行塞进 guardrail_ids 会导致建 key 报「selected guardrail not found」。
  // 与上方自动选择（#96）同口径，避免两处「默认」不一致。
  const defaultGuardrail = activeDefaultGuardrail(allGuardrails)
  const defaultId = defaultGuardrail?.id ?? ''
  const extraIds = guardrailIds.filter((id) => id !== defaultId)
  const selectedGuardrail = allGuardrails.find((g) => g.id === extraIds[0])

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
  const effectiveLayerRows = [
    { label: '全局护栏', name: globalGuardrail?.name ?? '未配置全局护栏', active: !!globalGuardrail },
    { label: 'Key 护栏', name: selectedGuardrail?.name ?? '不使用 Key 护栏', active: !!selectedGuardrail },
  ]
  const budgetGateRows = [
    { label: '工作空间总预算', scope: 'guardrail_total' },
    { label: '个人预算', scope: 'per_member' },
    { label: 'Key 预算', scope: 'per_api_key' },
  ].map(({ label, scope: aggregationScope }) => {
    const budget = eff?.budgets?.find((item) => item.aggregation_scope === aggregationScope)
    const value = budget
      ? `${symbol}${groupThousands(trimAmountScale(budget.spend_limit_amount))} / ${PERIOD_LABEL[budget.period_unit] ?? budget.period_unit}`
      : '不限额'
    return { label, value, source: budget ? '生效规则' : '未配置预算' }
  })
  const previewRuleRows = [
    { label: '模型黑名单', value: modelBlacklist.length > 0 ? modelBlacklist.join('、') : '未配置', source: modelBlacklist.length > 0 ? '全局 / Key 护栏规则' : '无' },
    { label: 'IP 白名单', value: ipWhitelist.length > 0 ? ipWhitelist.join(', ') : '未配置', source: ipWhitelist.length > 0 ? '全局 / Key 护栏规则' : '无' },
    { label: '提示词注入', value: PROMPT_INJECTION_LABEL[piResolved.mode], source: piResolved.sourceLabel },
  ]

  return (
    <>
      <SideSheet
        open={open}
        onClose={onClose}
        title={t('apiKeys.createModal.title')}
        description={`为 ${workspaceName} 工作空间创建运行凭证`}
        width={680}
      >
        <div className="flex flex-col gap-7 px-1 py-3 pb-24">
          {/* Key 名称（PRD 原型顺序） */}
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

          {/* 负责人（服务 Key，PRD §8.2 必填）：企业租户选空间成员；个人租户固定自己（命名以 PRD 原型为准=负责人，需求方#183） */}
          {effectiveScope === 'workspace' && (
            <div>
              <label className="block text-xs font-bold text-mg-text-2 mb-2">负责人</label>
              {isPersonalTenant ? (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-mg-border bg-mg-fill-0/50 text-xs text-mg-text-2">
                  {account?.display_name || account?.email || '当前账户'}
                  <span className="text-mg-text-3">（个人租户固定为你自己）</span>
                </div>
              ) : (
                <>
                  <Select value={memberAccountId} onChange={setMemberAccountId} placeholder="请选择服务 Key 负责人" className="w-full" data-track="api_keys:field_maintainer">
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

          {/* 过期时间（PRD 原型：创建生命周期字段，Member 不可选择永不过期） */}
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

          {/* 安全策略（严格对齐 PRD 原型：选择 → 当前策略 → 生效规则预览） */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-mg-text-1">安全策略</h4>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-mg-text-2">Key 护栏</label>
              <Select
                value={extraIds[0] ?? '__none__'}
                onChange={(value) => setGuardrailIds([...(defaultId ? [defaultId] : []), ...(value === '__none__' ? [] : [value])])}
              >
                <SelectItem value="__none__">不使用 Key 护栏</SelectItem>
                {allGuardrails
                  .filter((g) => !g.is_default && deriveScope(g) === 'key' && deriveKind(g) === 'regular')
                  .map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </Select>
              {allGuardrails.filter((g) => !g.is_default && deriveScope(g) === 'key' && deriveKind(g) === 'regular').length === 0 && (
                <p className="text-xs text-mg-text-3">暂无 Key 护栏</p>
              )}
            </div>
            <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2">
              <span className="block text-xs text-mg-text-3">{selectedGuardrail ? '已选 Key 护栏' : '当前策略'}</span>
              <strong className="mt-0.5 block text-sm text-mg-text-1">
                {selectedGuardrail?.name ?? '不使用 Key 护栏'}
              </strong>
              <em className="mt-1 block text-xs not-italic text-mg-text-3">
                {selectedGuardrail ? (budgetDisplay.join('，') || '未配置预算') : '未绑定 Key 护栏'}
              </em>
            </div>
            <div className="rounded-md border border-mg-border bg-mg-fill-0/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <strong className="text-sm text-mg-text-1">生效规则预览</strong>
                <span className="text-xs text-mg-text-3">运行时会同时检查这些预算闸门</span>
              </div>
              <div className="space-y-2 border-b border-mg-border pb-3">
                {effectiveLayerRows.map((row) => (
                  <div className="flex items-center justify-between gap-3 text-xs" key={row.label}>
                    <span className="text-mg-text-3">{row.label}</span>
                    <strong className={row.active ? 'text-mg-text-1' : 'text-mg-text-3'}>{row.name}</strong>
                  </div>
                ))}
              </div>
              <div className="py-3">
                <div className="mb-2 flex items-center justify-between">
                  <strong className="text-xs text-mg-text-1">预算闸门</strong>
                  <span className="text-xs text-mg-text-3">按最先触发的预算停止调用</span>
                </div>
                <div className="space-y-2">
                  {budgetGateRows.map((row) => (
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs" key={row.label}>
                      <span className="text-mg-text-3">{row.label}</span>
                      <strong className={row.value === '不限额' ? 'text-mg-text-3' : 'text-mg-text-1'}>{row.value}</strong>
                      <em className="text-right not-italic text-mg-text-3">{row.source}</em>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2 border-t border-mg-border pt-3">
                {previewRuleRows.map((row) => (
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs" key={row.label}>
                    <span className="text-mg-text-3">{row.label}</span>
                    <strong className={row.value === '未配置' ? 'text-mg-text-3' : 'text-mg-text-1'}>{row.value}</strong>
                    <span className="col-start-2 text-mg-text-3">规则来源：{row.source}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-mg-border bg-mg-bg-0/95 py-4 backdrop-blur">
          <Button variant="outline" onClick={onClose}>
            {t('apiKeys.createModal.cancel')}
          </Button>
          <Button variant="brand" data-track="api_keys:create_submit" loading={createMutation.isPending} onClick={handleSubmit}>
            {t('apiKeys.createModal.confirm')}
          </Button>
        </div>
      </SideSheet>
    </>
  )
}
