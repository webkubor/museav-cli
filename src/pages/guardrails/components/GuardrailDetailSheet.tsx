import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SideSheet } from '@/components/ui/SideSheet'
import { Select, SelectItem } from '@/components/ui/Select'
import { TagInput } from '@/components/ui/TagInput'
import { formatDateTime } from '@/lib/format-date'
import { LuKey, LuUserRound, LuInfo } from 'react-icons/lu'
import type { GuardrailAuditLog, GuardrailDetail } from '@/interfaces/guardrails'
import { GuardrailFormFields } from './GuardrailFormFields'
import { isValidBudgetAmount } from '../budget'
import {
  GUARDRAIL_BUDGET_PERIOD_OPTIONS,
  PROMPT_INJECTION_INHERIT,
  PROMPT_INJECTION_INHERIT_LABEL,
  PROMPT_INJECTION_LABEL,
  PROMPT_INJECTION_MODES,
  SCOPE_LABEL,
  type BudgetAggScope,
  type GuardrailKind,
  type GuardrailScope,
  type PromptInjectionFormValue,
} from '../derive'

/** 标签旁的 info tooltip（需求方#156）：把冗余的行内 hint 收进小圆圈 info，与「提示词注入」同一模式。 */
function InfoTip({ text, label }: { text: string; label: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-flex text-mg-text-3 outline-none transition-colors hover:text-mg-text-2 focus-visible:text-mg-text-2"
      >
        <LuInfo className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-6 z-20 w-[220px] rounded-md border border-mg-border bg-mg-bg-0 p-3 text-left font-normal normal-case tracking-normal opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <span className="block text-[11px] font-medium leading-snug text-mg-text-3">{text}</span>
      </span>
    </span>
  )
}

type PeriodUnit = 'hour' | 'day' | 'week' | 'month'

// 全局护栏三档编辑草稿（与 index.tsx 的 ScopeBudgetDraft 同形）
interface ScopeBudgetDraft { amount: string; period: PeriodUnit; limited: boolean }

// 三档预算的展示元信息（对齐 PRD GuardrailBudgetControl：仅 label + 分段 + 金额，无 hint。顺序：
// 工作空间总预算 → 默认个人预算(企业) → 默认 Key 预算）
const GLOBAL_BUDGET_META: { scope: BudgetAggScope; label: string; enterpriseOnly?: boolean }[] = [
  { scope: 'guardrail_total', label: '工作空间总预算' },
  { scope: 'per_member', label: '默认个人预算', enterpriseOnly: true },
  { scope: 'per_api_key', label: '默认 Key 预算' },
]

