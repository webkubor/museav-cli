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
import { GuardrailTable } from './components/GuardrailTable'
import { GuardrailDetailSheet } from './components/GuardrailDetailSheet'
import { GuardrailConfirmModals } from './components/GuardrailConfirmModals'
import { isValidBudgetAmount, trimAmountScale } from './budget'

type BudgetPolicy = NonNullable<GuardrailDetail['budget_policies']>[number]

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
  const { symbol: currencySymbol } = useCurrency()
  const { hasPermission } = usePermissions()
  const canCreate         = hasPermission(PERMS.GUARDRAILS_CREATE)
  const canEdit           = hasPermission(PERMS.GUARDRAILS_EDIT)
  const canDelete         = hasPermission(PERMS.GUARDRAILS_DELETE)
  const canEditBudget     = hasPermission(PERMS.GUARDRAILS_BUDGET_EDIT)

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
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [priority, setPriority] = useState<number>(0)
  const [modelBlacklist, setModelBlacklist] = useState<string[]>([])
  const [ipWhitelist, setIpWhitelist] = useState<string[]>([])
  const [memberIds, setMemberIds] = useState<string[]>([])

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

  // ── API Key 作用范围本地状态（account_id 风格，与成员一致） ─────────────
  const [apiKeyIds, setApiKeyIds] = useState<string[]>([])

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

  // ── 辅助函数 ────────────────────────────────────────────────────────────
  function openCreate() {
    setIsCreating(true)
    setDetailId(null)
    setName(''); setDescription(''); setIsDefault(false); setPriority(0)
    setModelBlacklist([]); setIpWhitelist([]); setMemberIds([])
    setSheetTab('info')
    setDetailOpen(true)
  }

  function openDetail(id: string) {
    setIsCreating(false)
    setDetailId(id)
    // 防串档：清掉上一条护栏的表单残留。加载成功后 syncFormFromDetail 回填；
    // 加载失败时抽屉只显示错误，而不是上一条护栏的可保存表单 (qa#162 review)
    setName(''); setDescription(''); setIsDefault(false); setPriority(0)
    setModelBlacklist([]); setIpWhitelist([]); setMemberIds([]); setApiKeyIds([])
    setBudgetAmount(''); setBudgetPeriodUnit('month')
    setSheetTab('info')
    setDetailOpen(true)
  }

  function syncFormFromDetail(d: GuardrailDetail) {
    setName(d.name); setDescription(d.description ?? '')
    setIsDefault(d.is_default); setPriority(d.priority)
    // 预算 input 回填落库的规范金额（去掉 NUMERIC(24,12) 的 scale 尾零），
    // 保证回显值与保存值一致 (qa#156)
    const bp = currentBudgetPolicy(d)
    setBudgetAmount(bp ? trimAmountScale(bp.spend_limit_amount) : '')
    setBudgetPeriodUnit(bp?.period_unit ?? 'month')
    const meta = d.metadata ?? {}
    setModelBlacklist(Array.isArray(meta.model_blacklist) ? meta.model_blacklist : [])
    setIpWhitelist(Array.isArray(meta.ip_whitelist) ? meta.ip_whitelist : [])
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
    // ONE save for the whole drawer: rules (model_blacklist/ip_whitelist) round-
    // trip via metadata; scope (members + api_keys) is materialized into
    // assignments server-side. Always send all arrays (even empty) so empty =
    // clear. api_keys is only editable in edit mode (scope tab); on create it
    // stays whatever was selected (none).
    const metadata: Record<string, unknown> = {
      model_blacklist: modelBlacklist,
      ip_whitelist: ipWhitelist,
      members: memberIds,
      api_keys: apiKeyIds,
    }
    const payload: CreateGuardrailRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      is_default: isDefault,
      priority,
      metadata,
    }
    if (!isCreating && detailId) {
      updateMutation.mutate({ id: detailId, payload })
    } else {
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

  // ── 派生数据 ────────────────────────────────────────────────────────────
  const budget = currentBudgetPolicy(detail)
  const budgetConflict = activeBudgetPolicies(detail).length > 1

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

      {/* 列表 */}
      <GuardrailTable
        guardrails={guardrails}
        isLoading={isLoading}
        canEdit={canEdit}
        canDelete={canDelete}
        onOpenDetail={openDetail}
        onToggle={(args) => toggleMutation.mutate(args)}
        onDelete={(target) => setDeleteTarget(target)}
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
        onToggleStatus={(args) => toggleMutation.mutate(args)}
        syncFormFromDetail={syncFormFromDetail}
        name={name} onNameChange={setName}
        description={description} onDescriptionChange={setDescription}
        priority={priority} onPriorityChange={setPriority}
        isDefault={isDefault} onIsDefaultChange={setIsDefault}
        modelBlacklist={modelBlacklist} onModelBlacklistChange={setModelBlacklist}
        ipWhitelist={ipWhitelist} onIpWhitelistChange={setIpWhitelist}
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
        currencySymbol={currencySymbol}
        submitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={handleSubmit}
      />

      {/* 删除 + 清除预算确认 Modal */}
      <GuardrailConfirmModals
        deleteTarget={deleteTarget}
        onCloseDelete={() => setDeleteTarget(null)}
        deleting={deleteMutation.isPending}
        onConfirmDelete={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id) }}
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
