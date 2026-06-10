import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
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
  deleteBudgetPolicy,
} from '@/services/guardrails'
import { listWorkspaceMembers } from '@/services/workspaces'
import { listApiKeys } from '@/services/api-keys'
import type {
  GuardrailDetail,
  CreateGuardrailRequest,
  UpdateGuardrailRequest,
  AddBudgetPolicyRequest,
} from '@/interfaces/guardrails'
import { useCurrency } from '@/hooks/use-platform-config'
import { pageItems } from '@/lib/utils'
import { GuardrailTable } from './components/GuardrailTable'
import { GuardrailDetailSheet } from './components/GuardrailDetailSheet'
import { GuardrailConfirmModals } from './components/GuardrailConfirmModals'

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
  const { data: guardrails = [], isLoading } = useQuery({
    queryKey: ['guardrails', activeWorkspaceId],
    queryFn: async () => {
      const res = await listGuardrails(activeWorkspaceId!)
      return res.items ?? []
    },
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

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
  const modelSuggestions = (modelsQuery.data as any)?.items?.map((m: any) => m.model_id as string) ?? []
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
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['guardrail-detail', detailId],
    queryFn: () => getGuardrail(detailId!),
    enabled: !!detailId && detailOpen,
    staleTime: 0,
  })

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
    // pageItems normalizes the api-keys endpoint, which returns a bare array
    // (not a {items} CursorPage) — reading .data.items left the binding
    // dropdown empty so no API key could be selected.
    queryFn: () => listApiKeys(activeWorkspaceId!).then(pageItems),
    enabled: !!activeWorkspaceId && detailOpen,
    staleTime: 60_000,
  })

  // ── 突变 ────────────────────────────────────────────────────────────────
  const setBudgetMutation = useMutation({
    mutationFn: async ({ id, body, oldPolicyId }: { id: string; body: AddBudgetPolicyRequest; oldPolicyId?: string }) => {
      if (oldPolicyId) await deleteBudgetPolicy(id, oldPolicyId)
      return addBudgetPolicy(id, body)
    },
    onSuccess: () => {
      appToast.success('预算已保存')

      qc.invalidateQueries({ queryKey: ['guardrail-detail', detailId] })
    },
    onError: (err: unknown) =>
      appToast.error(err instanceof Error ? err.message : '保存失败'),
  })

  const removeBudgetMutation = useMutation({
    mutationFn: ({ guardrailId, policyId }: { guardrailId: string; policyId: string }) =>
      deleteBudgetPolicy(guardrailId, policyId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guardrail-detail', detailId] })
    },
    onError: (err: unknown) =>
      appToast.error(err instanceof Error ? err.message : '删除失败'),
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
      appToast.error(err instanceof Error ? err.message : t('guardrails.toast.createError')),
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
      appToast.error(err instanceof Error ? err.message : t('guardrails.toast.updateError')),
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
      appToast.error(err instanceof Error ? err.message : t('guardrails.toast.deleteError')),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
      updateGuardrail(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] }),
    onError: (err: unknown) =>
      appToast.error(err instanceof Error ? err.message : t('guardrails.toast.toggleError')),
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
    setSheetTab('info')
    setDetailOpen(true)
  }

  function syncFormFromDetail(d: GuardrailDetail) {
    setName(d.name); setDescription(d.description ?? '')
    setIsDefault(d.is_default); setPriority(d.priority)
    const meta = (d as any).metadata ?? {}
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
    if (!budgetAmount || !detail) return
    const oldPolicyId = detail.budget_policies?.[0]?.id
    setBudgetMutation.mutate({
      id: detail.id,
      oldPolicyId,
      body: {
        aggregation_scope: 'guardrail_total',
        period_unit: budgetPeriodUnit,
        period_length: 1,
        enforcement_mode: 'hard_limit',
        spend_limit_amount: budgetAmount,
        enabled: true,
      },
    })
  }

  // ── 派生数据 ────────────────────────────────────────────────────────────
  const budget = detail?.budget_policies?.[0] ?? null

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
  const apiKeyOptions = (apiKeysQuery.data ?? []).map((k: any) => ({
    id: k.api_key_id as string,
    name: (k.name as string) || (k.api_key_id as string),
    active: k.status === 'active',
  }))

  const detailRow = guardrails.find(g => g.id === detailId)

  // ── JSX ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">{t('guardrails.title')}</h1>
          <p className="text-sm text-mg-text-1 mt-1.5 font-medium">{t('guardrails.desc')}</p>
        </div>
        {canCreate && (
          <Button
            variant="brand"
            onClick={openCreate}
            className="rounded-full px-5 h-10 shadow-lg shadow-brand-glow/20"
          >
            <LuPlus className="w-4 h-4 mr-1.5" />
            {t('guardrails.create')}
          </Button>
        )}
      </div>

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
          if (detail && budget) {
            removeBudgetMutation.mutate({ guardrailId: detail.id, policyId: budget.id })
            setShowClearBudget(false)
          }
        }}
      />
    </div>
  )
}
