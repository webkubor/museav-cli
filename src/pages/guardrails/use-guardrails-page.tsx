/**
 * 工作空间安全护栏页数据层：状态、查询、突变、事件处理器与派生数据。
 * 页面壳 JSX 见 ./index.tsx；纯工具见 ./guardrail-utils.ts。
 * 路由：/workspace/:workspaceId/guardrails
 * API：/workspaces/:workspaceId/guardrails、/members、/api-keys
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isApiErrorCode, errorCodeOf } from '@/lib/request-error-message'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { trackEvent, trackAction, trackPageView } from '@/lib/track'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { listModels } from '@/services/catalog'
import { appToast } from '@/lib/app-toast'
import {
  createGuardrail,
  deleteGuardrail,
  listGuardrails,
  listGuardrailAudit,
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
import { isValidBudgetAmount, trimAmountScale } from './budget'
import {
  summarize,
  budgetByScope,
  deriveScope,
  deriveKind,
  boostExpiry,
  guardrailBudgetPeriodLength,
  isoToLocalInput,
  localInputToIso,
  rawPromptInjectionMode,
  PROMPT_INJECTION_INHERIT,
  type BudgetAggScope,
  type GuardrailScope,
  type GuardrailKind,
  type PromptInjectionFormValue,
} from './derive'
import {
  GLOBAL_BUDGET_SCOPES,
  EMPTY_BUDGET_DRAFT,
  draftFromPolicy,
  globalBudgetConflict,
  activeBudgetPolicies,
  currentBudgetPolicy,
  type ScopeBudgetDraft,
  type GlobalBudgetOp,
} from './guardrail-utils'

export function useGuardrailsPage() {
  const { t } = useTranslation()
  const { workspaceId = '' } = useParams<{ workspaceId: string }>()
  const qc = useQueryClient()
  const tenants = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const currentAccountId = useAuthStore((s) => s.account?.account_id) ?? ''
  const { symbol: currencySymbol } = useCurrency()
  // 个人组织隐藏「个人护栏」分区/摘要卡，与 PRD 一致；企业组织显示。
  const showMember = tenants.find((tt) => tt.tenant_id === activeTenantId)?.type !== 'personal'
  // 三分区各自的名称搜索（全局 / 个人 / Key）
  const [scopeSearch, setScopeSearch] = useState<Record<GuardrailScope, string>>({ global: '', member: '', key: '' })
  const { hasPermission } = usePermissions()
  const canEditAssignment = hasPermission(PERMS.GUARDRAILS_ASSIGNMENT_EDIT)
  const canEditBudget     = hasPermission(PERMS.GUARDRAILS_BUDGET_EDIT)
  // 「分类 × 动作」细粒度（#479/#57 · PRD §11）：创建/配置/删除 按 全局/个人/Key 各用自己的码，
  // 扁平 guardrails:create/edit/delete 已退役——Member 仅授 key 分类码时，
  // 全局/个人分区的管理动作与创建分类自然不可达（不再靠角色启发式）。
  const canCreateScope: Record<GuardrailScope, boolean> = {
    global: hasPermission(PERMS.GUARDRAILS_CREATE_GLOBAL),
    member: hasPermission(PERMS.GUARDRAILS_CREATE_MEMBER),
    key: hasPermission(PERMS.GUARDRAILS_CREATE_KEY),
  }
  const canEditScope: Record<GuardrailScope, boolean> = {
    global: hasPermission(PERMS.GUARDRAILS_EDIT_GLOBAL),
    member: hasPermission(PERMS.GUARDRAILS_EDIT_MEMBER),
    key: hasPermission(PERMS.GUARDRAILS_EDIT_KEY),
  }
  const canDeleteScope: Record<GuardrailScope, boolean> = {
    global: hasPermission(PERMS.GUARDRAILS_DELETE_GLOBAL),
    member: hasPermission(PERMS.GUARDRAILS_DELETE_MEMBER),
    key: hasPermission(PERMS.GUARDRAILS_DELETE_KEY),
  }
  const canCreateBoost = hasPermission(PERMS.GUARDRAILS_CREATE_BOOST)
  // 页头创建入口：任一分类可建才显示（全无码时不再打开一个必然 403 的表单）
  const canCreate = canCreateScope.global || canCreateScope.member || canCreateScope.key
  // 埋点顶层字段 is_space_owner：当前用户对本页作用域工作空间的 my_role 是否为 ws_owner
  const { ownedWorkspaceIds, canManage } = useTenantRole()
  const isActiveWorkspaceOwner = ownedWorkspaceIds.includes(workspaceId)
  // 逐行编辑归属（需求方#261）：管理者（租户 owner/admin 或本空间负责人）可编辑全部护栏；
  // 普通成员只能编辑自己创建的。后端对非管理者改他人护栏返 40301（qa#513/prd#261），前端
  // 同口径提前拦截——避免「按钮显示可编辑 → 进抽屉改 → 保存才报错」的空转。
  const managesWorkspace = canManage || isActiveWorkspaceOwner
  const canManageRow = (row: GuardrailDetail) =>
    managesWorkspace || (!!currentAccountId && row.created_by?.account_id === currentAccountId)

  useEffect(() => {
    trackPageView('guardrails', undefined, { is_space_owner: isActiveWorkspaceOwner })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 列表 ───────────────────────────────────────────────────────────────
  const { data: guardrails = [], isLoading, error: guardrailsError } = useQuery({
    queryKey: ['guardrails', workspaceId],
    queryFn: async () => {
      const res = await listGuardrails(workspaceId)
      return res.items ?? []
    },
    enabled: Boolean(workspaceId),
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

  const modelsQuery = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ page_size: 100 }),
    staleTime: 120_000,
  })
  const modelSuggestions = modelsQuery.data?.items?.map((m) => m.model_id) ?? []
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // ── 预算内联编辑状态 ────────────────────────────────────────────────────
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetPeriodUnit, setBudgetPeriodUnit] = useState<'hour' | 'day' | 'week' | 'month'>('month')
  // 个人/Key「提额」预算是否限额（常规档恒为限额=必填）。true=限额，false=不限额（不下发/删除预算策略）。
  const [budgetLimited, setBudgetLimited] = useState(true)

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

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => listWorkspaceMembers(workspaceId, { page_size: 100 }),
    enabled: !!workspaceId && detailOpen,
    staleTime: 60_000,
  })

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () => listApiKeys(workspaceId),
    enabled: !!workspaceId && detailOpen,
    staleTime: 60_000,
  })

  // 操作记录：审计接口按工作空间返回全部记录，详情抽屉按 target_id 过滤到本护栏
  // （Swagger 无 guardrail_id 过滤参数，只有 workspaceId/cursor/limit）。仅编辑态拉取。
  const auditQuery = useQuery({
    queryKey: ['guardrail-audit', workspaceId],
    queryFn: () => listGuardrailAudit(workspaceId).catch(() => undefined),
    enabled: !!workspaceId && detailOpen && !isCreating,
    staleTime: 30_000,
  })
  const auditRows = (auditQuery.data?.items ?? []).filter((a) => a.target_id === detailId)

  // ── 突变 ────────────────────────────────────────────────────────────────
  // 编辑态单保存编排（对齐 PRD 单一「保存护栏」）：一次点击串行执行
  //   ① 护栏本身 PATCH /guardrails/{id}（名称 + 提示词注入 + metadata 承载分类/成员/Key/模型/IP/提额到期）
  //   ② 预算 增/改/删 POST|PATCH|DELETE /guardrails/{id}/budget-policies（全局三档 or 个人/Key 单档）
  // 任一失败即整体报错（不静默兜底）；qa#164 单条维护语义：已有策略 PATCH 原地编辑同一条。
  const saveGuardrailMutation = useMutation({
    mutationFn: async ({ id, payload, ops }: { id: string; payload?: UpdateGuardrailRequest; ops: GlobalBudgetOp[] }) => {
      if (payload) await updateGuardrail(id, payload)
      let latest: GuardrailDetail | undefined
      for (const op of ops) {
        if (op.type === 'add') latest = await addBudgetPolicy(id, op.body)
        else if (op.type === 'update') latest = await updateBudgetPolicy(id, op.policyId, op.body)
        else latest = await deleteBudgetPolicy(id, op.policyId)
      }
      return latest
    },
    onSuccess: (updated, vars) => {
      appToast.success(t('guardrails.toast.updateSuccess'))
      setDetailOpen(false)
      if (updated) qc.setQueryData(['guardrail-detail', vars.id], updated)
      qc.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
      qc.invalidateQueries({ queryKey: ['guardrail-detail', vars.id] })
      qc.invalidateQueries({ queryKey: ['guardrail-audit', workspaceId] })
      trackEvent('guardrails:edit', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
    },
    onError: (err: unknown, vars) => {
      appToast.requestError(err, t('guardrails.toast.updateError'))
      // 编排是串行多请求：中途被后端校验拦下时，前面的护栏 PATCH / 预算 op 可能已
      // 落库，刷新缓存让表格与抽屉反映真实的部分保存状态。
      qc.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
      qc.invalidateQueries({ queryKey: ['guardrail-detail', vars.id] })
      trackEvent('guardrails:edit', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  const createMutation = useMutation({
    mutationFn: (payload: CreateGuardrailRequest) =>
      createGuardrail(workspaceId, payload),
    onSuccess: async (created) => {
      // 全局护栏单选不变量（文档：同一空间最多 1 条启用中全局）：后端新建默认 active，
      // 而创建不走 handleToggle 的级联 → 会与既有 active 全局并存。这里补级联：新建的是
      // 全局护栏时，停用其余原本 active 的全局。（权威约束应由后端保证，已落单，前端先兜住 UI 路径。）
      if (created.is_default) {
        const staleActiveGlobals = guardrails.filter(
          (g) => g.is_default && g.status === 'active' && g.id !== created.id,
        )
        for (const g of staleActiveGlobals) {
          try { await updateGuardrail(g.id, { status: 'inactive' }) } catch { /* 单条失败不阻断创建，onSettled 刷新兜底 */ }
        }
      }
      // 对齐原型「一页填完」：护栏建好后补预算策略（后端预算挂在已存在护栏上，无法随创建下发）。
      // 全局三档 / 非全局单档；仅下发「限额且金额有效」的档。
      const ops: AddBudgetPolicyRequest[] = []
      if (scope === 'global') {
        for (const agg of GLOBAL_BUDGET_SCOPES.filter((s) => s !== 'per_member' || showMember)) {
          const d = globalBudgets[agg]
          const amt = d.amount.trim()
          if (d.limited && isValidBudgetAmount(amt)) {
            ops.push({ aggregation_scope: agg, period_unit: d.period, period_length: guardrailBudgetPeriodLength(d.period), enforcement_mode: 'hard_limit', spend_limit_amount: amt, enabled: true })
          }
        }
      } else {
        const agg: BudgetAggScope = scope === 'member' ? 'per_member' : 'per_api_key'
        const amt = budgetAmount.trim()
        // 提额「不限额」档不下发预算策略；常规恒限额、提额限额档才发。
        const budgetOn = kind === 'regular' || budgetLimited
        if (budgetOn && amt && isValidBudgetAmount(amt)) {
          ops.push({ aggregation_scope: agg, period_unit: budgetPeriodUnit, period_length: guardrailBudgetPeriodLength(budgetPeriodUnit), enforcement_mode: 'hard_limit', spend_limit_amount: amt, enabled: true })
        }
      }
      try {
        for (const op of ops) await addBudgetPolicy(created.id, op)
        appToast.success(t('guardrails.toast.createSuccess'))
        qc.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
        setDetailOpen(false)
        setIsCreating(false)
        trackEvent('guardrails:create', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
      } catch (err) {
        // 护栏已建、预算这步失败：保留护栏，转编辑「预算」Tab 让用户补，避免脏建
        appToast.requestError(err, '护栏已创建，但预算保存失败，请在编辑中补充预算')
        qc.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
        setIsCreating(false)
        setDetailId(created.id)
        trackEvent('guardrails:create', undefined, { result: 'success', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
      }
    },
    onError: (err: unknown) => {
      appToast.requestError(err, t('guardrails.toast.createError'))
      trackEvent('guardrails:create', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGuardrail(id),
    onSuccess: () => {
      appToast.success(t('guardrails.toast.deleteSuccess'))
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
      if (deleteTarget?.id === detailId) setDetailOpen(false)
      trackEvent('guardrails:delete', undefined, { result: 'success', is_space_owner: isActiveWorkspaceOwner })
    },
    onError: (err: unknown) => {
      appToast.requestError(err, t('guardrails.toast.deleteError'))
      trackEvent('guardrails:delete', undefined, { result: 'fail', error_code: errorCodeOf(err), is_space_owner: isActiveWorkspaceOwner })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      updateGuardrail(id, { status }),
    // 详情抽屉开关读 ['guardrail-detail'] 独立缓存——必须一并失活，否则抽屉内开关点了不动（需求方#149）
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
      qc.invalidateQueries({ queryKey: ['guardrail-detail', vars.id] })
    },
    onError: (err: unknown) =>
      appToast.requestError(err, t('guardrails.toast.toggleError')),
  })

  // 全局护栏单选级联（文档：同一空间同时最多 1 条启用中的全局护栏）：启用一条时
  // 其余启用中的全局护栏自动停用。乐观更新即时反馈，onSettled 失效刷新兜底。
  const cascadeGlobalMutation = useMutation({
    mutationFn: async ({ activateId, deactivateIds }: { activateId: string; deactivateIds: string[] }) => {
      // 先启用新的、再停用旧的：切换全程始终 ≥1 条启用，绕开后端「至少保留一条启用全局护栏」校验（需求方#162）。
      // 反序（先停后启）会在中间态出现 0 条启用而报错。
      await updateGuardrail(activateId, { status: 'active' })
      for (const id of deactivateIds) await updateGuardrail(id, { status: 'inactive' })
    },
    onMutate: async ({ activateId, deactivateIds }) => {
      await qc.cancelQueries({ queryKey: ['guardrails', workspaceId] })
      const prev = qc.getQueryData<GuardrailDetail[]>(['guardrails', workspaceId])
      qc.setQueryData<GuardrailDetail[]>(['guardrails', workspaceId], (old) =>
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
      if (ctx?.prev) qc.setQueryData(['guardrails', workspaceId], ctx.prev)
      appToast.requestError(err, t('guardrails.toast.toggleError'))
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['guardrails', workspaceId] })
      // 抽屉内切换的是 activateId 那条 → 失活其详情缓存，开关即时反映（需求方#149）
      qc.invalidateQueries({ queryKey: ['guardrail-detail', vars.activateId] })
    },
  })

  // 统一切换入口：启用任一「全局护栏」→ 走级联（自动停用其他启用中的全局护栏，保证全局单选）；其余走普通切换。
  // 之前只对 is_default 级联，非默认全局启用不级联 → 累积多条 active 全局 → #108 置灰失效 → 逐条停用时撞后端「至少保留一条」报错（需求方#162）。
  function handleToggle({ id, status }: { id: string; status: 'active' | 'inactive' }) {
    const row = guardrails.find((g) => g.id === id)
    // 4-way 审计发现启停开关是唯一零埋点的护栏动作（创建/编辑/删除均已上报），补齐 trackEvent
    trackEvent(
      'guardrails:toggle',
      { id, name: row?.name ?? '', scope: row ? deriveScope(row) : 'unknown', enabled: status === 'active' },
      { is_space_owner: isActiveWorkspaceOwner },
    )
    if (row && deriveScope(row) === 'global' && status === 'active') {
      const deactivateIds = guardrails
        .filter((g) => deriveScope(g) === 'global' && g.status === 'active' && g.id !== id)
        .map((g) => g.id)
      cascadeGlobalMutation.mutate({ activateId: id, deactivateIds })
    } else {
      toggleMutation.mutate({ id, status })
    }
  }

  // 该行是否正处于启停请求中（供 Switch 置灰即时反馈）：普通切换看 toggleMutation，
  // 全局级联切换（启用一条+连带停用多条）看 cascadeGlobalMutation 的目标 id 集合。
  function isRowToggling(id: string): boolean {
    if (toggleMutation.isPending && toggleMutation.variables?.id === id) return true
    if (cascadeGlobalMutation.isPending) {
      const vars = cascadeGlobalMutation.variables
      if (vars && (vars.activateId === id || vars.deactivateIds.includes(id))) return true
    }
    return false
  }

  // ── 辅助函数 ────────────────────────────────────────────────────────────
  // preferScope：从某个分区入口（如「个人护栏」区）创建时，默认选中该分区分类（需求方#202）。
  // 仅当该分类可建且可见时采纳；否则回退到「第一个有创建权限」的默认逻辑。
  function openCreate(preferScope?: GuardrailScope) {
    setIsCreating(true)
    setDetailId(null)
    // 默认分类：优先入口分区分类（可建+可见），否则落到第一个有创建权限的（全局→个人→Key；
    // 个人组织无「个人」），全无权限时兜 global（选项均置灰,提交也进不去）
    const scopeVisible = (s: GuardrailScope) => canCreateScope[s] && !(s === 'member' && !showMember)
    const defaultScope: GuardrailScope =
      (preferScope && scopeVisible(preferScope) ? preferScope : undefined) ??
      (['global', 'member', 'key'] as GuardrailScope[]).find(scopeVisible) ??
      'global'
    setName(''); setDescription(''); setScope(defaultScope); setKind('regular'); setBoostExpiresAt(''); setPriority(0)
    setModelBlacklist([]); setIpWhitelist([]); setPromptInjectionMode('off'); setMemberIds([]); setApiKeyIds([])
    // 预算字段也要清（否则会带上一次创建/编辑的残留值——个人/Key 单档 + 全局三档）
    setBudgetAmount(''); setBudgetPeriodUnit('month'); setBudgetLimited(true)
    setGlobalBudgets({
      guardrail_total: { ...EMPTY_BUDGET_DRAFT },
      per_member: { ...EMPTY_BUDGET_DRAFT },
      per_api_key: { ...EMPTY_BUDGET_DRAFT },
    })
    setDetailOpen(true)
  }

  function openDetail(id: string) {
    setIsCreating(false)
    setDetailId(id)
    // 防串档：清掉上一条护栏的表单残留。加载成功后 syncFormFromDetail 回填；
    // 加载失败时抽屉只显示错误，而不是上一条护栏的可保存表单 (qa#162 review)
    setName(''); setDescription(''); setScope('global'); setKind('regular'); setBoostExpiresAt(''); setPriority(0)
    setModelBlacklist([]); setIpWhitelist([]); setPromptInjectionMode('off'); setMemberIds([]); setApiKeyIds([])
    setBudgetAmount(''); setBudgetPeriodUnit('month'); setBudgetLimited(true)
    setGlobalBudgets({
      guardrail_total: { ...EMPTY_BUDGET_DRAFT },
      per_member: { ...EMPTY_BUDGET_DRAFT },
      per_api_key: { ...EMPTY_BUDGET_DRAFT },
    })
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
    // 提额档：有生效策略=限额，无策略=不限额；常规档恒为限额（必填）。
    setBudgetLimited(deriveKind(d) === 'boost' ? !!bp : true)
    fillGlobalBudgetsFromDetail(d)
    const meta = d.metadata ?? {}
    setModelBlacklist(Array.isArray(meta.model_blacklist) ? meta.model_blacklist : [])
    setIpWhitelist(Array.isArray(meta.ip_whitelist) ? meta.ip_whitelist : [])
    // 显式值直接回填；无值时 常规 Key 护栏=继承全局、其余=关闭
    setPromptInjectionMode(rawPromptInjectionMode(d) ?? (deriveScope(d) === 'key' ? PROMPT_INJECTION_INHERIT : 'off'))
    // Scope (members + api_keys) lives in assignments; metadata.* is the input
    // we materialize from. Read assignments first (the enforced truth), falling
    // back to metadata when assignments carry no matching entry.
    // 需求方#207：不能用 `?? metadata`——assignments 为 `[]`（后端未物化/未返回绑定）
    // 时 `??` 不触发回退，成员就丢了不回显。改判「派生结果为空才回退 metadata」。
    const memberFromAssignments = (d.assignments ?? [])
      .filter((a) => a.subject_type === 'member' && a.account_id)
      .map((a) => a.account_id as string)
    setMemberIds(
      memberFromAssignments.length > 0
        ? memberFromAssignments
        : (Array.isArray(meta.members) ? (meta.members as string[]) : [])
    )
    const apiKeyFromAssignments = (d.assignments ?? [])
      .filter((a) => a.subject_type === 'api_key' && a.api_key_id)
      .map((a) => a.api_key_id as string)
    setApiKeyIds(
      apiKeyFromAssignments.length > 0
        ? apiKeyFromAssignments
        : (Array.isArray(meta.api_keys) ? (meta.api_keys as string[]) : [])
    )
  }

  // 详情加载后一次性回填基本信息、作用范围和预算；详情页不再依赖 Tab 切换触发回填。
  useEffect(() => {
    if (!isCreating && detailOpen && detail) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the editor after the detail request resolves
      syncFormFromDetail(detail)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync helper intentionally runs only when detail identity changes
  }, [detail, detailOpen, isCreating])

  // 护栏本身 payload（名称 + 提示词注入 + metadata 承载分类/成员/Key/模型/IP/提额到期）。
  // 分类/类型经 metadata 占位往返（后端 #378 未交付 scope/kind 显式字段前）：
  // is_default 承载全局分类，kind='boost' 标记提额，effective_to 记提额到期（需求方#151）。
  function buildGuardrailPayload(): CreateGuardrailRequest {
    const metadata: Record<string, unknown> = {
      scope,
      members: scope === 'member' ? memberIds : [],
      api_keys: scope === 'key' ? apiKeyIds : [],
    }
    // 文档：个人护栏、提额护栏不配置模型黑名单 / IP 白名单 → 隐藏且清空落库
    metadata.model_blacklist = showModelIp ? modelBlacklist : []
    metadata.ip_whitelist = showModelIp ? ipWhitelist : []
    if (scope !== 'global') metadata.kind = kind
    if (kind === 'boost') metadata.effective_to = localInputToIso(boostExpiresAt)
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      is_default: isDefault,
      priority,
      ...(showPromptInjection && normalizedPromptInjection !== PROMPT_INJECTION_INHERIT
        ? { prompt_injection_mode: normalizedPromptInjection }
        : {}),
      metadata,
    }
  }

  // 全局护栏三档预算 → 增/改/删 ops（对齐 PRD：清「不限额」= 删该档策略）。返回 error 即校验未过。
  function buildGlobalBudgetOps(d: GuardrailDetail): { ops: GlobalBudgetOp[] } | { error: string } {
    const scopes = GLOBAL_BUDGET_SCOPES.filter((s) => s !== 'per_member' || showMember)
    const ops: GlobalBudgetOp[] = []
    for (const aggScope of scopes) {
      const draft = globalBudgets[aggScope]
      const existing = budgetByScope(d, aggScope)
      if (draft.limited) {
        const amount = draft.amount.trim()
        if (!isValidBudgetAmount(amount)) {
          return { error: '预算金额无效：请输入大于 0 的数字，整数最多 12 位，小数最多 2 位' }
        }
        // 跨护栏比对（下调全局默认不得低于常规护栏折算额等）由后端权威校验
        // （permissions assertBudgetComparisonRules），失败时 toast 透传后端提示；
        // 前端不再本地复刻（曾因漏过滤停用护栏产生误拦，见 fix/guardrail-budget-validation）。
        if (existing) {
          const amountChanged = amount !== trimAmountScale(existing.spend_limit_amount)
          const periodChanged = draft.period !== existing.period_unit
          if (amountChanged || periodChanged) {
            const body: UpdateBudgetPolicyRequest = {
              aggregation_scope: existing.aggregation_scope,
              period_length: existing.period_length,
            }
            if (amountChanged) body.spend_limit_amount = amount
            // 周期变更时同步 period_length（「每 5 小时」= hour+5，其余 1；#11）
            if (periodChanged) { body.period_unit = draft.period; body.period_length = guardrailBudgetPeriodLength(draft.period) }
            ops.push({ type: 'update', policyId: existing.id, body })
          }
        } else {
          ops.push({
            type: 'add',
            body: {
              aggregation_scope: aggScope,
              period_unit: draft.period,
              period_length: guardrailBudgetPeriodLength(draft.period),
              enforcement_mode: 'hard_limit',
              spend_limit_amount: amount,
              enabled: true,
            },
          })
        }
      } else if (existing) {
        // 清空该档（不限额）→ 删除其生效策略
        ops.push({ type: 'delete', policyId: existing.id })
      }
    }
    return { ops }
  }

  // 个人/Key 护栏单档预算 → 增/改/删 op。常规档预算必填；提额档支持不限额（对齐 PRD GuardrailBudgetControl）。
  // 提额不限额：删除既有生效策略（若有），不新增、不跑「>当前生效预算」校验。返回 error 即校验未过。
  function buildMemberKeyBudgetOps(d: GuardrailDetail): { ops: GlobalBudgetOp[] } | { error: string } {
    const dKind = deriveKind(d)
    if (dKind === 'boost' && !budgetLimited) {
      return { ops: budget ? [{ type: 'delete', policyId: budget.id }] : [] }
    }
    const amount = budgetAmount.trim()
    if (!isValidBudgetAmount(amount)) {
      return { error: '预算金额无效：请输入大于 0 的数字，整数最多 12 位，小数最多 2 位' }
    }
    // 「常规 ≤ 全局默认」「提额 > 被替代生效预算」由后端权威校验（含月度折算与
    // 启停状态过滤），失败时 toast 透传后端提示；前端不再本地复刻。
    if (budget) {
      // qa#164：原地维护同一条策略，只发真正变更的字段（避免计费窗口重锚）
      const body: UpdateBudgetPolicyRequest = {}
      if (amount !== trimAmountScale(budget.spend_limit_amount)) body.spend_limit_amount = amount
      // 周期变更时同步 period_length（「每 5 小时」= hour+5，其余 1；#11）
      if (budgetPeriodUnit !== budget.period_unit) { body.period_unit = budgetPeriodUnit; body.period_length = guardrailBudgetPeriodLength(budgetPeriodUnit) }
      if (Object.keys(body).length === 0) return { ops: [] }
      return { ops: [{ type: 'update', policyId: budget.id, body }] }
    }
    return {
      ops: [{
        type: 'add',
        body: {
          aggregation_scope: 'guardrail_total',
          period_unit: budgetPeriodUnit,
          period_length: guardrailBudgetPeriodLength(budgetPeriodUnit),
          enforcement_mode: 'hard_limit',
          spend_limit_amount: amount,
          enabled: true,
        },
      }],
    }
  }

  function handleSubmit() {
    // 编辑态走单保存编排（护栏 PATCH + 预算增改删一次性）
    if (!isCreating) { handleSaveGuardrail(); return }
    if (!name.trim()) { appToast.error(t('guardrails.toast.nameRequired')); return }
    // 需求方#498：创建个人/Key 护栏必须绑定至少一个对象，否则后端返 40001。
    if (scope === 'member' && memberIds.length === 0) { appToast.error('请至少绑定一个成员'); return }
    if (scope === 'key' && apiKeyIds.length === 0) { appToast.error('请至少绑定一个 API Key'); return }
    // 预算必填（对齐 PRD）：个人/Key 常规护栏预算必填（无「不限额」）；提额「限额」档必填、「不限额」档可空。
    if (scope === 'member' || scope === 'key') {
      const amt = budgetAmount.trim()
      const budgetRequired = kind === 'regular' || budgetLimited
      if (budgetRequired && !amt) { appToast.error(kind === 'boost' ? '请填写提额预算' : '请填写预算'); return }
      if (budgetRequired && amt && !isValidBudgetAmount(amt)) { appToast.error('预算金额无效：大于 0，整数最多 12 位，小数最多 2 位'); return }
    }
    // 提额必须设置到期时间（文档§校验规则）
    if (kind === 'boost') {
      if (!boostExpiresAt || !localInputToIso(boostExpiresAt)) {
        appToast.error('提额护栏必须设置到期时间')
        return
      }
    }
    // 需求方#190 + #239「常规 ≤ 全局默认」由后端在预算策略写入时权威校验；创建流程
    // 预算这步失败会走「护栏已创建，但预算保存失败」引导补填，后端错误提示原样透传。
    trackEvent('guardrails:create', undefined, { is_space_owner: isActiveWorkspaceOwner })
    createMutation.mutate(buildGuardrailPayload())
  }

  // 编辑态单保存（对齐 PRD 单一「保存护栏」）：护栏 PATCH + 预算增改删串行编排。
  function handleSaveGuardrail() {
    if (!detail || !detailId) return
    if (budgetConflict) {
      appToast.error('预算配置数据错误：存在多条生效中的预算策略，请联系管理员处理')
      return
    }
    if (!name.trim()) { appToast.error(t('guardrails.toast.nameRequired')); return }
    const dScope = deriveScope(detail)
    // 绑定必填（编辑态绑定可改，不能清空到 0）
    if (canEditAssignment) {
      if (dScope === 'member' && memberIds.length === 0) { appToast.error('请至少绑定一个成员'); return }
      if (dScope === 'key' && apiKeyIds.length === 0) { appToast.error('请至少绑定一个 API Key'); return }
    }
    // 提额到期时间必填
    if (canEdit && deriveKind(detail) === 'boost' && (!boostExpiresAt || !localInputToIso(boostExpiresAt))) {
      appToast.error('提额护栏必须设置到期时间')
      return
    }
    // 预算 ops（仅当有预算编辑权限时计算/下发；否则不触碰预算）
    let ops: GlobalBudgetOp[] = []
    if (canEditBudget) {
      const result = isGlobal ? buildGlobalBudgetOps(detail) : buildMemberKeyBudgetOps(detail)
      if ('error' in result) { appToast.error(result.error); return }
      ops = result.ops
    }
    const payload = (canEdit || canEditAssignment) ? buildGuardrailPayload() : undefined
    if (!payload && ops.length === 0) { appToast.info('未发生变化'); return }
    trackEvent('guardrails:edit', undefined, { is_space_owner: isActiveWorkspaceOwner })
    if (canEditBudget && ops.length > 0) trackAction(PERMS.GUARDRAILS_BUDGET_EDIT, undefined, { is_space_owner: isActiveWorkspaceOwner })
    saveGuardrailMutation.mutate({ id: detailId, payload, ops })
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
  // 编辑态基本信息写权限（按当前护栏派生分类取细粒度码 × 逐行归属；创建态 detail 为空恒 true，
  // 由 GuardrailFormFields 的 isCreating 分支放行）。非本人且非管理者 → 抽屉整体只读、无保存按钮。
  const canManageDetail = detail ? canManageRow(detail) : true
  const canEdit = detail ? canEditScope[deriveScope(detail)] && canManageDetail : false

  function handleScopeSearchChange(s: GuardrailScope, value: string) {
    setScopeSearch((prev) => ({ ...prev, [s]: value }))
  }

  // 分区列表「删除」入口：标记目标并透出「是否启用中全局」供二次提醒。
  function handleSectionsDelete(target: { id: string; name: string }) {
    const row = guardrails.find((g) => g.id === target.id)
    setDeleteTarget({ ...target, isActiveGlobal: !!row?.is_default && row?.status === 'active' })
  }

  function confirmDelete() {
    if (deleteTarget) {
      trackEvent('guardrails:delete', undefined, { is_space_owner: isActiveWorkspaceOwner })
      deleteMutation.mutate(deleteTarget.id)
    }
  }

  return {
    // ── 页面级 ──────────────────────────────────────────────────────────────
    workspaceId,
    forbidden,
    canCreate,
    showMember,
    isLoading,
    summary: summarize(guardrails),
    openCreate,
    // ── 三分区列表（GuardrailSections） ────────────────────────────────────
    sections: {
      guardrails,
      isLoading,
      canEdit: canEditScope,
      canDelete: canDeleteScope,
      canCreate: canCreateScope,
      canManageRow,
      showMember,
      currencySymbol,
      search: scopeSearch,
      onSearchChange: handleScopeSearchChange,
      onOpenDetail: openDetail,
      onToggle: handleToggle,
      isRowToggling,
      onDelete: handleSectionsDelete,
      onCreate: openCreate,
    },
    // ── 统一配置抽屉（GuardrailDetailSheet） ────────────────────────────────
    sheet: {
      open: detailOpen,
      onClose: () => setDetailOpen(false),
      isCreating,
      detail,
      detailLoading,
      detailLoadError,
      detailRow,
      name, onNameChange: setName,
      description, onDescriptionChange: setDescription,
      scope, onScopeChange: handleScopeChange,
      kind, onKindChange: setKind,
      lockScopeKind: !isCreating,
      showMemberScope: showMember,
      canCreateScope, canCreateBoost,
      boostExpiresAt, onBoostExpiresAtChange: setBoostExpiresAt,
      showModelIp,
      modelBlacklist, onModelBlacklistChange: setModelBlacklist,
      ipWhitelist, onIpWhitelistChange: setIpWhitelist,
      promptInjectionMode: normalizedPromptInjection, onPromptInjectionModeChange: setPromptInjectionMode,
      showPromptInjection, allowPromptInjectionInherit,
      modelSuggestions,
      memberIds, onMemberIdsChange: setMemberIds, memberOptions,
      apiKeyIds, onApiKeyIdsChange: setApiKeyIds, apiKeyOptions,
      budgetConflict,
      budgetAmount, onBudgetAmountChange: setBudgetAmount,
      budgetPeriodUnit, onBudgetPeriodUnitChange: setBudgetPeriodUnit,
      budgetLimited, onBudgetLimitedChange: setBudgetLimited,
      canEditBudget: canEditBudget && canManageDetail,
      showMember,
      globalBudgets, onGlobalBudgetChange: handleGlobalBudgetChange,
      auditRows,
      auditLoading: auditQuery.isLoading,
      canEdit,
      canEditAssignment: canEditAssignment && canManageDetail,
      submitting: createMutation.isPending || saveGuardrailMutation.isPending,
      onSubmit: handleSubmit,
    },
    // ── 删除确认 Modal（GuardrailConfirmModals） ────────────────────────────
    confirmModals: {
      deleteTarget,
      onCloseDelete: () => setDeleteTarget(null),
      deleting: deleteMutation.isPending,
      onConfirmDelete: confirmDelete,
    },
  }
}