/** 单档全局预算控件：不限额 / 限额 切换 + 金额 + 周期（对齐 PRD GuardrailBudgetControl，无 hint 说明） */
function GlobalBudgetControl({
  label, draft, onChange, disabled,
}: {
  label: string
  draft: ScopeBudgetDraft
  onChange: (patch: Partial<ScopeBudgetDraft>) => void
  disabled: boolean
}) {
  const invalid = draft.limited && draft.amount.trim() !== '' && !isValidBudgetAmount(draft.amount)
  // 交互形态对齐 PRD GuardrailBudgetControl：两按钮分段「不限额 | 限额」，非 Switch。
  const modeBtn = (active: boolean) =>
    [
      'rounded-md border px-3 py-2 text-xs font-bold transition-all',
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      active
        ? 'border-brand-base bg-brand-base/8 text-brand-base'
        : 'border-mg-border bg-mg-fill-0/40 text-mg-text-2 hover:border-brand-base/35',
    ].join(' ')
  return (
    <div className="rounded-lg border border-mg-border p-4 space-y-3">
      <div className="text-xs font-bold text-mg-text-1">{label}</div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${label}额度类型`}>
        <button type="button" role="radio" aria-checked={!draft.limited} disabled={disabled} onClick={() => onChange({ limited: false })} className={modeBtn(!draft.limited)}>不限额</button>
        <button type="button" role="radio" aria-checked={draft.limited} disabled={disabled} onClick={() => onChange({ limited: true })} className={modeBtn(draft.limited)}>限额</button>
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
            disabled={disabled}
          >
            {GUARDRAIL_BUDGET_PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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

/** 编辑态字段块：label（可带必填星/图标/InfoTip）+ 内容 */
function Field({ label, required, icon, tip, children }: {
  label: string
  required?: boolean
  icon?: React.ReactNode
  tip?: { text: string; label: string }
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-mg-text-2">
        {icon}
        {label}
        {required && <span className="text-mg-danger">*</span>}
        {tip && <InfoTip text={tip.text} label={tip.label} />}
      </label>
      {children}
    </div>
  )
}

/** 个人 / Key 护栏单档预算（金额 + 周期）。对齐现状控制台：不限额语义不落到成员/Key 档。 */
function MemberKeyBudgetControl({
  label, amount, onAmountChange, period, onPeriodChange, disabled, error,
}: {
  label: string
  amount: string
  onAmountChange: (v: string) => void
  period: PeriodUnit
  onPeriodChange: (v: PeriodUnit) => void
  disabled: boolean
  error?: string
}) {
  return (
    <Field label={label} required>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="decimal"
          aria-label={`${label}金额`}
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="输入限额金额（最多两位小数）"
          className="h-9 text-xs flex-1"
          disabled={disabled}
        />
        <Select
          value={period}
          onChange={(v) => onPeriodChange(v as PeriodUnit)}
          aria-label={`${label}周期`}
          className="h-9 text-xs w-28"
          disabled={disabled}
        >
          {GUARDRAIL_BUDGET_PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </Select>
      </div>
      {error && <p className="text-xs text-mg-danger mt-1.5">{error}</p>}
    </Field>
  )
}

/** 个人 / Key「提额」预算控件：不限额 / 限额 分段切换 + 金额 + 周期。
 *  交互形态对齐 PRD GuardrailBudgetControl（两按钮分段 guardrail-budget-mode-toggle，非 Switch）；
 *  视觉沿用本仓分段按钮样式（rounded-md border + brand 高亮，见 GuardrailFormFields.SegGroup）。
 *  点「不限额」→ 隐藏金额/周期、保存不下发预算策略（有旧策略则删除）；点「限额」→ 金额+周期必填。 */
function MemberKeyBoostBudgetControl({
  label, limited, onLimitedChange, amount, onAmountChange, period, onPeriodChange, disabled, error,
}: {
  label: string
  limited: boolean
  onLimitedChange: (v: boolean) => void
  amount: string
  onAmountChange: (v: string) => void
  period: PeriodUnit
  onPeriodChange: (v: PeriodUnit) => void
  disabled: boolean
  error?: string
}) {
  const invalid = limited && amount.trim() !== '' && !isValidBudgetAmount(amount)
  const modeBtn = (active: boolean) =>
    [
      'rounded-md border px-3 py-2 text-xs font-bold transition-all',
      disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      active
        ? 'border-brand-base bg-brand-base/8 text-brand-base'
        : 'border-mg-border bg-mg-fill-0/40 text-mg-text-2 hover:border-brand-base/35',
    ].join(' ')
  return (
    <Field label={label} required={limited}>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${label}额度类型`}>
        <button type="button" role="radio" aria-checked={!limited} disabled={disabled} onClick={() => onLimitedChange(false)} className={modeBtn(!limited)}>不限额</button>
        <button type="button" role="radio" aria-checked={limited} disabled={disabled} onClick={() => onLimitedChange(true)} className={modeBtn(limited)}>限额</button>
      </div>
      {limited && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="text"
            inputMode="decimal"
            aria-label={`${label}金额`}
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="输入限额金额（最多两位小数）"
            disabled={disabled}
            className="h-9 text-xs flex-1"
          />
          <Select
            value={period}
            onChange={(v) => onPeriodChange(v as PeriodUnit)}
            aria-label={`${label}周期`}
            className="h-9 text-xs w-28"
            disabled={disabled}
          >
            {GUARDRAIL_BUDGET_PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </Select>
        </div>
      )}
      {invalid && (
        <p className="mt-1.5 text-xs text-mg-danger">预算金额无效：大于 0，整数最多 12 位，小数最多 2 位</p>
      )}
      {error && <p className="mt-1.5 text-xs text-mg-danger">{error}</p>}
    </Field>
  )
}

