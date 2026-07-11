import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ForbiddenState } from '@/components/ui/ForbiddenState'
import { isApiErrorCode } from '@/lib/request-error-message'
import { LuPlus } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackAction, trackPageView } from '@/lib/track'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { listModels } from '@/services/catalog'
import { appToast } from '@/lib/app-toast'
import {
  createGuardrail,
  deleteGuardrail,
  listGuardrails,
  updateGuardrail,
  getGuardrail,
  addBudgetPolicy,
  updateBudgetPolicy,
  deleteBudgetPolicy,
} from '@/services/guardrails'
import { listWorkspaceMembers } from '@/services/workspaces'
import { listApiKeys } from '@/services/api-keys'
import type {
  GuardrailDetail,
  CreateGuardrailRequest,
  UpdateGuardrailRequest,
  AddBudgetPolicyRequest,
  UpdateBudgetPolicyRequest,
} from '@/interfaces/guardrails'
import { useCurrency } from '@/hooks/use-platform-config'
import { GuardrailSections } from './components/GuardrailTable'
import { GuardrailSummaryCards } from './components/GuardrailSummaryCards'
import { GuardrailDetailSheet } from './components/GuardrailDetailSheet'
import { GuardrailConfirmModals } from './components/GuardrailConfirmModals'
import { isValidBudgetAmount, trimAmountScale } from './budget'
import {
  summarize,
  budgetByScope,
  deriveScope,
  deriveKind,
  boostExpiry,
  globalDefaultAmount,
  regularBudgetAmounts,
  isoToLocalInput,
  localInputToIso,
  rawPromptInjectionMode,
  PROMPT_INJECTION_INHERIT,
  type BudgetAggScope,
  type GuardrailScope,
  type GuardrailKind,
  type PromptInjectionFormValue,
} from './derive'

type BudgetPolicy = NonNullable<GuardrailDetail['budget_policies']>[number]
type PeriodUnit = 'hour' | 'day' | 'week' | 'month'

// 全局护栏（is_default）的三档预算闸门，各自对应一个 aggregation_scope（对齐 PRD）。
export interface ScopeBudgetDraft { amount: string; period: PeriodUnit; limited: boolean }
const GLOBAL_BUDGET_SCOPES: BudgetAggScope[] = ['guardrail_total', 'per_member', 'per_api_key']
const EMPTY_BUDGET_DRAFT: ScopeBudgetDraft = { amount: '', period: 'month', limited: false }

// 有生效策略 → 限额（回填规范金额）；无 → 不限额。
function draftFromPolicy(p: BudgetPolicy | null): ScopeBudgetDraft {
  return p
    ? { amount: trimAmountScale(p.spend_limit_amount), period: p.period_unit, limited: true }
    : { ...EMPTY_BUDGET_DRAFT }
}

// 全局护栏脏数据判定：单个 aggregation_scope 下出现多条生效策略才算冲突
// （三档并存本身合法，区别于 member/key 的「全局单条」不变量）。
function globalBudgetConflict(detail?: GuardrailDetail | null): boolean {
  const counts: Record<string, number> = {}
  for (const p of activeBudgetPolicies(detail)) {
    counts[p.aggregation_scope] = (counts[p.aggregation_scope] ?? 0) + 1
  }
  return Object.values(counts).some((c) => c > 1)
}

type GlobalBudgetOp =
  | { type: 'add'; body: AddBudgetPolicyRequest }
  | { type: 'update'; policyId: string; body: UpdateBudgetPolicyRequest }
  | { type: 'delete'; policyId: string }

function isActiveBudgetPolicy(policy: BudgetPolicy) {
  if (!policy.enabled) return false
  if (!policy.effective_to) return true
  const endsAt = Date.parse(policy.effective_to)
  return Number.isNaN(endsAt) || endsAt > Date.now()
}

function activeBudgetPolicies(detail?: GuardrailDetail | null) {
  return detail?.budget_policies?.filter(isActiveBudgetPolicy) ?? []
}

// 单条不变量 (qa#162)：界面只有一个预算槽位。展示兜底取最新一条；
// 出现多条生效策略属于脏数据，由 budgetConflict 走报错分支而非静默展示。
function currentBudgetPolicy(detail?: GuardrailDetail | null) {
  const actives = activeBudgetPolicies(detail)
  if (actives.length === 0) return null
  return [...actives].sort(
    (a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from),
  )[0]
}

