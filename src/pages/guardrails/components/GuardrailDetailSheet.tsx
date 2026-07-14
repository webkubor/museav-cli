import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { SideSheet } from '@/components/ui/SideSheet'
import { Select, SelectItem } from '@/components/ui/Select'
import { TagInput } from '@/components/ui/TagInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import { LuKey, LuDollarSign, LuUserRound } from 'react-icons/lu'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import { PERIOD_LABEL } from '@/constants/status'
import { GuardrailFormFields } from './GuardrailFormFields'
import { isValidBudgetAmount, trimAmountScale } from '../budget'
import { budgetTimezone, type BudgetAggScope, type GuardrailKind, type GuardrailScope, type PromptInjectionFormValue } from '../derive'

const GUARDRAIL_STATUS_MAP: Record<string, StatusConfig> = {
  active: { label: '已启用', variant: 'success' },
  inactive: { label: '已停用', variant: 'secondary' },
}

type PeriodUnit = 'hour' | 'day' | 'week' | 'month'
type BudgetPolicy = NonNullable<GuardrailDetail['budget_policies']>[number]

// 全局护栏三档编辑草稿（与 index.tsx 的 ScopeBudgetDraft 同形）
interface ScopeBudgetDraft { amount: string; period: PeriodUnit; limited: boolean }

// 三档预算的展示元信息（对齐 PRD 原型的标签/说明）
const GLOBAL_BUDGET_META: { scope: BudgetAggScope; label: string; hint: string; enterpriseOnly?: boolean }[] = [
  { scope: 'guardrail_total', label: '工作空间总预算', hint: '该工作空间所有调用的合计上限' },
  { scope: 'per_member', label: '默认个人预算', hint: '每位成员的默认上限（可被个人护栏覆盖）', enterpriseOnly: true },
  { scope: 'per_api_key', label: '默认 Key 预算', hint: '每个 API Key 的默认上限（可被 Key 护栏覆盖）' },
]

/** 单档全局预算控件：不限额 / 限额 切换 + 金额 + 周期（复用控制台 ui/* + token） */
function GlobalBudgetControl({
  label, hint, draft, onChange, disabled,
}: {
  label: string
  hint: string
  draft: ScopeBudgetDraft
  onChange: (patch: Partial<ScopeBudgetDraft>) => void
  disabled: boolean
}) {
  const invalid = draft.limited && draft.amount.trim() !== '' && !isValidBudgetAmount(draft.amount)
  return (
    <div className="rounded-lg border border-mg-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold text-mg-text-1">{label}</div>
          <div className="text-xs text-mg-text-3 mt-0.5">{hint}</div>
        </div>
        <label className="flex items-center gap-2 shrink-0 text-xs text-mg-text-2">
          <span>{draft.limited ? '限额' : '不限额'}</span>
          <Switch
            checked={draft.limited}
            onChange={(checked) => onChange({ limited: checked })}
            disabled={disabled}
            aria-label={`${label}是否限额`}
          />
        </label>
      </div>
      {draft.limited && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="decimal"
            aria-label={`${label}金额`}
            value={draft.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
            placeholder="输入限额金额（最多两位小数）"
            disabled={disabled}
            className="h-9 text-xs flex-1"
          />
          <Select
            value={draft.period}
            onChange={(v) => onChange({ period: v as PeriodUnit })}
            aria-label={`${label}周期`}
            className="h-9 text-xs w-28"
          >
            {(Object.entries(PERIOD_LABEL) as [PeriodUnit, string][]).map(([k, l]) => (
              <SelectItem key={k} value={k}>每{l}</SelectItem>
            ))}
          </Select>
        </div>
      )}
      {invalid && (
        <p className="text-xs text-mg-danger">预算金额无效：大于 0，整数最多 12 位，小数最多 2 位</p>
      )}
    </div>
  )
}