/** 提示词注入模式选择（编辑态；allowInherit 决定是否含「继承全局护栏」） */
function PromptInjectionField({ value, onChange, allowInherit, disabled }: {
  value: PromptInjectionFormValue
  onChange: (v: PromptInjectionFormValue) => void
  allowInherit: boolean
  disabled: boolean
}) {
  return (
    <Field
      label="提示词注入检测"
      tip={{ label: '命中后的处理方式', text: '仅记录=记录命中仍原样发送；脱敏=命中内容替换后发送；拦截=直接拒绝请求' }}
    >
      <Select value={value} onChange={(v) => onChange(v as PromptInjectionFormValue)} disabled={disabled} className="w-full">
        {allowInherit && <SelectItem value={PROMPT_INJECTION_INHERIT}>{PROMPT_INJECTION_INHERIT_LABEL}</SelectItem>}
        {PROMPT_INJECTION_MODES.map((m) => (
          <SelectItem key={m} value={m}>{PROMPT_INJECTION_LABEL[m]}</SelectItem>
        ))}
      </Select>
    </Field>
  )
}

/** 操作记录区（对齐 PRD GuardrailAuditSection + 现状 API Key 详情抽屉「操作审计」列表样式）。
 *  审计接口按工作空间返回、已在上层按 target_id 过滤到本护栏；空/失败均给空态，不造假数据。 */