export default function GuardrailsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const tenants = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const { symbol: currencySymbol } = useCurrency()
  // 个人组织隐藏「个人护栏」分区/摘要卡，与 PRD 一致；企业组织显示。
  const showMember = tenants.find((tt) => tt.tenant_id === activeTenantId)?.type !== 'personal'
  // 三分区各自的名称搜索（全局 / 个人 / Key）
  const [scopeSearch, setScopeSearch] = useState<Record<GuardrailScope, string>>({ global: '', member: '', key: '' })
  const { hasPermission } = usePermissions()
  const canCreate         = hasPermission(PERMS.GUARDRAILS_CREATE)
  const canEdit           = hasPermission(PERMS.GUARDRAILS_EDIT)
  const canDelete         = hasPermission(PERMS.GUARDRAILS_DELETE)
  const canEditAssignment = hasPermission(PERMS.GUARDRAILS_ASSIGNMENT_EDIT)
  const canEditBudget     = hasPermission(PERMS.GUARDRAILS_BUDGET_EDIT)
  // 埋点顶层字段 is_space_owner：当前用户对本页作用域工作空间的 my_role 是否为 ws_owner
  const { ownedWorkspaceIds } = useTenantRole()
  const isActiveWorkspaceOwner = !!activeWorkspaceId && ownedWorkspaceIds.includes(activeWorkspaceId)

  useEffect(() => {
    trackPageView('guardrails', undefined, { is_space_owner: isActiveWorkspaceOwner })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 列表 ───────────────────────────────────────────────────────────────
  const { data: guardrails = [], isLoading, error: guardrailsError } = useQuery({
    queryKey: ['guardrails', activeWorkspaceId],
    queryFn: async () => {
      const res = await listGuardrails(activeWorkspaceId!)
      return res.items ?? []
    },
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false, // 40301/无权限不重试，直接走兼容态
    meta: { forbiddenHandled: true }, // 40301 由本页 ForbiddenState 承接，不弹全局 toast
  })

  // 接口正常返回但业务码 40301（无权限，典型是进了自己无权的工作空间护栏页）→ 渲染 403 兼容态，
  // 而不是让空数据伪装成「暂无护栏」空态。
  const forbidden = isApiErrorCode(guardrailsError, 40301)

  // ── 抽屉（创建+编辑+详情统一） ─────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; isActiveGlobal?: boolean } | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // 显式分类（全局/个人/Key）+ 类型（常规/提额），替代旧的 isDefault 反推。
  // is_default 由 scope === 'global' 派生；提额到期时间以 datetime-local 值持有。
  const [scope, setScope] = useState<GuardrailScope>('global')
  const [kind, setKind] = useState<GuardrailKind>('regular')
  const [boostExpiresAt, setBoostExpiresAt] = useState('')
  const [priority, setPriority] = useState<number>(0)
  const [modelBlacklist, setModelBlacklist] = useState<string[]>([])
  const [ipWhitelist, setIpWhitelist] = useState<string[]>([])
  const [promptInjectionMode, setPromptInjectionMode] = useState<PromptInjectionFormValue>('off')
  const [memberIds, setMemberIds] = useState<string[]>([])
  // 三分区共享的「有效 / 已过期已停用 / 全部」筛选（默认隐藏过期提额，文档§过期提额）
  const [listFilter, setListFilter] = useState<'active' | 'expired' | 'all'>('active')

  const modelsQuery = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ page_size: 100 }),
    staleTime: 120_000,
  })
  const modelSuggestions = modelsQuery.data?.items?.map((m) => m.model_id) ?? []
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<'info' | 'scope' | 'budget'>('info')
  const [isCreating, setIsCreating] = useState(false)

  // ── 预算内联编辑状态 ────────────────────────────────────────────────────
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetPeriodUnit, setBudgetPeriodUnit] = useState<'hour' | 'day' | 'week' | 'month'>('month')
  const [showClearBudget, setShowClearBudget] = useState(false)

  // ── 全局护栏三档预算编辑状态（各档对应一个 aggregation_scope） ───────────
  const [globalBudgets, setGlobalBudgets] = useState<Record<BudgetAggScope, ScopeBudgetDraft>>({
    guardrail_total: { ...EMPTY_BUDGET_DRAFT },
    per_member: { ...EMPTY_BUDGET_DRAFT },
    per_api_key: { ...EMPTY_BUDGET_DRAFT },
  })

  // ── API Key 作用范围本地状态（account_id 风格，与成员一致） ─────────────
  const [apiKeyIds, setApiKeyIds] = useState<string[]>([])

  // 显式分类/类型驱动各字段显隐（文档§各护栏配置项）：
  // - 模型黑名单 / IP 白名单 / 提示词注入：仅全局护栏与「常规 Key 护栏」配置；
  //   个人护栏、提额护栏一概不配置。
  // - 提示词注入「继承全局」：仅常规 Key 护栏可选，全局护栏不可。
  const isDefault = scope === 'global'
  const showModelIp = scope === 'global' || (scope === 'key' && kind === 'regular')
  const showPromptInjection = showModelIp
  const allowPromptInjectionInherit = scope === 'key' && kind === 'regular'
  // 全局护栏恒为常规：切到全局时把类型归一到常规，避免残留 boost
  function handleScopeChange(next: GuardrailScope) {
    setScope(next)
    if (next === 'global') setKind('regular')
  }
  const piOptions: PromptInjectionFormValue[] = allowPromptInjectionInherit
    ? [PROMPT_INJECTION_INHERIT, 'off', 'flag', 'redact', 'block']
    : ['off', 'flag', 'redact', 'block']
  // 作用域切换后旧值可能不在选项里（如 Key→全局时的 inherit），归一到该作用域的默认值
  const normalizedPromptInjection: PromptInjectionFormValue = piOptions.includes(promptInjectionMode)
    ? promptInjectionMode
    : (allowPromptInjectionInherit ? PROMPT_INJECTION_INHERIT : 'off')

  // ── 详情查询 ────────────────────────────────────────────────────────────
  const { data: detail, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: ['guardrail-detail', detailId],
    queryFn: () => getGuardrail(detailId!),
    enabled: !!detailId && detailOpen,
    staleTime: 0,
  })
  // 详情加载失败（含后端对脏数据返回的 409「预算配置数据错误」）要在抽屉内
  // 呈现，而不是留一个空壳或上一条护栏的可保存表单 (qa#162 review)
  const detailLoadError = detail
    ? null
    : detailError instanceof Error
      ? detailError.message
      : detailError
        ? '护栏详情加载失败'
        : null

  // Populate the whole form (info fields + scope: members + api_keys) once the
  // detail loads, regardless of the active tab — the single bottom Save button
  // persists all of it, so every field's state must be ready even if the user
  // never visits the scope tab.
  useEffect(() => {
    if (!isCreating && detailOpen && detail) {
      syncFormFromDetail(detail)
    }
  }, [detail, detailOpen, isCreating])

  const membersQuery = useQuery({
    queryKey: ['workspace-members', activeWorkspaceId],
    queryFn: () => listWorkspaceMembers(activeWorkspaceId!, { page_size: 100 }),
    enabled: !!activeWorkspaceId && detailOpen,
    staleTime: 60_000,
  })

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId!),
    enabled: !!activeWorkspaceId && detailOpen,
    staleTime: 60_000,
  })

  // ── 突变 ────────────────────────────────────────────────────────────────
  // qa#164 单条维护语义：首次设置 POST 新增唯一一条；已有预算时 PATCH 原地
  // 编辑同一条（同一 id），不再停旧建新——策略 id 稳定，计费侧当期已消耗
  // 额度不会因为改限额而重置。
  type SaveBudgetVars =
    | { id: string; policyId: string; body: UpdateBudgetPolicyRequest }
    | { id: string; policyId?: undefined; body: AddBudgetPolicyRequest }
  const setBudgetMutation = useMutation({
    mutationFn: (vars: SaveBudgetVars) =>
      vars.policyId !== undefined
        ? updateBudgetPolicy(vars.id, vars.policyId, vars.body)
        : addBudgetPolicy(vars.id, vars.body),
    onSuccess: (updated, vars) => {
      appToast.success('预算已保存')
      // 响应就是最新 detail：先写缓存（立即同步 budget 状态），再失效兜底
      qc.setQueryData(['guardrail-detail', vars.id], updated)
      qc.invalidateQueries({ queryKey: ['guardrail-detail', vars.id] })
    },
    onError: (err: unknown) =>
      appToast.requestError(err, '保存失败'),
  })

  const removeBudgetMutation = useMutation({
    mutationFn: ({ guardrailId, policyId }: { guardrailId: string; policyId: string }) =>
      deleteBudgetPolicy(guardrailId, policyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guardrail-detail', detailId] })
    },
    onError: (err: unknown) =>
      appToast.requestError(err, '删除失败'),
  })

  // 全局护栏三档保存：一次点击可涉及多档的 增/改/删，按顺序串行执行，
  // 以最后一条响应回写缓存（三档互相独立、可并存，后端无单条限制）。
  const saveGlobalBudgetMutation = useMutation({
    mutationFn: async ({ id, ops }: { id: string; ops: GlobalBudgetOp[] }) => {
      let latest: GuardrailDetail | undefined
      for (const op of ops) {
        if (op.type === 'add') latest = await addBudgetPolicy(id, op.body)
        else if (op.type === 'update') latest = await updateBudgetPolicy(id, op.policyId, op.body)
        else latest = await deleteBudgetPolicy(id, op.policyId)
      }
      return latest
    },
    onSuccess: (updated, vars) => {
      appToast.success('预算已保存')
      if (updated) qc.setQueryData(['guardrail-detail', vars.id], updated)
      qc.invalidateQueries({ queryKey: ['guardrail-detail', vars.id] })
    },
    onError: (err: unknown) =>
      appToast.requestError(err, '保存失败'),
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateGuardrailRequest) =>
      createGuardrail(activeWorkspaceId!, payload),
    onSuccess: (created) => {
      appToast.success(t('guardrails.toast.createSuccess'))
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
      setIsCreating(false)
      setDetailId(created.id)
      setSheetTab('scope')
    },
    onError: (err: unknown) =>
      appToast.requestError(err, t('guardrails.toast.createError')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateGuardrailRequest }) =>
      updateGuardrail(id, payload),
    onSuccess: () => {
      appToast.success(t('guardrails.toast.updateSuccess'))
      setDetailOpen(false)
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
      qc.invalidateQueries({ queryKey: ['guardrail-detail', detailId] })
    },
    onError: (err: unknown) =>
      appToast.requestError(err, t('guardrails.toast.updateError')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGuardrail(id),
    onSuccess: () => {
      appToast.success(t('guardrails.toast.deleteSuccess'))
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
      if (deleteTarget?.id === detailId) setDetailOpen(false)
    },
    onError: (err: unknown) =>
      appToast.requestError(err, t('guardrails.toast.deleteError')),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      updateGuardrail(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] }),
    onError: (err: unknown) =>
      appToast.requestError(err, t('guardrails.toast.toggleError')),
  })

  // 全局护栏单选级联（文档：同一空间同时最多 1 条启用中的全局护栏）：启用一条时
  // 其余启用中的全局护栏自动停用。乐观更新即时反馈，onSettled 失效刷新兜底。
  const cascadeGlobalMutation = useMutation({
    mutationFn: async ({ activateId, deactivateIds }: { activateId: string; deactivateIds: string[] }) => {
      for (const id of deactivateIds) await updateGuardrail(id, { status: 'inactive' })
      await updateGuardrail(activateId, { status: 'active' })
    },
    onMutate: async ({ activateId, deactivateIds }) => {
      await qc.cancelQueries({ queryKey: ['guardrails', activeWorkspaceId] })
      const prev = qc.getQueryData<GuardrailDetail[]>(['guardrails', activeWorkspaceId])
      qc.setQueryData<GuardrailDetail[]>(['guardrails', activeWorkspaceId], (old) =>
        (old ?? []).map((g) =>
          g.id === activateId
            ? { ...g, status: 'active' }
            : deactivateIds.includes(g.id)
              ? { ...g, status: 'inactive' }
              : g,
        ),
      )
      return { prev }
    },
    onError: (err: unknown, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['guardrails', activeWorkspaceId], ctx.prev)
      appToast.requestError(err, t('guardrails.toast.toggleError'))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] }),
  })

  // 统一切换入口：启用某条全局护栏 → 走级联（停用其他启用中全局）；其余走普通切换。
  function handleToggle({ id, status }: { id: string; status: 'active' | 'inactive' }) {
    const row = guardrails.find((g) => g.id === id)
    if (row?.is_default && status === 'active') {
      const deactivateIds = guardrails
        .filter((g) => g.is_default && g.status === 'active' && g.id !== id)
        .map((g) => g.id)
      cascadeGlobalMutation.mutate({ activateId: id, deactivateIds })
    } else {
      toggleMutation.mutate({ id, status })
    }
  }

  // ── 辅助函数 ────────────────────────────────────────────────────────────
  function openCreate() {
    setIsCreating(true)
    setDetailId(null)
    setName(''); setDescription(''); setScope('global'); setKind('regular'); setBoostExpiresAt(''); setPriority(0)
    setModelBlacklist([]); setIpWhitelist([]); setPromptInjectionMode('off'); setMemberIds([]); setApiKeyIds([])
    setSheetTab('info')
    setDetailOpen(true)
  }

  function openDetail(id: string) {
    setIsCreating(false)
    setDetailId(id)
    // 防串档：清掉上一条护栏的表单残留。加载成功后 syncFormFromDetail 回填；
    // 加载失败时抽屉只显示错误，而不是上一条护栏的可保存表单 (qa#162 review)
    setName(''); setDescription(''); setScope('global'); setKind('regular'); setBoostExpiresAt(''); setPriority(0)
    setModelBlacklist([]); setIpWhitelist([]); setPromptInjectionMode('off'); setMemberIds([]); setApiKeyIds([])
    setBudgetAmount(''); setBudgetPeriodUnit('month')
    setGlobalBudgets({
      guardrail_total: { ...EMPTY_BUDGET_DRAFT },
      per_member: { ...EMPTY_BUDGET_DRAFT },
      per_api_key: { ...EMPTY_BUDGET_DRAFT },
    })
    setSheetTab('info')
    setDetailOpen(true)
  }

  // 全局护栏三档从 detail 回填（按 aggregation_scope 各取生效策略）
  function fillGlobalBudgetsFromDetail(d: GuardrailDetail) {
    setGlobalBudgets({
      guardrail_total: draftFromPolicy(budgetByScope(d, 'guardrail_total')),
      per_member: draftFromPolicy(budgetByScope(d, 'per_member')),
      per_api_key: draftFromPolicy(budgetByScope(d, 'per_api_key')),
    })
  }

  function handleGlobalBudgetChange(scope: BudgetAggScope, patch: Partial<ScopeBudgetDraft>) {
    setGlobalBudgets((prev) => ({ ...prev, [scope]: { ...prev[scope], ...patch } }))
  }

  function syncFormFromDetail(d: GuardrailDetail) {
    setName(d.name); setDescription(d.description ?? '')
    // 分类/类型读真值（scope 由 is_default+assignments 派生兜底，kind 读 metadata.kind）
    setScope(deriveScope(d)); setKind(deriveKind(d))
    setBoostExpiresAt(isoToLocalInput(boostExpiry(d)))
    setPriority(d.priority)
    // 预算 input 回填落库的规范金额（去掉 NUMERIC(24,12) 的 scale 尾零），
    // 保证回显值与保存值一致 (qa#156)
    const bp = currentBudgetPolicy(d)
    setBudgetAmount(bp ? trimAmountScale(bp.spend_limit_amount) : '')
    setBudgetPeriodUnit(bp?.period_unit ?? 'month')
    fillGlobalBudgetsFromDetail(d)
    const meta = d.metadata ?? {}
    setModelBlacklist(Array.isArray(meta.model_blacklist) ? meta.model_blacklist : [])
    setIpWhitelist(Array.isArray(meta.ip_whitelist) ? meta.ip_whitelist : [])
    // 显式值直接回填；无值时 常规 Key 护栏=继承全局、其余=关闭
    setPromptInjectionMode(rawPromptInjectionMode(d) ?? (deriveScope(d) === 'key' ? PROMPT_INJECTION_INHERIT : 'off'))
    // Scope (members + api_keys) lives in assignments; metadata.* is the input
    // we materialize from. Read assignments first (the enforced truth), falling
    // back to metadata for guardrails saved before materialization existed.
    setMemberIds(
      d.assignments?.filter(a => a.subject_type === 'member' && a.account_id).map(a => a.account_id as string)
      ?? (Array.isArray(meta.members) ? (meta.members as string[]) : [])
    )
    setApiKeyIds(
      d.assignments?.filter(a => a.subject_type === 'api_key' && a.api_key_id).map(a => a.api_key_id as string)
      ?? (Array.isArray(meta.api_keys) ? (meta.api_keys as string[]) : [])
    )
  }

  function handleSubmit() {
    if (!name.trim()) { appToast.error(t('guardrails.toast.nameRequired')); return }
    // 提额必须设置到期时间（文档§校验规则：提额护栏没有到期时间时不能保存）
    if (kind === 'boost') {
      if (!boostExpiresAt || !localInputToIso(boostExpiresAt)) {
        appToast.error('提额护栏必须设置到期时间')
        return
      }
    }
    // ONE save for the whole drawer: rules (model_blacklist/ip_whitelist) round-
    // trip via metadata; scope (members + api_keys) is materialized into
    // assignments server-side. Always send all arrays (even empty) so empty =
    // clear. api_keys is only editable in edit mode (scope tab); on create it
    // stays whatever was selected (none).
    // 分类/类型经 metadata 占位往返（后端 #378 未交付 scope/kind 显式字段前）：
    // is_default 承载全局分类，kind='boost' 标记提额，expires_at 记提额到期。
    const metadata: Record<string, unknown> = {
      members: scope === 'member' ? memberIds : [],
      api_keys: scope === 'key' ? apiKeyIds : [],
    }
    // 文档：个人护栏、提额护栏不配置模型黑名单 / IP 白名单 → 隐藏且清空落库
    metadata.model_blacklist = showModelIp ? modelBlacklist : []
    metadata.ip_whitelist = showModelIp ? ipWhitelist : []
    // 文档：个人护栏不写提示词注入；常规 Key「继承全局」= 不写该字段（缺省即继承/关闭）。
    // 不写 = 清空，编辑时从显式模式切回继承/个人也能正确落空。
    if (showPromptInjection && normalizedPromptInjection !== PROMPT_INJECTION_INHERIT) {
      metadata.prompt_injection_mode = normalizedPromptInjection
    }
    // 类型：全局护栏恒常规、不写 kind；个人/Key 护栏落 kind，提额附到期时间
    if (scope !== 'global') metadata.kind = kind
    if (kind === 'boost') metadata.expires_at = localInputToIso(boostExpiresAt)
    const payload: CreateGuardrailRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      is_default: isDefault,
      priority,
      metadata,
    }
    if (!isCreating && detailId) {
      trackAction(PERMS.GUARDRAILS_EDIT, undefined, { is_space_owner: isActiveWorkspaceOwner })
      updateMutation.mutate({ id: detailId, payload })
    } else {
      trackAction(PERMS.GUARDRAILS_CREATE, undefined, { is_space_owner: isActiveWorkspaceOwner })
      createMutation.mutate(payload)
    }
  }

  function handleSaveBudget() {
    if (!detail) return
    if (budgetConflict) {
      appToast.error('预算配置数据错误：存在多条生效中的预算策略，请联系管理员处理')
      return
    }
    const amount = budgetAmount.trim()
    // 与后端校验同一契约：输入什么就存什么，存不了的直接拒绝
    if (!isValidBudgetAmount(amount)) {
      appToast.error('预算金额无效：请输入大于 0 的数字，整数最多 12 位，小数最多 2 位')
      return
    }
    // 预算上/下限校验（文档§校验规则）：本地拿全局默认预算比对。
    // - 常规个人/Key 护栏：预算不得超过启用中全局护栏的对应默认预算。
    // - 提额个人/Key 护栏：预算必须大于当前生效预算（无常规绑定时以全局默认为基线）。
    const dScope = deriveScope(detail)
    const dKind = deriveKind(detail)
    if (dScope === 'member' || dScope === 'key') {
      const aggScope: BudgetAggScope = dScope === 'member' ? 'per_member' : 'per_api_key'
      const globalDefault = globalDefaultAmount(guardrails, aggScope)
      const amt = Number(amount)
      if (dKind === 'regular') {
        if (globalDefault != null && amt > globalDefault) {
          appToast.error(`常规护栏预算不能超过全局默认预算（${currencySymbol}${trimAmountScale(String(globalDefault))} / ${dScope === 'member' ? '每人' : '每 Key'}）`)
          return
        }
      } else if (globalDefault != null && amt <= globalDefault) {
        appToast.error(`提额预算必须大于当前生效预算（${currencySymbol}${trimAmountScale(String(globalDefault))}）`)
        return
      }
    }
    if (budget) {
      // 编辑：原地维护这唯一一条策略。只发真正变更的字段——金额没改就不发
      // 金额、周期没改就不发周期：计费当期消耗 counter 按 (policy id, 周期窗口)
      // 累计，少发未变字段可避免无谓的窗口重锚。
      const body: UpdateBudgetPolicyRequest = {}
      if (amount !== trimAmountScale(budget.spend_limit_amount)) body.spend_limit_amount = amount
      if (budgetPeriodUnit !== budget.period_unit) body.period_unit = budgetPeriodUnit
      if (Object.keys(body).length === 0) {
        appToast.info('预算未发生变化')
        return
      }
      setBudgetMutation.mutate({ id: detail.id, policyId: budget.id, body })
    } else {
      // 首次设置：新增唯一一条
      setBudgetMutation.mutate({
        id: detail.id,
        body: {
          aggregation_scope: 'guardrail_total',
          period_unit: budgetPeriodUnit,
          period_length: 1,
          enforcement_mode: 'hard_limit',
          spend_limit_amount: amount,
          enabled: true,
        },
      })
    }
  }

  // 全局护栏三档保存：逐档比对当前生效策略 → 增（无）/ 改（有且变了）/ 删（清空）。
  function handleSaveGlobalBudgets() {
    if (!detail) return
    if (budgetConflict) {
      appToast.error('预算配置数据错误：存在多条生效中的预算策略，请联系管理员处理')
      return
    }
    // 个人租户不显示、也不触碰「默认个人预算」(per_member) 档
    const scopes = GLOBAL_BUDGET_SCOPES.filter((s) => s !== 'per_member' || showMember)
    const ops: GlobalBudgetOp[] = []
    for (const aggScope of scopes) {
      const draft = globalBudgets[aggScope]
      const existing = budgetByScope(detail, aggScope)
      if (draft.limited) {
        const amount = draft.amount.trim()
        if (!isValidBudgetAmount(amount)) {
          appToast.error('预算金额无效：请输入大于 0 的数字，整数最多 12 位，小数最多 2 位')
          return
        }
        // 下调全局默认时，若存在预算高于新默认值的常规护栏，必须先调低那些常规护栏
        // （文档§校验规则）。本地枚举同作用域常规护栏预算比对。
        if (aggScope === 'per_member' || aggScope === 'per_api_key') {
          const targetScope = aggScope === 'per_member' ? 'member' : 'key'
          const higher = regularBudgetAmounts(guardrails, targetScope).filter((v) => v > Number(amount))
          if (higher.length > 0) {
            appToast.error(`存在预算高于新默认值的常规${targetScope === 'member' ? '个人' : 'Key'}护栏，需先调低这些常规护栏，才能下调全局默认预算`)
            return
          }
        }
        if (existing) {
          // 原地改：只发真正变更的字段（金额/周期），避免计费窗口无谓重锚
          const body: UpdateBudgetPolicyRequest = {}
          if (amount !== trimAmountScale(existing.spend_limit_amount)) body.spend_limit_amount = amount
          if (draft.period !== existing.period_unit) body.period_unit = draft.period
          if (Object.keys(body).length > 0) ops.push({ type: 'update', policyId: existing.id, body })
        } else {
          ops.push({
            type: 'add',
            body: {
              aggregation_scope: aggScope,
              period_unit: draft.period,
              period_length: 1,
              enforcement_mode: 'hard_limit',
              spend_limit_amount: amount,
              enabled: true,
            },
          })
        }
      } else if (existing) {
        // 清空该档 → 删除其生效策略
        ops.push({ type: 'delete', policyId: existing.id })
      }
    }
    if (ops.length === 0) {
      appToast.info('预算未发生变化')
      return
    }
    trackAction(PERMS.GUARDRAILS_BUDGET_EDIT, undefined, { is_space_owner: isActiveWorkspaceOwner })
    saveGlobalBudgetMutation.mutate({ id: detail.id, ops })
  }

  // ── 派生数据 ────────────────────────────────────────────────────────────
  const budget = currentBudgetPolicy(detail)
  // 全局护栏（is_default）按 aggregation_scope 三档编辑，冲突判定按「每档单条」；
  // member/key 护栏保持「全局单条」不变量。
  const isGlobal = !!detail?.is_default
  const budgetConflict = isGlobal
    ? globalBudgetConflict(detail)
    : activeBudgetPolicies(detail).length > 1

  // Label as "name (email)" so the picker is human-readable instead of an
  // opaque account_id. Fall back gracefully when a field is missing.
  const memberOptions = (membersQuery.data?.items ?? []).map(m => {
    const a = m.account
    const label = a.display_name && a.email
      ? `${a.display_name} (${a.email})`
      : (a.display_name || a.email || a.account_id)
    return { id: a.account_id, name: label }
  })
  // API key picker options (id-based, like members): label by name, fall back to
  // id. Only active keys are selectable; an already-bound key that is no longer
  // active still resolves its label for display.
  const apiKeyOptions = (apiKeysQuery.data?.items ?? []).map((k) => ({
    id: k.api_key_id,
    name: k.name || k.api_key_id,
    active: k.status === 'active',
  }))

  const detailRow = guardrails.find(g => g.id === detailId)

  // ── JSX ─────────────────────────────────────────────────────────────────
  if (forbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('guardrails.title')} />
        <ForbiddenState resource={t('guardrails.title')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('guardrails.title')}
        actions={canCreate && (
          <Button
            variant="brand"
            onClick={openCreate}
            className="rounded-full px-5 h-10 shadow-lg shadow-brand-glow/20"
          >
            <LuPlus className="w-4 h-4 mr-1.5" />
            {t('guardrails.create')}
          </Button>
        )}
      />

      {/* 摘要卡：全局 / 个人 / Key / 提额（由列表派生） */}
      <GuardrailSummaryCards summary={summarize(guardrails)} showMember={showMember} loading={isLoading} />

      {/* 三分区列表：全局 / 个人 / Key */}
      <GuardrailSections
        guardrails={guardrails}
        isLoading={isLoading}
        canEdit={canEdit}
        canDelete={canDelete}
        canCreate={canCreate}
        showMember={showMember}
        currencySymbol={currencySymbol}
        search={scopeSearch}
        onSearchChange={(s, value) => setScopeSearch((prev) => ({ ...prev, [s]: value }))}
        listFilter={listFilter}
        onListFilterChange={setListFilter}
        onOpenDetail={openDetail}
        onToggle={handleToggle}
        onDelete={(target) => {
          // 全局启用中护栏删除需二次提醒（文档：删除启用中全局按无全局处理）
          const row = guardrails.find((g) => g.id === target.id)
          setDeleteTarget({ ...target, isActiveGlobal: !!row?.is_default && row?.status === 'active' })
        }}
        onCreate={openCreate}
      />

      {/* 统一配置抽屉（新建 + 编辑 + 详情） */}
      <GuardrailDetailSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        isCreating={isCreating}
        detail={detail}
        detailLoading={detailLoading}
        detailLoadError={detailLoadError}
        detailRow={detailRow}
        sheetTab={sheetTab}
        onSheetTabChange={setSheetTab}
        onToggleStatus={handleToggle}
        syncFormFromDetail={syncFormFromDetail}
        name={name} onNameChange={setName}
        description={description} onDescriptionChange={setDescription}
        priority={priority} onPriorityChange={setPriority}
        scope={scope} onScopeChange={handleScopeChange}
        kind={kind} onKindChange={setKind}
        lockScopeKind={!isCreating} showMemberScope={showMember}
        boostExpiresAt={boostExpiresAt} onBoostExpiresAtChange={setBoostExpiresAt}
        showModelIp={showModelIp}
        modelBlacklist={modelBlacklist} onModelBlacklistChange={setModelBlacklist}
        ipWhitelist={ipWhitelist} onIpWhitelistChange={setIpWhitelist}
        promptInjectionMode={normalizedPromptInjection} onPromptInjectionModeChange={setPromptInjectionMode}
        showPromptInjection={showPromptInjection} allowPromptInjectionInherit={allowPromptInjectionInherit}
        modelSuggestions={modelSuggestions}
        memberIds={memberIds} onMemberIdsChange={setMemberIds} memberOptions={memberOptions}
        apiKeyIds={apiKeyIds} onApiKeyIdsChange={setApiKeyIds} apiKeyOptions={apiKeyOptions}
        budget={budget}
        budgetConflict={budgetConflict}
        budgetAmount={budgetAmount} onBudgetAmountChange={setBudgetAmount}
        budgetPeriodUnit={budgetPeriodUnit} onBudgetPeriodUnitChange={setBudgetPeriodUnit}
        canEditBudget={canEditBudget}
        savingBudget={setBudgetMutation.isPending}
        onSaveBudget={handleSaveBudget}
        onShowClearBudget={() => setShowClearBudget(true)}
        isGlobal={isGlobal}
        showMember={showMember}
        globalBudgets={globalBudgets}
        onGlobalBudgetChange={handleGlobalBudgetChange}
        onEnterBudgetTab={() => { if (detail) fillGlobalBudgetsFromDetail(detail) }}
        savingGlobalBudget={saveGlobalBudgetMutation.isPending}
        onSaveGlobalBudgets={handleSaveGlobalBudgets}
        currencySymbol={currencySymbol}
        canEdit={canEdit}
        canEditAssignment={canEditAssignment}
        submitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleSubmit}
      />

      {/* 删除 + 清除预算确认 Modal */}
      <GuardrailConfirmModals
        deleteTarget={deleteTarget}
        onCloseDelete={() => setDeleteTarget(null)}
        deleting={deleteMutation.isPending}
        onConfirmDelete={() => { if (deleteTarget) { trackAction(PERMS.GUARDRAILS_DELETE, undefined, { is_space_owner: isActiveWorkspaceOwner }); deleteMutation.mutate(deleteTarget.id) } }}
        showClearBudget={showClearBudget}
        onCloseClear={() => setShowClearBudget(false)}
        clearing={removeBudgetMutation.isPending}
        onConfirmClear={() => {
          // budgetConflict 防线：确认弹窗是独立状态，版本错位下 detail 可能在
          // 弹窗打开后才变脏——脏数据上清除最新策略只会留下更旧的那条
          if (detail && budget && !budgetConflict) {
            removeBudgetMutation.mutate({ guardrailId: detail.id, policyId: budget.id })
            setShowClearBudget(false)
          }
        }}
      />
    </div>
  )
}
