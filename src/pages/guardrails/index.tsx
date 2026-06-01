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
import { LuPlus, LuSettings, LuUsers, LuKey, LuDollarSign, LuX, LuCheck } from 'react-icons/lu'
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
  const [modelWhitelist, setModelWhitelist] = useState<string[]>([])
  const [ipWhitelist, setIpWhitelist] = useState<string[]>([])

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
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addMemberValue, setAddMemberValue] = useState('')
  const [addApiKeyOpen, setAddApiKeyOpen] = useState(false)
  const [addApiKeyValue, setAddApiKeyValue] = useState('')

  // ── 预算内联编辑状态 ────────────────────────────────────────────────────
  const [budgetEditing, setBudgetEditing] = useState(false)
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
      setBudgetEditing(false)
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
    setModelWhitelist([]); setIpWhitelist([])
    setSheetTab('info')
    setDetailOpen(true)
  }

  function openDetail(id: string) {
    setIsCreating(false)
    setDetailId(id)
    setSheetTab('info')
    setBudgetEditing(false)
    setDetailOpen(true)
  }

  function syncFormFromDetail(d: GuardrailDetail) {
    setName(d.name); setDescription(d.description ?? '')
    setIsDefault(d.is_default); setPriority(d.priority)
    const meta = (d as any).metadata ?? {}
    setModelWhitelist(Array.isArray(meta.model_whitelist) ? meta.model_whitelist : [])
    setIpWhitelist(Array.isArray(meta.ip_whitelist) ? meta.ip_whitelist : [])
  }

  function handleSubmit() {
    if (!name.trim()) { appToast.error(t('guardrails.toast.nameRequired')); return }
    const metadata: Record<string, unknown> = {}
    if (modelWhitelist.length > 0) metadata.model_whitelist = modelWhitelist
    if (ipWhitelist.length > 0) metadata.ip_whitelist = ipWhitelist
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

  function toInput(a: GuardrailDetail['assignments'][number]): AssignmentInput {
    return a.subject_type === 'member'
      ? { subject_type: 'member', account_id: a.account_id }
      : { subject_type: 'api_key', api_key_id: a.api_key_id }
  }

  function handleRemoveMember(accountId: string) {
    if (!detail) return
    assignMutation.mutate({
      id: detail.id,
      assignments: detail.assignments.filter(a => !(a.subject_type === 'member' && a.account_id === accountId)).map(toInput),
    })
  }

  function handleClearMembers() {
    if (!detail) return
    assignMutation.mutate({
      id: detail.id,
      assignments: detail.assignments.filter(a => a.subject_type !== 'member').map(toInput),
    })
  }

  function handleAddMember() {
    if (!addMemberValue || !detail) return
    assignMutation.mutate({
      id: detail.id,
      assignments: [...detail.assignments.map(toInput), { subject_type: 'member', account_id: addMemberValue }],
    })
    setAddMemberOpen(false); setAddMemberValue('')
  }

  function handleRemoveApiKey(apiKeyId: string) {
    if (!detail) return
    assignMutation.mutate({
      id: detail.id,
      assignments: detail.assignments.filter(a => !(a.subject_type === 'api_key' && a.api_key_id === apiKeyId)).map(toInput),
    })
  }

  function handleClearApiKeys() {
    if (!detail) return
    assignMutation.mutate({
      id: detail.id,
      assignments: detail.assignments.filter(a => a.subject_type !== 'api_key').map(toInput),
    })
  }

  function handleAddApiKey() {
    if (!addApiKeyValue || !detail) return
    assignMutation.mutate({
      id: detail.id,
      assignments: [...detail.assignments.map(toInput), { subject_type: 'api_key', api_key_id: addApiKeyValue }],
    })
    setAddApiKeyOpen(false); setAddApiKeyValue('')
  }

  function startBudgetEdit() {
    const existing = detail?.budget_policies?.[0]
    setBudgetAmount(existing ? parseFloat(existing.spend_limit_amount).toFixed(0) : '')
    setBudgetPeriodUnit(existing?.period_unit ?? 'month')
    setBudgetEditing(true)
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
  const memberAssignments = detail?.assignments.filter(a => a.subject_type === 'member') ?? []
  const apiKeyAssignments = detail?.assignments.filter(a => a.subject_type === 'api_key') ?? []
  const budget = detail?.budget_policies?.[0] ?? null

  const membersMap = new Map((membersQuery.data?.items ?? []).map(m => [m.account.account_id, m.account]))
  const apiKeysMap = new Map((apiKeysQuery.data?.items ?? []).map(k => [k.api_key_id, k]))

  const availableMembers = (membersQuery.data?.items ?? []).filter(
    m => !memberAssignments.find(a => a.account_id === m.account.account_id)
  )
  const availableApiKeys = (apiKeysQuery.data?.items ?? []).filter(
    k => !apiKeyAssignments.find(a => a.api_key_id === k.api_key_id)
  )

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
                <TableHead>{t('guardrails.table.desc')}</TableHead>
                <TableHead>{t('guardrails.table.priority')}</TableHead>
                <TableHead>{t('guardrails.table.isDefault')}</TableHead>
                <TableHead>{t('guardrails.table.status')}</TableHead>
                <TableHead>{t('guardrails.table.createdAt')}</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guardrails.map((row) => {
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">{row.name}</TableCell>
                    <TableCell className="text-xs text-mg-text-1 max-w-xs truncate">
                      {row.description || <span className="text-mg-text-2">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-1">{row.priority}</TableCell>
                    <TableCell>
                      <Badge variant={row.is_default ? 'success' : 'outline'}>
                        {row.is_default ? t('guardrails.table.defaultBadge') : t('guardrails.table.optionalBadge')}
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
                modelWhitelist={modelWhitelist} onModelWhitelistChange={setModelWhitelist}
                ipWhitelist={ipWhitelist} onIpWhitelistChange={setIpWhitelist}
                modelSuggestions={modelSuggestions}
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
                {/* 成员 */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-1 uppercase tracking-wider">
                      <LuUsers className="w-3.5 h-3.5" /> 成员 ({memberAssignments.length})
                    </div>
                    {memberAssignments.length > 0 && (
                      <button onClick={handleClearMembers} className="text-[11px] text-mg-text-2 hover:text-mg-danger transition-colors cursor-pointer">清空</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {memberAssignments.map((a) => {
                      const acc = membersMap.get(a.account_id)
                      return (
                        <span key={a.account_id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-mg-fill-1 text-mg-text-0 border border-mg-border">
                          {acc?.display_name || acc?.email || a.account_id}
                          <button onClick={() => handleRemoveMember(a.account_id)} className="ml-0.5 text-mg-text-2 hover:text-mg-danger transition-colors cursor-pointer"><LuX className="w-3 h-3" /></button>
                        </span>
                      )
                    })}
                    <button onClick={() => { setAddMemberValue(''); setAddMemberOpen(true) }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-mg-border text-mg-text-2 hover:border-brand-base hover:text-brand-base transition-colors cursor-pointer">
                      <LuPlus className="w-3 h-3" /> 添加成员
                    </button>
                  </div>
                </section>

                {/* API Keys */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-1 uppercase tracking-wider">
                      <LuKey className="w-3.5 h-3.5" /> API Keys ({apiKeyAssignments.length})
                    </div>
                    {apiKeyAssignments.length > 0 && (
                      <button onClick={handleClearApiKeys} className="text-[11px] text-mg-text-2 hover:text-mg-danger transition-colors cursor-pointer">清空</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {apiKeyAssignments.map((a) => {
                      const key = apiKeysMap.get(a.api_key_id)
                      return (
                        <span key={a.api_key_id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-mg-fill-1 text-mg-text-0 border border-mg-border">
                          {key?.name || a.api_key_id}
                          <button onClick={() => handleRemoveApiKey(a.api_key_id)} className="ml-0.5 text-mg-text-2 hover:text-mg-danger transition-colors cursor-pointer"><LuX className="w-3 h-3" /></button>
                        </span>
                      )
                    })}
                    <button onClick={() => { setAddApiKeyValue(''); setAddApiKeyOpen(true) }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-mg-border text-mg-text-2 hover:border-brand-base hover:text-brand-base transition-colors cursor-pointer">
                      <LuPlus className="w-3 h-3" /> 添加 Key
                    </button>
                  </div>
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
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-1 uppercase tracking-wider">
                    <LuDollarSign className="w-3.5 h-3.5" /> 预算策略
                  </div>
                  {!budgetEditing && (
                    <button onClick={startBudgetEdit} className="text-[11px] text-mg-text-2 hover:text-brand-base transition-colors cursor-pointer">
                      {budget ? '修改' : '设置'}
                    </button>
                  )}
                </div>
                {budgetEditing ? (
                  <div className="flex items-center gap-2">
                    <Input type="number" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="输入限额金额" className="h-8 text-xs w-28" />
                    <Select value={budgetPeriodUnit} onChange={(v) => setBudgetPeriodUnit(v as typeof budgetPeriodUnit)} className="h-8 text-xs w-24">
                      {(Object.entries(PERIOD_LABEL) as [typeof budgetPeriodUnit, string][]).map(([k, label]) => (
                        <SelectItem key={k} value={k}>每{label}</SelectItem>
                      ))}
                    </Select>
                    <Button size="sm" variant="brand" className="h-8 px-3" loading={setBudgetMutation.isPending} onClick={handleSaveBudget}>
                      <LuCheck className="w-3.5 h-3.5" />
                    </Button>
                    <button onClick={() => setBudgetEditing(false)} className="text-mg-text-2 hover:text-mg-text-0 transition-colors cursor-pointer"><LuX className="w-4 h-4" /></button>
                  </div>
                ) : budget ? (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-mg-border bg-mg-fill-0">
                    <p className="text-sm font-semibold text-mg-text-0">
                      消费上限：<span className="text-brand-base">{currencySymbol}{parseFloat(budget.spend_limit_amount).toLocaleString()} / {PERIOD_LABEL[budget.period_unit]}</span>
                    </p>
                    <button onClick={() => removeBudgetMutation.mutate({ guardrailId: detail.id, policyId: budget.id })} className="text-mg-text-2 hover:text-mg-danger transition-colors cursor-pointer"><LuX className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <p className="text-xs text-mg-text-2 italic">未设置预算策略，点击右上角「设置」添加</p>
                )}
              </section>
            ) : null
          )}
        </div>
      </SideSheet>

      {/* 添加成员 Modal */}
      <Modal
        open={addMemberOpen}
        onClose={() => setAddMemberOpen(false)}
        title="添加成员"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>取消</Button>
            <Button variant="brand" disabled={!addMemberValue} onClick={handleAddMember}>添加</Button>
          </>
        }
      >
        <div className="py-3">
          <label className="block text-xs font-bold text-mg-text-1 mb-2">选择成员</label>
          <Select value={addMemberValue} onChange={setAddMemberValue} placeholder="请选择工作区成员">
            {availableMembers.map((m) => (
              <SelectItem key={m.account.account_id} value={m.account.account_id}>
                {m.account.display_name || m.account.email}
              </SelectItem>
            ))}
          </Select>
          {availableMembers.length === 0 && (
            <p className="text-xs text-mg-text-2 mt-2">所有成员已全部绑定</p>
          )}
        </div>
      </Modal>

      {/* 添加 API Key Modal */}
      <Modal
        open={addApiKeyOpen}
        onClose={() => setAddApiKeyOpen(false)}
        title="添加 API Key"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddApiKeyOpen(false)}>取消</Button>
            <Button variant="brand" disabled={!addApiKeyValue} onClick={handleAddApiKey}>添加</Button>
          </>
        }
      >
        <div className="py-3">
          <label className="block text-xs font-bold text-mg-text-1 mb-2">选择 API Key</label>
          <Select value={addApiKeyValue} onChange={setAddApiKeyValue} placeholder="请选择 API Key">
            {availableApiKeys.map((k) => (
              <SelectItem key={k.api_key_id} value={k.api_key_id}>{k.name}</SelectItem>
            ))}
          </Select>
          {availableApiKeys.length === 0 && (
            <p className="text-xs text-mg-text-2 mt-2">所有 API Key 已全部绑定</p>
          )}
        </div>
      </Modal>

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
  modelWhitelist, onModelWhitelistChange,
  ipWhitelist, onIpWhitelistChange,
  modelSuggestions,
}: {
  name: string; onNameChange: (v: string) => void
  description: string; onDescriptionChange: (v: string) => void
  priority: number; onPriorityChange: (v: number) => void
  isDefault: boolean; onIsDefaultChange: (v: boolean) => void
  modelWhitelist: string[]; onModelWhitelistChange: (v: string[]) => void
  ipWhitelist: string[]; onIpWhitelistChange: (v: string[]) => void
  modelSuggestions?: string[]
}) {
  const { t } = useTranslation()
  const ipValidator = (v: string) => /^[\d.:/a-fA-F]+$/.test(v)
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
      {/* 模型白名单 — 下拉多选 */}
      <div>
        <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.modelWhitelistLabel')}</label>
        <TagInput
          value={modelWhitelist}
          onChange={onModelWhitelistChange}
          suggestions={modelSuggestions}
          placeholder={t('guardrails.form.modelWhitelistPlaceholder')}
          hint={t('guardrails.form.modelWhitelistHint')}
        />
      </div>
      {/* IP 白名单 — 自由输入标签 */}
      <div>
        <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.ipWhitelistLabel')}</label>
        <TagInput
          value={ipWhitelist}
          onChange={onIpWhitelistChange}
          allowFreeText
          validator={ipValidator}
          placeholder={t('guardrails.form.ipWhitelistPlaceholder')}
          hint={t('guardrails.form.ipWhitelistHint')}
        />
      </div>
      <div className="flex items-center justify-between p-4 rounded-lg border border-mg-border bg-mg-bg-1/40">
        <div>
          <label className="block text-xs font-bold text-mg-text-0 mb-0.5">{t('guardrails.form.isDefaultLabel')}</label>
          <span className="text-[11px] text-mg-text-2">{t('guardrails.form.isDefaultHint')}</span>
        </div>
        <Switch checked={isDefault} onChange={onIsDefaultChange} />
      </div>
    </div>
  )
}
