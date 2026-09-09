import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/Input'
import { TagInput } from '@/components/ui/TagInput'
import Select, { SelectItem } from '@/components/ui/Select'
import { LuInfo, LuUsers } from 'react-icons/lu'
import {
  KIND_LABEL_KEY,
  PROMPT_INJECTION_HINTS,
  PROMPT_INJECTION_HINT_KEY,
  PROMPT_INJECTION_INHERIT,
  PROMPT_INJECTION_INHERIT_LABEL_KEY,
  PROMPT_INJECTION_LABEL_KEY,
  PROMPT_INJECTION_MODES,
  SCOPE_LABEL_KEY,
  type GuardrailKind,
  type GuardrailScope,
  type PromptInjectionFormValue,
} from '../derive'

// ─── 分段按钮组（对齐原型：分类/类型用分段切换，非下拉） ──────────────────────
function SegGroup<T extends string>({
  value, onChange, options, disabled, ariaLabel, track,
}: {
  value: T
  onChange: (v: T) => void
  /** 单项可带 disabled + title（如无创建权限的分类置灰并提示原因,PRD §11/§8.2 风格） */
  options: { value: T; label: string; disabled?: boolean; title?: string }[]
  disabled?: boolean
  ariaLabel?: string
  track?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => {
        const active = value === o.value
        const itemDisabled = disabled || o.disabled
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={itemDisabled}
            title={o.title}
            data-track={track}
            onClick={() => onChange(o.value)}
            className={[
              'rounded-md border px-3 py-2 text-xs font-bold transition-all',
              itemDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              active
                ? 'border-brand-base bg-brand-base/8 text-brand-base'
                : 'border-mg-border bg-mg-fill-0/40 text-mg-text-2 hover:border-brand-base/35',
            ].join(' ')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── 公共：表单字段组件（创建/编辑复用） ──────────────────────────────────────

export function GuardrailFormFields({
  name, onNameChange,
  description, onDescriptionChange,
  // 分类（全局/个人/Key）+ 类型（常规/提额）显式选择，替代旧 isDefault 反推
  scope, onScopeChange,
  kind, onKindChange,
  lockScopeKind,
  showMemberScope,
  canCreateScope, canCreateBoost,
  boostExpiresAt, onBoostExpiresAtChange,
  showModelIp,
  modelBlacklist, onModelBlacklistChange,
  ipWhitelist, onIpWhitelistChange,
  promptInjectionMode, onPromptInjectionModeChange,
  showPromptInjection, allowPromptInjectionInherit,
  modelSuggestions,
  memberIds, onMemberIdsChange, memberOptions,
  canEditInfo, canEditAssignment,
  isCreating = false,
  budgetSlot,
}: {
  name: string; onNameChange: (v: string) => void
  description: string; onDescriptionChange: (v: string) => void
  /** 护栏分类：显式选择，创建后不可改（编辑锁定） */
  scope: GuardrailScope; onScopeChange: (v: GuardrailScope) => void
  /** 护栏类型：常规 / 提额；全局护栏恒常规、无此选择器 */
  kind: GuardrailKind; onKindChange: (v: GuardrailKind) => void
  /** 编辑态：分类/类型不可切换（文档：提额创建后类型不可切换） */
  lockScopeKind: boolean
  /** 个人组织隐藏「个人」分类选项 */
  showMemberScope: boolean
  /** 创建态：分类各自的细粒度创建权限（PRD §11）；无权限项置灰并提示 */
  canCreateScope: Record<GuardrailScope, boolean>
  /** 创建态：提额护栏创建权限（PRD §11：Member 不可建提额） */
  canCreateBoost: boolean
  /** 提额到期时间（datetime-local 值）；仅提额显示 */
  boostExpiresAt: string; onBoostExpiresAtChange: (v: string) => void
  /** 文档：个人护栏与提额护栏不配置模型黑名单 / IP 白名单 */
  showModelIp: boolean
  modelBlacklist: string[]; onModelBlacklistChange: (v: string[]) => void
  ipWhitelist: string[]; onIpWhitelistChange: (v: string[]) => void
  promptInjectionMode: PromptInjectionFormValue; onPromptInjectionModeChange: (v: PromptInjectionFormValue) => void
  /** 文档：仅全局护栏与常规 Key 护栏配置提示词注入；个人/提额护栏不出现该控件 */
  showPromptInjection: boolean
  /** 常规 Key 护栏可选「继承全局」；全局护栏不可 */
  allowPromptInjectionInherit: boolean
  modelSuggestions?: string[]
  memberIds: string[]; onMemberIdsChange: (v: string[]) => void; memberOptions: { id: string; name: string }[]
  canEditInfo: boolean
  canEditAssignment: boolean
  /** 创建态：对齐原型隐藏「描述」，仅编辑态展示 */
  isCreating?: boolean
  /** 创建态插槽：绑定对象 + 预算，插在分类/类型之后、规则(模型/IP/注入)之前（对齐原型顺序） */
  budgetSlot?: ReactNode
}) {
  const { t } = useTranslation()
  const [ipError, setIpError] = useState('')
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
      {/* 名称（对齐原型：创建/编辑均名称独占一行、无优先级；编辑态额外保留描述） */}
      <div>
        <label className="block text-xs font-bold text-mg-text-2 mb-2">{isCreating ? t('guardrails.form.guardrailNameLabel') : t('guardrails.form.nameLabel')}<span className="text-mg-danger ml-1">*</span></label>
        <Input value={name} data-track="guardrails:field_name" disabled={!canEditInfo} onChange={(e) => onNameChange(e.target.value)} placeholder={t('guardrails.form.namePlaceholder')} />
      </div>
      {!isCreating && (
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">{t('guardrails.form.descLabel')}</label>
          <Input value={description} disabled={!canEditInfo} onChange={(e) => onDescriptionChange(e.target.value)} placeholder={t('guardrails.form.descPlaceholder')} />
        </div>
      )}
      {/* 分类 + 类型 — 分段按钮显式选择（对齐原型）。仅创建态出现；编辑态不再展示分类/类型（需求方#189）。 */}
      {isCreating && (
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">{t('guardrails.form.scopeLabel')}<span className="text-mg-danger ml-1">*</span></label>
          <SegGroup
            value={scope}
            onChange={(v) => onScopeChange(v)}
            disabled={lockScopeKind || !canEditInfo}
            ariaLabel={t('guardrails.form.scopeLabel')}
            track="guardrails:field_scope"
            options={(['global', 'member', 'key'] as GuardrailScope[])
              .filter((s) => s !== 'member' || showMemberScope)
              .map((s) => {
                // 创建态按各分类的细粒度创建权限置灰（PRD §11:Member 仅可建常规 Key 护栏）
                const denied = isCreating && !canCreateScope[s]
                return {
                  value: s,
                  label: t('guardrails.label.scopeGuardrail', { scope: t(SCOPE_LABEL_KEY[s]) }),
                  disabled: denied,
                  title: denied ? t('guardrails.form.noCreateScopePermission', { scope: t(SCOPE_LABEL_KEY[s]) }) : undefined,
                }
              })}
          />
        </div>
      )}
      {isCreating && scope !== 'global' && (
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">{t('guardrails.form.kindLabel')}<span className="text-mg-danger ml-1">*</span></label>
          <SegGroup
            value={kind}
            onChange={(v) => onKindChange(v)}
            disabled={lockScopeKind || !canEditInfo}
            ariaLabel={t('guardrails.form.kindLabel')}
            track="guardrails:field_kind"
            options={(['regular', 'boost'] as GuardrailKind[]).map((k) => {
              // 创建态:无提额创建权限则「提额」置灰（PRD §11:Member 不可建提额）
              const denied = isCreating && k === 'boost' && !canCreateBoost
              return {
                value: k,
                label: t('guardrails.label.kindGuardrail', { kind: t(KIND_LABEL_KEY[k]) }),
                disabled: denied,
                title: denied ? t('guardrails.form.noCreateBoostPermission') : undefined,
              }
            })}
          />
        </div>
      )}
      {/* section 标题（对齐 PRD GuardrailCreateModal：全局护栏 / 个人护栏 / Key 护栏，位于分类/类型之后、规则之前） */}
      {isCreating && <h4 className="text-sm font-bold text-mg-text-1">{t('guardrails.label.scopeGuardrail', { scope: t(SCOPE_LABEL_KEY[scope]) })}</h4>}
      {/* 创建态插槽：绑定对象 + 预算（对齐原型：分类/类型之后、规则之前） */}
      {budgetSlot}
      {/* 提额到期时间 — 仅提额护栏显示（文档：提额必须有到期时间） */}
      {kind === 'boost' && scope !== 'global' && (
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">
            {t('guardrails.form.boostExpiresAtLabel')}<span className="text-mg-danger ml-1">*</span>
          </label>
          <Input
            type="datetime-local"
            aria-label={t('guardrails.form.boostExpiresAtLabel')}
            value={boostExpiresAt}
            disabled={!canEditInfo}
            onChange={(e) => onBoostExpiresAtChange(e.target.value)}
          />
        </div>
      )}
      {/* 模型黑名单 — 仅全局 / 常规 Key 护栏显示（个人、提额护栏不配置） */}
      {showModelIp && (
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">{t('guardrails.form.modelBlacklistLabel')}</label>
          <TagInput
            value={modelBlacklist}
            disabled={!canEditInfo}
            onChange={onModelBlacklistChange}
            suggestions={modelSuggestions}
            placeholder={t('guardrails.form.modelBlacklistPlaceholder')}
          />
        </div>
      )}
      {/* IP 白名单 — 自由输入标签（同上，个人/提额护栏不配置） */}
      {showModelIp && (
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">{t('guardrails.form.ipWhitelistLabel')}</label>
          <TagInput
            value={ipWhitelist}
            disabled={!canEditInfo}
            onChange={(v) => { setIpError(''); onIpWhitelistChange(v) }}
            allowFreeText
            tagVariant="mono"
            validator={ipValidator}
            onValidationError={() => {
              setIpError(t('guardrails.form.invalidIp'))
              setTimeout(() => setIpError(''), 3000)
            }}
            placeholder={t('guardrails.form.ipWhitelistPlaceholder')}
          />
          {ipError && <p className="text-xs text-mg-danger mt-1">{ipError}</p>}
        </div>
      )}
      {/* 提示词注入检测 — 仅全局/常规 Key 护栏显示；info 图标说明命中后的处理方式 */}
      {showPromptInjection && (
        <div>
          <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-mg-text-2">
            {t('guardrails.promptInjection.label')}
            <span className="group relative inline-flex">
              <button
                type="button"
                aria-label={t('guardrails.promptInjection.hitBehavior')}
                className="inline-flex text-mg-text-3 outline-none transition-colors hover:text-mg-text-2 focus-visible:text-mg-text-2"
              >
                <LuInfo className="h-3.5 w-3.5" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-0 top-6 z-[var(--mg-z-tooltip)] w-[280px] rounded-[var(--mg-tooltip-radius)] mg-float p-[var(--mg-popover-pad)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <span className="mb-1.5 block text-[11px] font-bold text-mg-text-1">{t('guardrails.promptInjection.hitBehavior')}</span>
                {PROMPT_INJECTION_HINTS.map((h) => (
                  <span key={h.mode} className="mt-1 flex gap-1.5 text-[10px]">
                    <span className="shrink-0 font-bold text-mg-text-2">{t(PROMPT_INJECTION_LABEL_KEY[h.mode])}</span>
                    <span className="font-medium leading-snug text-mg-text-3">{t(PROMPT_INJECTION_HINT_KEY[h.mode])}</span>
                  </span>
                ))}
              </span>
            </span>
          </label>
          <Select value={promptInjectionMode} disabled={!canEditInfo} onChange={(v) => onPromptInjectionModeChange(v as PromptInjectionFormValue)} className="w-full">
            {allowPromptInjectionInherit && (
              <SelectItem value={PROMPT_INJECTION_INHERIT}>{t(PROMPT_INJECTION_INHERIT_LABEL_KEY)}</SelectItem>
            )}
            {PROMPT_INJECTION_MODES.map((m) => (
              <SelectItem key={m} value={m}>{t(PROMPT_INJECTION_LABEL_KEY[m])}</SelectItem>
            ))}
          </Select>
        </div>
      )}
      {/* 成员 — 下拉多选（仅个人护栏绑定成员；全局/Key 护栏不在此绑定）。
          创建态由外部 budgetSlot 统一渲染绑定(保证顺序:绑定→预算),故此处仅编辑态。 */}
      {scope === 'member' && !isCreating && (
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">
            <span className="inline-flex items-center gap-1.5">
              <LuUsers className="w-3.5 h-3.5" />
              {t('guardrails.form.membersLabel')}
            </span>
          </label>
          <TagInput
            value={memberIds}
            disabled={!canEditAssignment}
            onChange={onMemberIdsChange}
            options={memberOptions.map((o) => ({ value: o.id, label: o.name }))}
            placeholder={t('guardrails.form.membersPlaceholder')}
            hint={t('guardrails.form.membersHint')}
          />
        </div>
      )}
    </div>
  )
}
