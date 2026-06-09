import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { TagInput } from '@/components/ui/TagInput'
import { LuUsers } from 'react-icons/lu'

// ─── 公共：表单字段组件（创建/编辑复用） ──────────────────────────────────────

export function GuardrailFormFields({
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
          <label className="block text-xs font-bold text-mg-text-1 mb-2">{t('guardrails.form.nameLabel')}<span className="text-mg-danger ml-1">*</span></label>
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
