import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/Input'
import { TagInput } from '@/components/ui/TagInput'
import Select, { SelectItem } from '@/components/ui/Select'
import { LuInfo, LuUsers } from 'react-icons/lu'
import {
  KIND_LABEL,
  PROMPT_INJECTION_HINTS,
  PROMPT_INJECTION_INHERIT,
  PROMPT_INJECTION_INHERIT_LABEL,
  PROMPT_INJECTION_LABEL,
  PROMPT_INJECTION_MODES,
  SCOPE_LABEL,
  type GuardrailKind,
  type GuardrailScope,
  type PromptInjectionFormValue,
} from '../derive'

// ─── 公共：表单字段组件（创建/编辑复用） ──────────────────────────────────────

export function GuardrailFormFields({
  name, onNameChange,
  description, onDescriptionChange,
  priority, onPriorityChange,
  // 分类（全局/个人/Key）+ 类型（常规/提额）显式选择，替代旧 isDefault 反推
  scope, onScopeChange,
  kind, onKindChange,
  lockScopeKind,
  showMemberScope,
  boostExpiresAt, onBoostExpiresAtChange,
  showModelIp,
  modelBlacklist, onModelBlacklistChange,
  ipWhitelist, onIpWhitelistChange,
  promptInjectionMode, onPromptInjectionModeChange,
  showPromptInjection, allowPromptInjectionInherit,
  modelSuggestions,
  memberIds, onMemberIdsChange, memberOptions,
  canEditInfo, canEditAssignment,
}: {
  name: string; onNameChange: (v: string) => void
  description: string; onDescriptionChange: (v: string) => void
  priority: number; onPriorityChange: (v: number) => void
  /** 护栏分类：显式选择，创建后不可改（编辑锁定） */
  scope: GuardrailScope; onScopeChange: (v: GuardrailScope) => void
  /** 护栏类型：常规 / 提额；全局护栏恒常规、无此选择器 */
  kind: GuardrailKind; onKindChange: (v: GuardrailKind) => void
  /** 编辑态：分类/类型不可切换（文档：提额创建后类型不可切换） */
  lockScopeKind: boolean
  /** 个人组织隐藏「个人」分类选项 */
  showMemberScope: boolean
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">{t('guardrails.form.nameLabel')}<span className="text-mg-danger ml-1">*</span></label>
          <Input value={name} disabled={!canEditInfo} onChange={(e) => onNameChange(e.target.value)} placeholder={t('guardrails.form.namePlaceholder')} />
        </div>
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">{t('guardrails.form.priorityLabel')}</label>
          <Input type="number" value={priority} disabled={!canEditInfo} onChange={(e) => onPriorityChange(Number(e.target.value))} placeholder={t('guardrails.form.priorityPlaceholder')} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-mg-text-2 mb-2">{t('guardrails.form.descLabel')}</label>
        <Input value={description} disabled={!canEditInfo} onChange={(e) => onDescriptionChange(e.target.value)} placeholder={t('guardrails.form.descPlaceholder')} />
      </div>
      {/* 分类 + 类型 — 显式选择（文档：创建时显式选「分类+类型」，非靠 isDefault/assignments 反推）。
          全局护栏恒为常规、无类型选择器；编辑态整体锁定（提额创建后类型不可切换）。 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">
            护栏分类<span className="text-mg-danger ml-1">*</span>
          </label>
          <Select
            value={scope}
            onChange={(v) => onScopeChange(v as GuardrailScope)}
            disabled={lockScopeKind || !canEditInfo}
            aria-label="护栏分类"
            className="w-full"
          >
            {(['global', 'member', 'key'] as GuardrailScope[])
              .filter((s) => s !== 'member' || showMemberScope)
              .map((s) => (
                <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}护栏</SelectItem>
              ))}
          </Select>
          <p className="text-xs text-mg-text-3 mt-1.5">
            {scope === 'global'
              ? '工作空间级默认策略与预算/模型/IP 边界'
              : scope === 'member'
                ? '按成员计量的预算策略，可绑定多位成员'
                : '按 API Key 计量的策略，可绑定多把 Key'}
          </p>
        </div>
        {scope !== 'global' && (
          <div>
            <label className="block text-xs font-bold text-mg-text-2 mb-2">
              护栏类型<span className="text-mg-danger ml-1">*</span>
            </label>
            <Select
              value={kind}
              onChange={(v) => onKindChange(v as GuardrailKind)}
              disabled={lockScopeKind || !canEditInfo}
              aria-label="护栏类型"
              className="w-full"
            >
              {(['regular', 'boost'] as GuardrailKind[]).map((k) => (
                <SelectItem key={k} value={k}>{KIND_LABEL[k]}护栏</SelectItem>
              ))}
            </Select>
            <p className="text-xs text-mg-text-3 mt-1.5">
              {kind === 'boost' ? '临时预算策略，必须设置到期时间，可超过全局默认' : '长期预算策略，无到期时间'}
            </p>
          </div>
        )}
      </div>
      {/* 提额到期时间 — 仅提额护栏显示（文档：提额必须有到期时间） */}
      {kind === 'boost' && scope !== 'global' && (
        <div>
          <label className="block text-xs font-bold text-mg-text-2 mb-2">
            提额到期时间<span className="text-mg-danger ml-1">*</span>
          </label>
          <Input
            type="datetime-local"
            aria-label="提额到期时间"
            value={boostExpiresAt}
            disabled={!canEditInfo}
            onChange={(e) => onBoostExpiresAtChange(e.target.value)}
          />
          <p className="text-xs text-mg-text-3 mt-1.5">到期后该提额自动失效，绑定对象回退到常规护栏或全局默认预算</p>
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
            hint={t('guardrails.form.modelBlacklistHint')}
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
              setIpError('无效的 IP 地址格式')
              setTimeout(() => setIpError(''), 3000)
            }}
            placeholder={t('guardrails.form.ipWhitelistPlaceholder')}
            hint={t('guardrails.form.ipWhitelistHint')}
          />
          {ipError && <p className="text-xs text-mg-danger mt-1">{ipError}</p>}
        </div>
      )}
      {/* 提示词注入检测 — 仅全局/常规 Key 护栏显示；info 图标说明命中后的处理方式 */}
      {showPromptInjection && (
        <div>
          <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-mg-text-2">
            提示词注入检测
            <span className="group relative inline-flex">
              <button
                type="button"
                aria-label="命中后的处理方式"
                className="inline-flex text-mg-text-3 outline-none transition-colors hover:text-mg-text-2 focus-visible:text-mg-text-2"
              >
                <LuInfo className="h-3.5 w-3.5" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-0 top-6 z-20 w-[280px] rounded-md border border-mg-border bg-mg-bg-0 p-3 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <span className="mb-1.5 block text-[11px] font-bold text-mg-text-1">命中后的处理方式</span>
                {PROMPT_INJECTION_HINTS.map((h) => (
                  <span key={h.mode} className="mt-1 flex gap-1.5 text-[10px]">
                    <span className="shrink-0 font-bold text-mg-text-2">{PROMPT_INJECTION_LABEL[h.mode]}</span>
                    <span className="font-medium leading-snug text-mg-text-3">{h.text}</span>
                  </span>
                ))}
              </span>
            </span>
          </label>
          <Select value={promptInjectionMode} disabled={!canEditInfo} onChange={(v) => onPromptInjectionModeChange(v as PromptInjectionFormValue)} className="w-full">
            {allowPromptInjectionInherit && (
              <SelectItem value={PROMPT_INJECTION_INHERIT}>{PROMPT_INJECTION_INHERIT_LABEL}</SelectItem>
            )}
            {PROMPT_INJECTION_MODES.map((m) => (
              <SelectItem key={m} value={m}>{PROMPT_INJECTION_LABEL[m]}</SelectItem>
            ))}
          </Select>
        </div>
      )}
      {/* 成员 — 下拉多选（仅个人护栏绑定成员；全局/Key 护栏不在此绑定） */}
      {scope === 'member' && (
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