export function GuardrailDetailSheet({
  open, onClose,
  isCreating,
  detail, detailLoading, detailLoadError, detailRow,
  sheetTab, onSheetTabChange,
  onToggleStatus,
  syncFormFromDetail,
  // 基本信息表单
  name, onNameChange,
  description, onDescriptionChange,
  priority, onPriorityChange,
  scope, onScopeChange,
  kind, onKindChange,
  lockScopeKind, showMemberScope,
  canCreateScope, canCreateBoost,
  boostExpiresAt, onBoostExpiresAtChange,
  showModelIp,
  modelBlacklist, onModelBlacklistChange,
  ipWhitelist, onIpWhitelistChange,
  promptInjectionMode, onPromptInjectionModeChange,
  showPromptInjection, allowPromptInjectionInherit,
  modelSuggestions,
  memberIds, onMemberIdsChange, memberOptions,
  // 作用范围
  apiKeyIds, onApiKeyIdsChange, apiKeyOptions,
  // 预算
  budget, budgetConflict, budgetAmount, onBudgetAmountChange,
  budgetPeriodUnit, onBudgetPeriodUnitChange,
  canEditBudget, savingBudget, onSaveBudget, onShowClearBudget,
  // 全局护栏三档预算
  isGlobal, showMember, globalBudgets, onGlobalBudgetChange,
  onEnterBudgetTab, savingGlobalBudget, onSaveGlobalBudgets,
  currencySymbol,
  // 底部保存
  canEdit, canEditAssignment, submitting, onSubmit,
}: {
  open: boolean; onClose: () => void
  isCreating: boolean
  detail: GuardrailDetail | undefined; detailLoading: boolean; detailLoadError: string | null; detailRow: GuardrailDetail | undefined
  sheetTab: 'info' | 'scope' | 'budget'; onSheetTabChange: (tab: 'info' | 'scope' | 'budget') => void
  onToggleStatus: (args: { id: string; status: 'active' | 'inactive' }) => void
  syncFormFromDetail: (d: GuardrailDetail) => void
  name: string; onNameChange: (v: string) => void
  description: string; onDescriptionChange: (v: string) => void
  priority: number; onPriorityChange: (v: number) => void
  scope: GuardrailScope; onScopeChange: (v: GuardrailScope) => void
  kind: GuardrailKind; onKindChange: (v: GuardrailKind) => void
  lockScopeKind: boolean; showMemberScope: boolean
  /** 创建态按分类的细粒度创建权限（PRD §11）；编辑态锁定分类不参与 */
  canCreateScope: Record<GuardrailScope, boolean>; canCreateBoost: boolean
  boostExpiresAt: string; onBoostExpiresAtChange: (v: string) => void
  showModelIp: boolean
  modelBlacklist: string[]; onModelBlacklistChange: (v: string[]) => void
  ipWhitelist: string[]; onIpWhitelistChange: (v: string[]) => void
  promptInjectionMode: PromptInjectionFormValue; onPromptInjectionModeChange: (v: PromptInjectionFormValue) => void
  showPromptInjection: boolean; allowPromptInjectionInherit: boolean
  modelSuggestions?: string[]
  memberIds: string[]; onMemberIdsChange: (v: string[]) => void; memberOptions: { id: string; name: string }[]
  apiKeyIds: string[]; onApiKeyIdsChange: (v: string[]) => void; apiKeyOptions: { id: string; name: string; active: boolean }[]
  budget: BudgetPolicy | null
  budgetConflict: boolean
  budgetAmount: string; onBudgetAmountChange: (v: string) => void
  budgetPeriodUnit: PeriodUnit; onBudgetPeriodUnitChange: (v: PeriodUnit) => void
  canEditBudget: boolean; savingBudget: boolean; onSaveBudget: () => void; onShowClearBudget: () => void
  isGlobal: boolean; showMember: boolean
  globalBudgets: Record<BudgetAggScope, ScopeBudgetDraft>
  onGlobalBudgetChange: (scope: BudgetAggScope, patch: Partial<ScopeBudgetDraft>) => void
  onEnterBudgetTab: () => void
  savingGlobalBudget: boolean; onSaveGlobalBudgets: () => void
  currencySymbol: string
  canEdit: boolean
  canEditAssignment: boolean
  submitting: boolean; onSubmit: () => void
}) {
  const { t } = useTranslation()

  // 预算计量时区（文档§周期计量：均按租户时区、滚动窗口）；无策略时回退浏览器时区
  const tz = budgetTimezone(budget ?? detail?.budget_policies?.[0])

  // 详情加载失败（含后端对多条生效预算策略返回的 409「预算配置数据错误」）：
  // 抽屉只渲染错误说明。表单/保存一概不出——openDetail 虽已清空表单，
  // 但在加载失败的护栏上提交任何修改都是在脏数据上盲写 (qa#162 review)
  const detailLoadFailed = !isCreating && !detailLoading && !detail && !!detailLoadError
  const canSubmitCurrentTab = isCreating || (sheetTab === 'scope' ? canEditAssignment : canEdit)

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={isCreating ? t('guardrails.modal.createTitle') : (detailRow?.name ?? t('guardrails.modal.editTitle'))}
      width={600}
    >
      {/* 状态切换 */}
      {!isCreating && detail && (
        <div className="flex items-center justify-between px-6 py-3 border-b border-mg-border/50">
          <StatusBadge status={detail.status} statusMap={GUARDRAIL_STATUS_MAP} />
          <Switch
            checked={detail.status === 'active'}
            disabled={!canEdit}
            onChange={(checked) => onToggleStatus({ id: detail.id, status: checked ? 'active' : 'inactive' })}
          />
        </div>
      )}

      {/* Tab 导航 */}
      {!isCreating && !detailLoadFailed && (
        <div className="flex border-b border-mg-border px-6 pt-1">
          {([
            { key: 'info', label: '基本信息' },
            { key: 'scope', label: '作用范围' },
            { key: 'budget', label: '预算' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                onSheetTabChange(tab.key)
                if (tab.key === 'info' && detail) syncFormFromDetail(detail)
                if (tab.key === 'budget' && detail) {
                  // 回填规范化金额（去 NUMERIC 尾零），切 Tab 即放弃未保存的输入
                  const bp = budget
                  onBudgetAmountChange(bp ? trimAmountScale(bp.spend_limit_amount) : '')
                  onBudgetPeriodUnitChange((bp?.period_unit as PeriodUnit) ?? 'month')
                  // 全局护栏三档同步回填
                  onEnterBudgetTab()
                }
              }}
              className={`px-4 py-2.5 text-xs font-bold transition-colors border-b-2 -mb-px cursor-pointer ${
                sheetTab === tab.key
                  ? 'border-brand-base text-brand-base'
                  : 'border-transparent text-mg-text-3 hover:text-mg-text-1'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="p-6 overflow-y-auto flex-1">
        {/* ── 详情加载失败：只渲染错误说明 ── */}
        {detailLoadFailed && (
          <div role="alert" className="p-3 rounded-lg border border-mg-danger/40 bg-mg-danger/5 text-xs text-mg-danger">
            {detailLoadError}
          </div>
        )}

        {/* ── Tab: 基本信息（创建/编辑共用） ── */}
        {!detailLoadFailed && (isCreating || sheetTab === 'info') && (
          <div>
            <GuardrailFormFields
              name={name} onNameChange={onNameChange}
              description={description} onDescriptionChange={onDescriptionChange}
              priority={priority} onPriorityChange={onPriorityChange}
              scope={scope} onScopeChange={onScopeChange}
              kind={kind} onKindChange={onKindChange}
              lockScopeKind={lockScopeKind} showMemberScope={showMemberScope}
              canCreateScope={canCreateScope} canCreateBoost={canCreateBoost}
              boostExpiresAt={boostExpiresAt} onBoostExpiresAtChange={onBoostExpiresAtChange}
              showModelIp={showModelIp}
              modelBlacklist={modelBlacklist} onModelBlacklistChange={onModelBlacklistChange}
              ipWhitelist={ipWhitelist} onIpWhitelistChange={onIpWhitelistChange}
              promptInjectionMode={promptInjectionMode} onPromptInjectionModeChange={onPromptInjectionModeChange}
              showPromptInjection={showPromptInjection} allowPromptInjectionInherit={allowPromptInjectionInherit}
              modelSuggestions={modelSuggestions}
              memberIds={memberIds} onMemberIdsChange={onMemberIdsChange} memberOptions={memberOptions}
              canEditInfo={isCreating || canEdit}
              canEditAssignment={isCreating || canEditAssignment}
              isCreating={isCreating}
              budgetSlot={isCreating ? (
                <>
                  {/* 绑定对象：个人护栏绑成员 / Key 护栏绑 API Key（对齐原型：分类类型后、预算前） */}
                  {scope === 'member' && (
                    <div>
                      <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-mg-text-2">
                        <LuUserRound className="h-3.5 w-3.5" /> 成员<span className="text-mg-danger ml-1">*</span>
                      </label>
                      {memberOptions.length === 0 ? (
                        <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2.5 text-xs text-mg-text-3">
                          当前工作空间暂无可绑定的成员。
                        </div>
                      ) : (
                        <TagInput
                          value={memberIds}
                          onChange={onMemberIdsChange}
                          options={memberOptions.map((o) => ({ value: o.id, label: o.name }))}
                          placeholder="搜索并选择成员"
                          hint="个人护栏至少绑定一位成员"
                        />
                      )}
                    </div>
                  )}
                  {scope === 'key' && (
                    <div>
                      <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-mg-text-2">
                        <LuKey className="h-3.5 w-3.5" /> 绑定 API Key<span className="text-mg-danger ml-1">*</span>
                      </label>
                      {apiKeyOptions.length === 0 ? (
                        <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2.5 text-xs text-mg-text-3">
                          当前工作空间暂无可绑定的 API Key，请先到「API Keys」页创建后再绑定。
                        </div>
                      ) : (
                        <TagInput
                          value={apiKeyIds}
                          onChange={onApiKeyIdsChange}
                          options={apiKeyOptions.map((o) => ({ value: o.id, label: o.name, disabled: !o.active }))}
                          placeholder="搜索并选择该工作空间的 API Key"
                          hint="Key 护栏必须至少绑定一把 API Key"
                        />
                      )}
                    </div>
                  )}
                  {/* 预算：全局三档 / 个人·Key 单档（提额预算亦在此，到期时间由下方 boost 字段承接） */}
                  <div>
                    <label className="block text-xs font-bold text-mg-text-2 mb-2">
                      {scope === 'global' ? '预算（三档独立限额）' : kind === 'boost' ? '提额预算' : '预算'}
                    </label>
                    {scope === 'global' ? (
                      <div className="space-y-3">
                        {GLOBAL_BUDGET_META.filter((m) => !m.enterpriseOnly || showMember).map((m) => (
                          <GlobalBudgetControl
                            key={m.scope}
                            label={m.label}
                            hint={m.hint}
                            draft={globalBudgets[m.scope]}
                            onChange={(patch) => onGlobalBudgetChange(m.scope, patch)}
                            disabled={false}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          aria-label="预算限额金额"
                          value={budgetAmount}
                          onChange={(e) => onBudgetAmountChange(e.target.value)}
                          placeholder="输入限额金额，留空表示不限额"
                          className="h-9 text-xs flex-1"
                        />
                        <Select value={budgetPeriodUnit} onChange={(v) => onBudgetPeriodUnitChange(v as PeriodUnit)} className="h-9 text-xs w-28">
                          {(Object.entries(PERIOD_LABEL) as [PeriodUnit, string][]).map(([k, label]) => (
                            <SelectItem key={k} value={k}>每{label}</SelectItem>
                          ))}
                        </Select>
                      </div>
                    )}
                  </div>
                </>
              ) : undefined}
            />
          </div>
        )}

        {/* ── Tab: 作用范围（成员 + API Key） ── */}
        {!isCreating && sheetTab === 'scope' && (
          detailLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-5 bg-mg-fill-0 rounded-sm w-1/2" />
              <div className="h-4 bg-mg-fill-0 rounded-sm w-full" />
            </div>
          ) : detail ? (
            <div className="space-y-7">
              {/* API Keys — 下拉多选（与成员一致，id 风格；统一由底部保存） */}
              <section>
                <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-2 uppercase tracking-wider mb-3">
                  <LuKey className="w-3.5 h-3.5" /> API Keys
                </div>
                <TagInput
                  value={apiKeyIds}
                  disabled={!canEditAssignment}
                  onChange={onApiKeyIdsChange}
                  options={apiKeyOptions.map((o) => ({ value: o.id, label: o.name, disabled: !o.active }))}
                  placeholder="从下拉批量选择该工作区的 API Key"
                  hint="选中的 Key 将绑定到该护栏，点击底部「保存修改」生效，供网关护栏鉴权使用"
                />
              </section>
            </div>
          ) : null
        )}

        {/* ── Tab: 预算 ── */}
        {!isCreating && sheetTab === 'budget' && (
          detailLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-5 bg-mg-fill-0 rounded-sm w-1/3" />
            </div>
          ) : detail && budgetConflict ? (
            // 单条不变量被破坏（接口返回多条生效策略）：直接报错，禁止任何
            // 预算编辑——在脏数据上替换/清除只会加深不一致 (qa#162)
            <section className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-2 uppercase tracking-wider">
                <LuDollarSign className="w-3.5 h-3.5" /> 预算策略
              </div>
              <div role="alert" className="p-3 rounded-lg border border-mg-danger/40 bg-mg-danger/5 text-xs text-mg-danger">
                预算配置数据错误：存在多条生效中的预算策略，请联系管理员处理
              </div>
            </section>
          ) : detail && isGlobal ? (
            // 全局护栏：按 aggregation_scope 三档独立编辑（个人租户隐藏「默认个人预算」档）
            <section className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-2 uppercase tracking-wider">
                <LuDollarSign className="w-3.5 h-3.5" /> 预算策略
              </div>
              <div className="space-y-3">
                {GLOBAL_BUDGET_META.filter((m) => !m.enterpriseOnly || showMember).map((m) => (
                  <GlobalBudgetControl
                    key={m.scope}
                    label={m.label}
                    hint={m.hint}
                    draft={globalBudgets[m.scope]}
                    onChange={(patch) => onGlobalBudgetChange(m.scope, patch)}
                    disabled={!canEditBudget}
                  />
                ))}
              </div>
              {canEditBudget && (
                <div className="flex items-center justify-between">
                  <Button
                    variant="brand"
                    className="h-9 px-5 text-xs font-semibold"
                    loading={savingGlobalBudget}
                    onClick={onSaveGlobalBudgets}
                  >
                    保存预算
                  </Button>
                  <span className="text-xs text-mg-text-3">三档独立生效，可分别限额或不限额</span>
                </div>
              )}
              <p className="text-xs text-mg-text-3">
                各档均按<span className="font-semibold text-mg-text-2">滚动窗口</span>计量（统计当前时刻往前一个周期长度内的累计消费，非自然日/周/月重置）· 时区 <span className="font-mono">{tz}</span>
              </p>
            </section>
          ) : detail ? (
            <section className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-2 uppercase tracking-wider">
                <LuDollarSign className="w-3.5 h-3.5" /> 预算策略
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  aria-label="预算限额金额"
                  value={budgetAmount}
                  onChange={(e) => onBudgetAmountChange(e.target.value)}
                  placeholder="输入限额金额（最多两位小数）"
                  className="h-9 text-xs flex-1"
                />
                <Select value={budgetPeriodUnit} onChange={(v) => onBudgetPeriodUnitChange(v as PeriodUnit)} className="h-9 text-xs w-28">
                  {(Object.entries(PERIOD_LABEL) as [PeriodUnit, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>每{label}</SelectItem>
                  ))}
                </Select>
              </div>
              {canEditBudget && (
                <div className="flex items-center justify-between">
                  <Button
                    variant="brand"
                    className="h-9 px-5 text-xs font-semibold"
                    loading={savingBudget}
                    onClick={onSaveBudget}
                  >
                    保存预算
                  </Button>
                  {budget && (
                    <button
                      onClick={onShowClearBudget}
                      className="text-xs text-mg-text-3 hover:text-mg-danger transition-colors cursor-pointer"
                    >
                      清除预算
                    </button>
                  )}
                </div>
              )}
              {budget && (
                <div className="p-3 rounded-lg border border-mg-border bg-mg-fill-0/50 text-xs text-mg-text-2 space-y-1">
                  <div>
                    当前生效：<span className="font-semibold text-brand-base">{currencySymbol}{parseFloat(budget.spend_limit_amount).toLocaleString()} / 每{PERIOD_LABEL[budget.period_unit]}</span>
                  </div>
                  <div className="text-mg-text-3">
                    按<span className="font-semibold text-mg-text-2">滚动窗口</span>计量 · 时区 <span className="font-mono">{tz}</span>
                  </div>
                </div>
              )}
            </section>
          ) : null
        )}
      </div>

      {/* 统一底部保存：基本信息 + 作用范围（成员/API Keys）一次保存。
          预算是独立的增删策略，保留其自有按钮。 */}
      {!detailLoadFailed && (isCreating || sheetTab !== 'budget') && (
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-mg-border/50 shrink-0">
          {/* 影响范围预览（保存前）：按分类上下文化——个人护栏只提成员数，
              Key 护栏只提 Key 数，全局护栏说明作用于工作空间默认策略（文档§编辑行为） */}
          <span className="text-xs text-mg-text-3 truncate">
            {scope === 'global' ? (
              '保存后作用于当前工作空间的默认策略'
            ) : scope === 'member' ? (
              <>将作用于 <span className="font-semibold text-mg-text-2">{memberIds.length}</span> 位成员</>
            ) : (
              <>将作用于 <span className="font-semibold text-mg-text-2">{apiKeyIds.length}</span> 把 API Key</>
            )}
          </span>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            {canSubmitCurrentTab && (
              <Button
                variant="brand"
                data-track="guardrails:create_submit"
                loading={submitting}
                onClick={onSubmit}
              >
                {isCreating ? t('guardrails.modal.confirmCreate') : t('guardrails.modal.saveEdit')}
              </Button>
            )}
          </div>
        </div>
      )}
    </SideSheet>
  )
}
