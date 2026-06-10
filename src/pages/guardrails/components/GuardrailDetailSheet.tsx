import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Switch } from '@/components/ui/Switch'
import { SideSheet } from '@/components/ui/SideSheet'
import { Select, SelectItem } from '@/components/ui/Select'
import { TagInput } from '@/components/ui/TagInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import { LuKey, LuDollarSign } from 'react-icons/lu'
import type { GuardrailDetail } from '@/interfaces/guardrails'
import { PERIOD_LABEL } from '@/constants/status'
import { GuardrailFormFields } from './GuardrailFormFields'

const GUARDRAIL_STATUS_MAP: Record<string, StatusConfig> = {
  active: { label: '已启用', variant: 'success' },
  inactive: { label: '已停用', variant: 'secondary' },
}

type PeriodUnit = 'hour' | 'day' | 'week' | 'month'
type BudgetPolicy = NonNullable<GuardrailDetail['budget_policies']>[number]

export function GuardrailDetailSheet({
  open, onClose,
  isCreating,
  detail, detailLoading, detailRow,
  sheetTab, onSheetTabChange,
  onToggleStatus,
  syncFormFromDetail,
  // 基本信息表单
  name, onNameChange,
  description, onDescriptionChange,
  priority, onPriorityChange,
  isDefault, onIsDefaultChange,
  modelBlacklist, onModelBlacklistChange,
  ipWhitelist, onIpWhitelistChange,
  modelSuggestions,
  memberIds, onMemberIdsChange, memberOptions,
  // 作用范围
  apiKeyIds, onApiKeyIdsChange, apiKeyOptions,
  // 预算
  budget, budgetAmount, onBudgetAmountChange,
  budgetPeriodUnit, onBudgetPeriodUnitChange,
  canEditBudget, savingBudget, onSaveBudget, onShowClearBudget,
  currencySymbol,
  // 底部保存
  submitting, onSubmit,
}: {
  open: boolean; onClose: () => void
  isCreating: boolean
  detail: GuardrailDetail | undefined; detailLoading: boolean; detailRow: GuardrailDetail | undefined
  sheetTab: 'info' | 'scope' | 'budget'; onSheetTabChange: (tab: 'info' | 'scope' | 'budget') => void
  onToggleStatus: (args: { id: string; status: 'active' | 'inactive' }) => void
  syncFormFromDetail: (d: GuardrailDetail) => void
  name: string; onNameChange: (v: string) => void
  description: string; onDescriptionChange: (v: string) => void
  priority: number; onPriorityChange: (v: number) => void
  isDefault: boolean; onIsDefaultChange: (v: boolean) => void
  modelBlacklist: string[]; onModelBlacklistChange: (v: string[]) => void
  ipWhitelist: string[]; onIpWhitelistChange: (v: string[]) => void
  modelSuggestions?: string[]
  memberIds: string[]; onMemberIdsChange: (v: string[]) => void; memberOptions: { id: string; name: string }[]
  apiKeyIds: string[]; onApiKeyIdsChange: (v: string[]) => void; apiKeyOptions: { id: string; name: string; active: boolean }[]
  budget: BudgetPolicy | null
  budgetAmount: string; onBudgetAmountChange: (v: string) => void
  budgetPeriodUnit: PeriodUnit; onBudgetPeriodUnitChange: (v: PeriodUnit) => void
  canEditBudget: boolean; savingBudget: boolean; onSaveBudget: () => void; onShowClearBudget: () => void
  currencySymbol: string
  submitting: boolean; onSubmit: () => void
}) {
  const { t } = useTranslation()

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
            onChange={(checked) => onToggleStatus({ id: detail.id, status: checked ? 'active' : 'inactive' })}
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
                onSheetTabChange(tab.key)
                if (tab.key === 'info' && detail) syncFormFromDetail(detail)
                if (tab.key === 'budget' && detail) {
                  const bp = detail.budget_policies?.[0]
                  onBudgetAmountChange(bp?.spend_limit_amount ?? '')
                  onBudgetPeriodUnitChange((bp?.period_unit as PeriodUnit) ?? 'month')
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
              name={name} onNameChange={onNameChange}
              description={description} onDescriptionChange={onDescriptionChange}
              priority={priority} onPriorityChange={onPriorityChange}
              isDefault={isDefault} onIsDefaultChange={onIsDefaultChange}
              modelBlacklist={modelBlacklist} onModelBlacklistChange={onModelBlacklistChange}
              ipWhitelist={ipWhitelist} onIpWhitelistChange={onIpWhitelistChange}
              modelSuggestions={modelSuggestions}
              memberIds={memberIds} onMemberIdsChange={onMemberIdsChange} memberOptions={memberOptions}
            />
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
              {/* API Keys — 下拉多选（与成员一致，id 风格；统一由底部保存） */}
              <section>
                <div className="flex items-center gap-1.5 text-xs font-bold text-mg-text-1 uppercase tracking-wider mb-3">
                  <LuKey className="w-3.5 h-3.5" /> API Keys
                </div>
                <TagInput
                  value={apiKeyIds.map((id) => apiKeyOptions.find((o) => o.id === id)?.name ?? id)}
                  onChange={(names) =>
                    onApiKeyIdsChange(
                      names.map((n) => apiKeyOptions.find((o) => o.name === n)?.id).filter(Boolean) as string[],
                    )
                  }
                  suggestions={apiKeyOptions
                    .filter((o) => o.active && !apiKeyIds.includes(o.id))
                    .map((o) => o.name)}
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
                  onChange={(e) => onBudgetAmountChange(e.target.value)}
                  placeholder="输入限额金额"
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
                      className="text-[11px] text-mg-text-2 hover:text-mg-danger transition-colors cursor-pointer"
                    >
                      清除预算
                    </button>
                  )}
                </div>
              )}
              {budget && (
                <div className="p-3 rounded-lg border border-mg-border bg-mg-fill-0/50 text-xs text-mg-text-1">
                  当前生效：<span className="font-semibold text-brand-base">{currencySymbol}{parseFloat(budget.spend_limit_amount).toLocaleString()} / {PERIOD_LABEL[budget.period_unit]}</span>
                </div>
              )}
            </section>
          ) : null
        )}
      </div>

      {/* 统一底部保存：基本信息 + 作用范围（成员/API Keys）一次保存。
          预算是独立的增删策略，保留其自有按钮。 */}
      {(isCreating || sheetTab !== 'budget') && (
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-mg-border/50 shrink-0">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="brand"
            loading={submitting}
            onClick={onSubmit}
          >
            {isCreating ? t('guardrails.modal.confirmCreate') : t('guardrails.modal.saveEdit')}
          </Button>
        </div>
      )}
    </SideSheet>
  )
}
