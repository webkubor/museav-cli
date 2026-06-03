import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import { SideSheet } from '@/components/ui/SideSheet'
import { Select, SelectItem } from '@/components/ui/Select'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/Table'
import { LuPlus, LuSettings, LuUsers, LuKey, LuDollarSign } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { TagInput } from '@/components/ui/TagInput'
import { listModels } from '@/services/catalog'
import { appToast } from '@/lib/app-toast'
import {
  createGuardrail,
  deleteGuardrail,
  listGuardrails,
  updateGuardrail,
  getGuardrail,
  replaceAssignments,
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
  AssignmentInput,
} from '@/interfaces/guardrails'
import { PERIOD_LABEL } from '@/constants/status'
import { useCurrency } from '@/hooks/use-platform-config'
import { formatDateTime } from '@/lib/format-date'

function guardrailMetadataList(row: GuardrailDetail, key: 'model_blacklist' | 'ip_whitelist') {
  const value = row.metadata?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function boundApiKeyCount(row: GuardrailDetail) {
  return row.assignments.filter((item) => item.subject_type === 'api_key' && item.api_key_id).length
}

function LimitCell({ values, emptyLabel }: { values: string[]; emptyLabel: string }) {
  if (values.length === 0) {
    return <span className="text-xs text-mg-text-2">{emptyLabel}</span>
  }

  return (
    <div className="flex max-w-[280px] flex-wrap gap-1.5">
      {values.slice(0, 3).map((value) => (
        <span
          key={value}
          className="rounded-full border border-mg-border bg-mg-fill-0 px-2 py-0.5 font-mono text-[11px] font-semibold text-mg-text-1"
        >
          {value}
        </span>
      ))}
      {values.length > 3 && (
        <span className="rounded-full bg-mg-fill-1 px-2 py-0.5 text-[11px] font-bold text-mg-text-2">
          +{values.length - 3}
        </span>
      )}
    </div>
  )
}

export default function GuardrailsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { symbol: currencySymbol } = useCurrency()

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
    queryKey: ['catalog-models-all'],
    queryFn: () => listModels({ limit: 200 }),
    staleTime: 120_000,
  })
  const modelSuggestions = (modelsQuery.data as any)?.items?.map((m: any) => m.model_id as string) ?? []
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [sheetTab, setSheetTab] = useState<'info' | 'scope' | 'budget'>('info')
  const [isCreating, setIsCreating] = useState(false)

  // ── 添加成员/APIKey 弹窗 ────────────────────────────────────────────────

  // ── 预算内联编辑状态 ────────────────────────────────────────────────────
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetPeriodUnit, setBudgetPeriodUnit] = useState<'hour' | 'day' | 'week' | 'month'>('month')

  // ── 详情查询 ────────────────────────────────────────────────────────────
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['guardrail-detail', detailId],
    queryFn: () => getGuardrail(detailId!),
    enabled: !!detailId && detailOpen,
    staleTime: 0,
  })

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
  const assignMutation = useMutation({
    mutationFn: ({ id, assignments }: { id: string; assignments: AssignmentInput[] }) =>
      replaceAssignments(id, assignments),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guardrail-detail', detailId] })
      qc.invalidateQueries({ queryKey: ['guardrails', activeWorkspaceId] })
    },
    onError: (err: unknown) =>
      appToast.error(err instanceof Error ? err.message : '操作失败'),
  })

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
    setMemberIds(
      Array.isArray(meta.members)
        ? (meta.members as string[])
        : (d.assignments?.filter(a => a.subject_type === 'member').map(a => a.account_id) ?? [])
    )
  }

  function handleSubmit() {
    if (!name.trim()) { appToast.error(t('guardrails.toast.nameRequired')); return }
    const metadata: Record<string, unknown> = {}
    if (modelBlacklist.length > 0) metadata.model_blacklist = modelBlacklist
    if (ipWhitelist.length > 0) metadata.ip_whitelist = ipWhitelist
    if (memberIds.length > 0) metadata.members = memberIds
    const payload: CreateGuardrailRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      is_default: isDefault,
      priority,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
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
  const apiKeyAssignments = detail?.assignments.filter(a => a.subject_type === 'api_key') ?? []
  const budget = detail?.budget_policies?.[0] ?? null

  const memberOptions = (membersQuery.data?.items ?? []).map(m => ({
    id: m.account.account_id,
    name: m.account.display_name || m.account.email || m.account.account_id,
  }))
  const apiKeysMap = new Map((apiKeysQuery.data?.items ?? []).map(k => [k.api_key_id, k]))

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
        <Button
          variant="brand"
          onClick={openCreate}
          className="rounded-full px-5 h-10 shadow-lg shadow-brand-glow/20"
        >
          <LuPlus className="w-4 h-4 mr-1.5" />
          {t('guardrails.create')}
        </Button>
      </div>

      {/* 列表 */}
      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden">
        {isLoading ? (
          <div className="p-10 space-y-4 animate-pulse">
            <div className="h-6 bg-mg-fill-0 rounded w-1/4" />
            <div className="h-4 bg-mg-fill-0 rounded w-full" />
          </div>
        ) : guardrails.length === 0 ? (
          <div className="py-20 text-center text-xs italic text-mg-text-2">{t('guardrails.empty')}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('guardrails.table.name')}</TableHead>
                <TableHead>{t('guardrails.table.modelBlacklist')}</TableHead>
                <TableHead>{t('guardrails.table.ipWhitelist')}</TableHead>
                <TableHead>{t('guardrails.table.boundKeys')}</TableHead>
                <TableHead>{t('guardrails.table.status')}</TableHead>
                <TableHead>{t('guardrails.table.createdAt')}</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guardrails.map((row) => {
                const modelBlacklistValues = guardrailMetadataList(row, 'model_blacklist')
                const ipWhitelistValues = guardrailMetadataList(row, 'ip_whitelist')
                const apiKeyCount = boundApiKeyCount(row)

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openDetail(row.id)}
                        className="group flex max-w-[260px] items-center gap-2 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-bold text-mg-text-0 group-hover:text-brand-base">
                            {row.name}
                          </span>
                          {row.description && (
                            <span className="mt-0.5 block truncate text-[11px] font-medium text-mg-text-2">
                              {row.description}
                            </span>
                          )}
                        </span>
                        {row.is_default && (
                          <Badge variant="success" className="shrink-0">
                            {t('guardrails.table.defaultBadge')}
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell>
                      <LimitCell values={modelBlacklistValues} emptyLabel={t('guardrails.table.unlimited')} />
                    </TableCell>
                    <TableCell>
                      <LimitCell values={ipWhitelistValues} emptyLabel={t('guardrails.table.unlimited')} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={apiKeyCount > 0 ? 'info' : 'outline'}>
                        {apiKeyCount} {t('guardrails.table.keyUnit')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={row.status === 'active'}
                        onChange={(checked) =>
                          toggleMutation.mutate({ id: row.id, status: checked ? 'active' : 'inactive' })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-2">{formatDateTime(row.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openDetail(row.id)} className="h-7 text-xs font-semibold">
                          <LuSettings className="w-3.5 h-3.5 mr-1" />
                          {t('guardrails.table.configure')}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget({ id: row.id, name: row.name })} className="h-7 text-xs">
                          {t('guardrails.table.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 详情 SideSheet */}
      {/* 统一配置抽屉（新建 + 编辑 + 详情） */}
      <SideSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={isCreating ? t('guardrails.modal.createTitle') : (detailRow?.name ?? t('guardrails.modal.editTitle'))}
        width={600}
      >
        {/* 状态切换 */}
        {!isCreating && detail && (
          <div className="flex items-center justify-between px-6 py-3 border-b border-mg-border/50">
            <span className="text-xs text-mg-text-2">
              {detail.status === 'active' ? '已启用' : '已停用'}
            </span>
            <Switch
              checked={detail.status === 'active'}
              onChange={(checked) => toggleMutation.mutate({ id: detail.id, status: checked ? 'active' : 'inactive' })}
            />
          </div>
        )}

        {/* Tab 导航 */}
        {!isCreating && (
          <div className="flex border-b border-mg-border px-6 pt-1">
            {([
              { key: 'info', label: '基本信息' },
              { key: 'scope', label: '作用范围' },
              { key: 'budget', label: '预算' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setSheetTab(tab.key)
                  if (tab.key === 'info' && detail) syncFormFromDetail(detail)
                  if (tab.key === 'budget' && detail) {
                    const bp = detail.budget_policies?.[0]
                    setBudgetAmount(bp?.spend_limit_amount ?? '')
                    setBudgetPeriodUnit((bp?.period_unit as typeof budgetPeriodUnit) ?? 'month')
                  }
                }}
                className={`px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-px cursor-pointer ${
                  sheetTab === tab.key
                    ? 'border-brand-base text-brand-base'
                    : 'border-transparent text-mg-text-2 hover:text-mg-text-0'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1">
          {/* ── Tab: 基本信息（创建/编辑共用） ── */}
          {(isCreating || sheetTab === 'info') && (
            <div>
              <GuardrailFormFields
                name={name} onNameChange={setName}
                description={description} onDescriptionChange={setDescription}
                priority={priority} onPriorityChange={setPriority}
                isDefault={isDefault} onIsDefaultChange={setIsDefault}
                modelBlacklist={modelBlacklist} onModelBlacklistChange={setModelBlacklist}
                ipWhitelist={ipWhitelist} onIpWhitelistChange={setIpWhitelist}
                modelSuggestions={modelSuggestions}
                memberIds={memberIds} onMemberIdsChange={setMemberIds} memberOptions={memberOptions}
              />
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-mg-border/50">
                <Button variant="outline" onClick={() => setDetailOpen(false)}>{t('common.cancel')}</Button>
                <Button
                  variant="brand"
                  loading={createMutation.isPending || updateMutation.isPending}
                  onClick={handleSubmit}
                >
                  {isCreating ? t('guardrails.modal.confirmCreate') : t('guardrails.modal.saveEdit')}
                </Button>
              </div>
            </div>
          )}

          {/* ── Tab: 作用范围（成员 + API Key） ── */}
          {!isCreating && sheetTab === 'scope' && (
            detailLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-5 bg-mg-fill-0 rounded w-1/2" />
                <div className="h-4 bg-mg-fill-0 rounded w-full" />
              </div>
            ) : detail ? (
              <div className="space-y-7">
                {/* API Keys — 下拉多选 */}
                <section>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-1 uppercase tracking-wider mb-3">
                    <LuKey className="w-3.5 h-3.5" /> API Keys
                  </div>
                  <TagInput
                    value={apiKeyAssignments.map((a) => {
                      const key = apiKeysMap.get(a.api_key_id)
                      return key?.name || a.api_key_id
                    })}
                    onChange={(names) => {
                      if (!detail) return
                      const nameToId = new Map<string, string>()
                      for (const k of apiKeysQuery.data?.items ?? []) {
                        nameToId.set(k.name, k.api_key_id)
                        nameToId.set(k.api_key_id, k.api_key_id)
                      }
                      for (const a of detail.assignments) {
                        if (a.subject_type === 'api_key') {
                          const key = apiKeysMap.get(a.api_key_id)
                          if (key) nameToId.set(key.name, a.api_key_id)
                        }
                      }
                      const keyIds = names.map((n) => nameToId.get(n)).filter(Boolean) as string[]
                      const keyAssigns: AssignmentInput[] = keyIds.map((id) => ({ subject_type: 'api_key', api_key_id: id }))
                      assignMutation.mutate({ id: detail.id, assignments: keyAssigns })
                    }}
                    suggestions={(apiKeysQuery.data?.items ?? [])
                      .filter((k: any) => k.status === 'active' && !apiKeyAssignments.some((a) => a.api_key_id === k.api_key_id))
                      .map((k: any) => k.name as string)
                    }
                    placeholder="从下拉选择 API Key"
                  />
                </section>
              </div>
            ) : null
          )}

          {/* ── Tab: 预算 ── */}
          {!isCreating && sheetTab === 'budget' && (
            detailLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-5 bg-mg-fill-0 rounded w-1/3" />
              </div>
            ) : detail ? (
              <section className="space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-1 uppercase tracking-wider">
                  <LuDollarSign className="w-3.5 h-3.5" /> 预算策略
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="输入限额金额"
                    className="h-9 text-xs flex-1"
                  />
                  <Select value={budgetPeriodUnit} onChange={(v) => setBudgetPeriodUnit(v as typeof budgetPeriodUnit)} className="h-9 text-xs w-28">
                    {(Object.entries(PERIOD_LABEL) as [typeof budgetPeriodUnit, string][]).map(([k, label]) => (
                      <SelectItem key={k} value={k}>每{label}</SelectItem>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    variant="brand"
                    className="h-9 px-5 text-xs font-semibold"
                    loading={setBudgetMutation.isPending}
                    onClick={handleSaveBudget}
                  >
                    保存预算
                  </Button>
                  {budget && (
                    <button
                      onClick={() => removeBudgetMutation.mutate({ guardrailId: detail.id, policyId: budget.id })}
                      className="text-[11px] text-mg-text-2 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      清除预算
                    </button>
                  )}
                </div>
                {budget && (
                  <div className="p-3 rounded-lg border border-mg-border bg-mg-fill-0/50 text-xs text-mg-text-1">
                    当前生效：<span className="font-semibold text-brand-base">{currencySymbol}{parseFloat(budget.spend_limit_amount).toLocaleString()} / {PERIOD_LABEL[budget.period_unit]}</span>
                  </div>
                )}
              </section>
            ) : null
          )}
        </div>
      </SideSheet>

      {/* 删除确认 Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('guardrails.deleteModal.title')}
        description={t('guardrails.deleteModal.description', { name: deleteTarget?.name })}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>{t('guardrails.deleteModal.cancel')}</Button>
            <Button variant="destructive" loading={deleteMutation.isPending} onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id) }}>
              {t('guardrails.deleteModal.confirm')}
            </Button>
          </>
        }
      />
    </div>
  )
}

// ─── 公共：表单字段组件（创建/编辑复用） ──────────────────────────────────────

function GuardrailFormFields({
  name, onNameChange,
  description, onDescriptionChange,
  priority, onPriorityChange,
  isDefault, onIsDefaultChange,
  modelBlacklist, onModelBlacklistChange,
  ipWhitelist, onIpWhitelistChange,
  modelSuggestions,
  memberIds, onMemberIdsChange, memberOptions,
}: {
  name: string; onNameChange: (v: string) => void
  description: string; onDescriptionChange: (v: string) => void
  priority: number; onPriorityChange: (v: number) => void
  isDefault: boolean; onIsDefaultChange: (v: boolean) => void
  modelBlacklist: string[]; onModelBlacklistChange: (v: string[]) => void
  ipWhitelist: string[]; onIpWhitelistChange: (v: string[]) => void
  modelSuggestions?: string[]
  memberIds: string[]; onMemberIdsChange: (v: string[]) => void; memberOptions: { id: string; name: string }[]
}) {
  const { t } = useTranslation()
  const ipValidator = (v: string) => {
    const s = v.trim()
    // IPv4 或 IPv4 CIDR：四段 0-255，可选 /0-32
    const m4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/)
    if (m4) {
      const octetsOk = [m4[1], m4[2], m4[3], m4[4]].every((o) => Number(o) <= 255)
      const cidrOk = m4[5] === undefined || Number(m4[5]) <= 32
      return octetsOk && cidrOk
    }
    // IPv6 或 IPv6 CIDR：含冒号、各段 ≤4 位十六进制，可选 /0-128
    const m6 = s.match(/^([0-9a-fA-F:]+)(?:\/(\d{1,3}))?$/)
    if (m6 && s.includes(':')) {
      const segsOk = m6[1].split(':').filter(Boolean).every((seg) => /^[0-9a-fA-F]{1,4}$/.test(seg))
      const cidrOk = m6[2] === undefined || Number(m6[2]) <= 128
      return segsOk && cidrOk
    }
    return false
  }
  return (
    <div className="flex flex-col gap-5 py-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.nameLabel')}<span className="text-rose-500 ml-1">*</span></label>
          <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={t('guardrails.form.namePlaceholder')} />
        </div>
        <div>
          <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.priorityLabel')}</label>
          <Input type="number" value={priority} onChange={(e) => onPriorityChange(Number(e.target.value))} placeholder={t('guardrails.form.priorityPlaceholder')} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.descLabel')}</label>
        <Input value={description} onChange={(e) => onDescriptionChange(e.target.value)} placeholder={t('guardrails.form.descPlaceholder')} />
      </div>
      {/* 设为默认 — Switch 开关 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-mg-text-1">{t('guardrails.form.isDefaultLabel')}</p>
          <p className="text-xs text-mg-text-2 mt-0.5">{t('guardrails.form.isDefaultHint')}</p>
        </div>
        <Switch checked={isDefault} onChange={onIsDefaultChange} />
      </div>
      {/* 模型黑名单 — 下拉多选 */}
      <div>
        <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.modelBlacklistLabel')}</label>
        <TagInput
          value={modelBlacklist}
          onChange={onModelBlacklistChange}
          suggestions={modelSuggestions}
          placeholder={t('guardrails.form.modelBlacklistPlaceholder')}
          hint={t('guardrails.form.modelBlacklistHint')}
        />
      </div>
      {/* IP 白名单 — 自由输入标签 */}
      <div>
        <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.ipWhitelistLabel')}</label>
        <TagInput
          value={ipWhitelist}
          onChange={onIpWhitelistChange}
          allowFreeText
          tagVariant="mono"
          validator={ipValidator}
          placeholder={t('guardrails.form.ipWhitelistPlaceholder')}
          hint={t('guardrails.form.ipWhitelistHint')}
        />
      </div>
      {/* 成员 — 下拉多选 */}
      <div>
        <label className="block text-xs font-bold text-mg-text-1 mb-2">
          <span className="inline-flex items-center gap-1.5">
            <LuUsers className="w-3.5 h-3.5" />
            {t('guardrails.form.membersLabel')}
          </span>
        </label>
        <TagInput
          value={memberIds.map((id) => memberOptions.find((o) => o.id === id)?.name ?? id)}
          onChange={(names) =>
            onMemberIdsChange(
              names.map((n) => memberOptions.find((o) => o.name === n)?.id).filter(Boolean) as string[],
            )
          }
          suggestions={memberOptions.filter((o) => !memberIds.includes(o.id)).map((o) => o.name)}
          placeholder={t('guardrails.form.membersPlaceholder')}
          hint={t('guardrails.form.membersHint')}
        />
      </div>
    </div>
  )
}