function GuardrailAuditSection({ rows, loading }: { rows: GuardrailAuditLog[]; loading: boolean }) {
  return (
    <section className="space-y-2.5 border-t border-mg-border/50 pt-6">
      <h3 className="text-xs font-bold uppercase tracking-wider text-mg-text-3">操作记录</h3>
      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-2/3 rounded-sm bg-mg-fill-0" />
          <div className="h-4 w-1/2 rounded-sm bg-mg-fill-0" />
        </div>
      ) : rows.length > 0 ? (
        <div className="space-y-3">
          {rows.slice(0, 8).map((a) => (
            <div key={a.id} className="border-l-2 border-mg-border pl-3">
              <div className="text-xs font-bold text-mg-text-1">{a.action}</div>
              <div className="mt-0.5 text-xs text-mg-text-3">
                {formatDateTime(a.created_at)} · {a.actor_display || a.actor_account_id || '—'}
              </div>
              {a.target_label && <p className="mt-0.5 text-xs leading-relaxed text-mg-text-2">{a.target_label}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-mg-text-3">暂无操作记录</p>
      )}
    </section>
  )
}

export function GuardrailDetailSheet({
  open, onClose,
  isCreating,
  detail, detailLoading, detailLoadError, detailRow,
  // 基本信息表单
  name, onNameChange,
  description, onDescriptionChange,
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
  budgetConflict, budgetAmount, onBudgetAmountChange,
  budgetPeriodUnit, onBudgetPeriodUnitChange,
  budgetLimited, onBudgetLimitedChange,
  canEditBudget,
  // 全局护栏三档预算
  showMember, globalBudgets, onGlobalBudgetChange,
  // 操作记录
  auditRows, auditLoading,
  // 底部保存
  canEdit, canEditAssignment, submitting, onSubmit,
}: {
  open: boolean; onClose: () => void
  isCreating: boolean
  detail: GuardrailDetail | undefined; detailLoading: boolean; detailLoadError: string | null; detailRow: GuardrailDetail | undefined
  name: string; onNameChange: (v: string) => void
  description: string; onDescriptionChange: (v: string) => void
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
  budgetConflict: boolean
  budgetAmount: string; onBudgetAmountChange: (v: string) => void
  budgetPeriodUnit: PeriodUnit; onBudgetPeriodUnitChange: (v: PeriodUnit) => void
  /** 个人/Key「提额」预算是否限额（常规档恒为限额=必填，全局走 globalBudgets） */
  budgetLimited: boolean; onBudgetLimitedChange: (v: boolean) => void
  canEditBudget: boolean
  showMember: boolean
  globalBudgets: Record<BudgetAggScope, ScopeBudgetDraft>
  onGlobalBudgetChange: (scope: BudgetAggScope, patch: Partial<ScopeBudgetDraft>) => void
  auditRows: GuardrailAuditLog[]
  auditLoading: boolean
  canEdit: boolean
  canEditAssignment: boolean
  submitting: boolean; onSubmit: () => void
}) {
  const { t } = useTranslation()

  // 详情加载失败（含后端对多条生效预算策略返回的 409「预算配置数据错误」）：
  // 抽屉只渲染错误说明。表单/保存一概不出——在加载失败的护栏上提交任何修改
  // 都是在脏数据上盲写 (qa#162 review)
  const detailLoadFailed = !isCreating && !detailLoading && !detail && !!detailLoadError

  // 编辑态保存门：任一细粒度写权限 + 必填校验（金额上下限等复杂校验在页面侧串行编排里报 toast）
  const missingMember = canEditAssignment && scope === 'member' && memberIds.length === 0
  const missingKey = canEditAssignment && scope === 'key' && apiKeyIds.length === 0
  const missingBoostExpiry = canEdit && kind === 'boost' && !boostExpiresAt
  // 常规个人/Key 预算恒必填；提额仅在「限额」时必填（不限额档无需金额）。
  const missingBudget =
    canEditBudget && scope !== 'global' && (kind === 'regular' || budgetLimited) && !budgetAmount.trim()
  const editCanSave =
    (canEdit || canEditAssignment || canEditBudget) &&
    !budgetConflict &&
    !missingMember && !missingKey && !missingBoostExpiry && !missingBudget
  const canSubmit = isCreating ? (canEdit || canEditAssignment) : editCanSave

  const scopeLabel = `${SCOPE_LABEL[scope]}护栏`
  const memberBudgetLabel = kind === 'boost' ? '提额预算' : '个人预算'
  const keyBudgetLabel = kind === 'boost' ? '提额预算' : 'Key 预算'

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex flex-col gap-0.5">
          {/* 眉标在标题上方（对齐 PRD 抽屉头：创建=「安全护栏」/编辑=作用域标签） */}
          <span className="text-[11px] font-normal leading-none text-mg-text-3">{isCreating ? '安全护栏' : scopeLabel}</span>
          <span>{isCreating ? t('guardrails.modal.createTitle') : (detailRow?.name ?? t('guardrails.modal.editTitle'))}</span>
        </span>
      }
    >
      <div className="p-6 overflow-y-auto flex-1">
        {/* ── 详情加载失败：只渲染错误说明 ── */}
        {detailLoadFailed && (
          <div role="alert" className="p-3 rounded-lg border border-mg-danger/40 bg-mg-danger/5 text-xs text-mg-danger">
            {detailLoadError}
          </div>
        )}

        {/* ── 创建态：分类/类型 + 绑定 + 预算 + 规则（GuardrailFormFields 承接，保持原型创建顺序） ── */}
        {!detailLoadFailed && isCreating && (
          <GuardrailFormFields
            name={name} onNameChange={onNameChange}
            description={description} onDescriptionChange={onDescriptionChange}
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
            budgetSlot={(
              <>
                {/* 绑定对象：个人护栏绑成员 / Key 护栏绑 API Key（对齐原型：分类类型后、预算前） */}
                {scope === 'member' && (
                  <Field label="成员" required icon={<LuUserRound className="h-3.5 w-3.5" />}>
                    {memberOptions.length === 0 ? (
                      <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2.5 text-xs text-mg-text-3">
                        当前工作空间暂无可绑定的成员。
                      </div>
                    ) : (
                      <TagInput
                        value={memberIds}
                        onChange={onMemberIdsChange}
                        options={memberOptions.map((o) => ({ value: o.id, label: o.name }))}
                        placeholder="搜索成员"
                      />
                    )}
                  </Field>
                )}
                {scope === 'key' && (
                  <Field label="绑定 API Key" required icon={<LuKey className="h-3.5 w-3.5" />}>
                    {apiKeyOptions.length === 0 ? (
                      <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2.5 text-xs text-mg-text-3">
                        当前工作空间暂无可绑定的 API Key，请先到「API Keys」页创建后再绑定。
                      </div>
                    ) : (
                      <TagInput
                        value={apiKeyIds}
                        onChange={onApiKeyIdsChange}
                        options={apiKeyOptions.map((o) => ({ value: o.id, label: o.name, disabled: !o.active }))}
                        placeholder="搜索 API Key"
                      />
                    )}
                  </Field>
                )}
                {/* 预算（对齐 PRD GuardrailBudgetControl）：全局三档直接排列（无外层「预算」标签）/ 个人·Key 提额=不限额|限额分段 / 常规=必填金额+周期 */}
                {scope === 'global' ? (
                  <div className="space-y-3">
                    {GLOBAL_BUDGET_META.filter((m) => !m.enterpriseOnly || showMember).map((m) => (
                      <GlobalBudgetControl
                        key={m.scope}
                        label={m.label}
                        draft={globalBudgets[m.scope]}
                        onChange={(patch) => onGlobalBudgetChange(m.scope, patch)}
                        disabled={false}
                      />
                    ))}
                  </div>
                ) : kind === 'boost' ? (
                  <MemberKeyBoostBudgetControl
                    label={scope === 'member' ? memberBudgetLabel : keyBudgetLabel}
                    limited={budgetLimited}
                    onLimitedChange={onBudgetLimitedChange}
                    amount={budgetAmount}
                    onAmountChange={onBudgetAmountChange}
                    period={budgetPeriodUnit}
                    onPeriodChange={onBudgetPeriodUnitChange}
                    disabled={false}
                  />
                ) : (
                  <Field label={scope === 'member' ? memberBudgetLabel : keyBudgetLabel} required>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        aria-label={scope === 'member' ? memberBudgetLabel : keyBudgetLabel}
                        value={budgetAmount}
                        onChange={(e) => onBudgetAmountChange(e.target.value)}
                        placeholder="输入限额金额（最多两位小数）"
                        className="h-9 text-xs flex-1"
                      />
                      <Select value={budgetPeriodUnit} onChange={(v) => onBudgetPeriodUnitChange(v as PeriodUnit)} className="h-9 text-xs w-28">
                        {GUARDRAIL_BUDGET_PERIOD_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </Select>
                    </div>
                  </Field>
                )}
              </>
            )}
          />
        )}

        {/* ── 编辑态：单滚动体、按 scope 出一个 section（严格对齐 PRD 字段顺序） ── */}
        {!detailLoadFailed && !isCreating && (
          detailLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-5 bg-mg-fill-0 rounded-sm w-1/2" />
              <div className="h-4 bg-mg-fill-0 rounded-sm w-full" />
              <div className="h-4 bg-mg-fill-0 rounded-sm w-2/3" />
            </div>
          ) : detail ? (
            <div className="flex flex-col gap-5">
              {/* section 标题（对齐 PRD GuardrailDetailDrawer：全局护栏 / 个人护栏 / Key 护栏） */}
              <h4 className="text-sm font-bold text-mg-text-1">{scopeLabel}</h4>

              {budgetConflict && (
                <div role="alert" className="p-3 rounded-lg border border-mg-danger/40 bg-mg-danger/5 text-xs text-mg-danger">
                  预算配置数据错误：存在多条生效中的预算策略，请联系管理员处理
                </div>
              )}

              {/* 护栏名称（各 scope 首字段） */}
              <Field label={t('guardrails.form.nameLabel')} required>
                <Input value={name} disabled={!canEdit} onChange={(e) => onNameChange(e.target.value)} placeholder={t('guardrails.form.namePlaceholder')} />
              </Field>

              {/* 全局护栏：总预算 → 默认个人预算(企业) → 默认 Key 预算 → 模型黑名单 → IP 白名单 → 提示词注入(不可继承) */}
              {scope === 'global' && (
                <>
                  {GLOBAL_BUDGET_META.filter((m) => !m.enterpriseOnly || showMember).map((m) => (
                    <GlobalBudgetControl
                      key={m.scope}
                      label={m.label}
                      draft={globalBudgets[m.scope]}
                      onChange={(patch) => onGlobalBudgetChange(m.scope, patch)}
                      disabled={!canEditBudget || budgetConflict}
                    />
                  ))}
                  <Field label={t('guardrails.form.modelBlacklistLabel')}>
                    <TagInput
                      value={modelBlacklist}
                      disabled={!canEdit}
                      onChange={onModelBlacklistChange}
                      suggestions={modelSuggestions}
                      placeholder={t('guardrails.form.modelBlacklistPlaceholder')}
                    />
                  </Field>
                  <Field label={t('guardrails.form.ipWhitelistLabel')}>
                    <TagInput
                      value={ipWhitelist}
                      disabled={!canEdit}
                      onChange={onIpWhitelistChange}
                      allowFreeText
                      tagVariant="mono"
                      placeholder={t('guardrails.form.ipWhitelistPlaceholder')}
                    />
                  </Field>
                  <PromptInjectionField value={promptInjectionMode} onChange={onPromptInjectionModeChange} allowInherit={false} disabled={!canEdit} />
                </>
              )}

              {/* 个人护栏：成员多选 → [提额:提额预算 | 常规:个人预算+周期] → [提额:到期时间] */}
              {scope === 'member' && (
                <>
                  <Field label={t('guardrails.form.membersLabel')} required icon={<LuUserRound className="h-3.5 w-3.5" />}>
                    {memberOptions.length === 0 ? (
                      <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2.5 text-xs text-mg-text-3">
                        当前工作空间暂无可绑定的成员。
                      </div>
                    ) : (
                      <TagInput
                        value={memberIds}
                        disabled={!canEditAssignment}
                        onChange={onMemberIdsChange}
                        options={memberOptions.map((o) => ({ value: o.id, label: o.name }))}
                        placeholder={t('guardrails.form.membersPlaceholder')}
                      />
                    )}
                  </Field>
                  {kind === 'boost' ? (
                    <MemberKeyBoostBudgetControl
                      label={memberBudgetLabel}
                      limited={budgetLimited}
                      onLimitedChange={onBudgetLimitedChange}
                      amount={budgetAmount}
                      onAmountChange={onBudgetAmountChange}
                      period={budgetPeriodUnit}
                      onPeriodChange={onBudgetPeriodUnitChange}
                      disabled={!canEditBudget || budgetConflict}
                    />
                  ) : (
                    <MemberKeyBudgetControl
                      label={memberBudgetLabel}
                      amount={budgetAmount}
                      onAmountChange={onBudgetAmountChange}
                      period={budgetPeriodUnit}
                      onPeriodChange={onBudgetPeriodUnitChange}
                      disabled={!canEditBudget || budgetConflict}
                    />
                  )}
                  {kind === 'boost' && (
                    <Field label="提额到期时间" required>
                      <Input
                        type="datetime-local"
                        aria-label="提额到期时间"
                        value={boostExpiresAt}
                        disabled={!canEdit}
                        onChange={(e) => onBoostExpiresAtChange(e.target.value)}
                      />
                    </Field>
                  )}
                </>
              )}

              {/* Key 护栏：API Key 多选 → [提额:提额预算 | 常规:Key 预算+周期] → [提额:到期] → [常规:模型黑名单+IP 白名单+提示词注入(可继承)] */}
              {scope === 'key' && (
                <>
                  <Field label="绑定 API Key" required icon={<LuKey className="h-3.5 w-3.5" />}>
                    {apiKeyOptions.length === 0 ? (
                      <div className="rounded-md border border-mg-border bg-mg-fill-0/40 px-3 py-2.5 text-xs text-mg-text-3">
                        当前工作空间暂无可绑定的 API Key，请先到「API Keys」页创建后再绑定。
                      </div>
                    ) : (
                      <TagInput
                        value={apiKeyIds}
                        disabled={!canEditAssignment}
                        onChange={onApiKeyIdsChange}
                        options={apiKeyOptions.map((o) => ({ value: o.id, label: o.name, disabled: !o.active }))}
                        placeholder="搜索 API Key"
                      />
                    )}
                  </Field>
                  {kind === 'boost' ? (
                    <MemberKeyBoostBudgetControl
                      label={keyBudgetLabel}
                      limited={budgetLimited}
                      onLimitedChange={onBudgetLimitedChange}
                      amount={budgetAmount}
                      onAmountChange={onBudgetAmountChange}
                      period={budgetPeriodUnit}
                      onPeriodChange={onBudgetPeriodUnitChange}
                      disabled={!canEditBudget || budgetConflict}
                    />
                  ) : (
                    <MemberKeyBudgetControl
                      label={keyBudgetLabel}
                      amount={budgetAmount}
                      onAmountChange={onBudgetAmountChange}
                      period={budgetPeriodUnit}
                      onPeriodChange={onBudgetPeriodUnitChange}
                      disabled={!canEditBudget || budgetConflict}
                    />
                  )}
                  {kind === 'boost' && (
                    <Field label="提额到期时间" required>
                      <Input
                        type="datetime-local"
                        aria-label="提额到期时间"
                        value={boostExpiresAt}
                        disabled={!canEdit}
                        onChange={(e) => onBoostExpiresAtChange(e.target.value)}
                      />
                    </Field>
                  )}
                  {kind === 'regular' && (
                    <>
                      <Field label={t('guardrails.form.modelBlacklistLabel')}>
                        <TagInput
                          value={modelBlacklist}
                          disabled={!canEdit}
                          onChange={onModelBlacklistChange}
                          suggestions={modelSuggestions}
                          placeholder={t('guardrails.form.modelBlacklistPlaceholder')}
                        />
                      </Field>
                      <Field label={t('guardrails.form.ipWhitelistLabel')}>
                        <TagInput
                          value={ipWhitelist}
                          disabled={!canEdit}
                          onChange={onIpWhitelistChange}
                          allowFreeText
                          tagVariant="mono"
                          placeholder={t('guardrails.form.ipWhitelistPlaceholder')}
                        />
                      </Field>
                      <PromptInjectionField value={promptInjectionMode} onChange={onPromptInjectionModeChange} allowInherit disabled={!canEdit} />
                    </>
                  )}
                </>
              )}

              {/* 操作记录（只读，对齐 PRD GuardrailAuditSection） */}
              <GuardrailAuditSection rows={auditRows} loading={auditLoading} />
            </div>
          ) : null
        )}
      </div>

      {/* 统一底部：仅 取消/关闭 + 创建/保存（对齐 PRD 抽屉底部，无「作用于 N…」预览） */}
      {!detailLoadFailed && (isCreating || Boolean(detail)) && (
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-mg-border/50 shrink-0">
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={onClose}>{isCreating ? t('common.cancel') : '关闭'}</Button>
            {canSubmit && (
              <Button
                variant="brand"
                data-track="guardrails:create_submit"
                loading={submitting}
                onClick={onSubmit}
              >
                {isCreating ? t('guardrails.modal.confirmCreate') : '保存护栏'}
              </Button>
            )}
          </div>
        </div>
      )}
    </SideSheet>
  )
}
