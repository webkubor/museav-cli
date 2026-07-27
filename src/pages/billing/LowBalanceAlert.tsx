import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/Switch'
import { Popover } from '@/components/ui/Popover'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { useBalance } from '@/hooks/use-balance'
import { listTenantMembers } from '@/services/tenants'
import { storageKeys } from '@/lib/storage'
import { cn } from '@/lib/utils'

/**
 * 低余额提醒（PRD 1.0.4 §8.5，续 #530）。
 * TODO(#528): 后端写接口 PATCH /tenants/{id}/billing/low-balance-alert 交付前，
 * 配置只落 localStorage（按租户隔离），UI 先按 PRD/原型对齐；接口交付后
 * 把 loadConfig/saveConfig 换成真实请求即可，组件本身不用改。
 */
interface StoredConfig {
  enabled: boolean
  threshold: string
  recipientIds: string[]
}

function loadConfig(tenantId: string, defaultThreshold: string): StoredConfig {
  try {
    const raw = localStorage.getItem(storageKeys.billingLowBalanceAlert(tenantId))
    if (raw) return JSON.parse(raw) as StoredConfig
  } catch {
    // 忽略损坏的本地存储，回退默认值
  }
  return { enabled: true, threshold: defaultThreshold, recipientIds: [] }
}

function saveConfig(tenantId: string, config: StoredConfig) {
  localStorage.setItem(storageKeys.billingLowBalanceAlert(tenantId), JSON.stringify(config))
}

export function LowBalanceAlert({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { isEnterprise } = useTenantRole()
  const { data: balance } = useBalance(tenantId)

  const [config, setConfig] = useState<StoredConfig | null>(null)

  // 候选通知人：仅企业租户需要，成员里筛 tenant_owner/tenant_admin（PRD §8.5）
  const { data: membersPage } = useQuery({
    queryKey: ['tenants', 'members', tenantId, 'owner-admin-candidates'],
    queryFn: () => listTenantMembers(tenantId, { page_size: 100 }),
    enabled: Boolean(tenantId) && isEnterprise,
    staleTime: 60_000,
  })
  const candidates = useMemo(
    () => (membersPage?.items ?? []).filter((m) => m.role === 'tenant_owner' || m.role === 'tenant_admin'),
    [membersPage],
  )

  useEffect(() => {
    if (!tenantId) return
    const defaultThreshold = balance?.low_balance_threshold?.amount ?? '1000'
    // 仅首次挂载/切租户时从 localStorage/余额接口取初始值，避免余额轮询把用户正在编辑的阈值覆盖
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig((prev) => prev ?? loadConfig(tenantId, defaultThreshold))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  // 企业租户：开启时至少保留 1 个有效通知人，且只能是当前候选里的 Owner/Admin（角色变化后自动剔除失效项）
  useEffect(() => {
    if (!config || !isEnterprise || candidates.length === 0) return
    const validIds = new Set(candidates.map((m) => m.account.account_id))
    const stillValid = config.recipientIds.filter((id) => validIds.has(id))
    if (stillValid.length !== config.recipientIds.length) {
      const next = { ...config, recipientIds: stillValid.length > 0 ? stillValid : [candidates[0].account.account_id] }
      // 候选人列表变化（成员离职/降级）后回退失效通知人，属于外部数据同步，非用户交互触发
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfig(next)
      saveConfig(tenantId, next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates])

  if (!config) return null

  const update = (patch: Partial<StoredConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    saveConfig(tenantId, next)
  }

  const toggleRecipient = (accountId: string) => {
    const has = config.recipientIds.includes(accountId)
    // 企业租户开启提醒时至少保留 1 个通知人，不允许移除最后一个
    if (has && config.enabled && config.recipientIds.length <= 1) return
    update({
      recipientIds: has
        ? config.recipientIds.filter((id) => id !== accountId)
        : [...config.recipientIds, accountId],
    })
  }

  const selectedNames = candidates
    .filter((m) => config.recipientIds.includes(m.account.account_id))
    .map((m) => m.account.display_name)

  return (
    <div className="billing-low-balance rounded-lg border border-mg-border bg-card-bg p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm font-bold text-mg-text-1">{t('billing.lowBalance.title', { defaultValue: '低余额提醒' })}</div>
          <p className="text-xs text-mg-text-3">
            {t('billing.lowBalance.desc', { defaultValue: '余额低于阈值时接收提醒，避免服务调用受到影响。' })}
          </p>
        </div>

        <div className="billing-low-balance-controls flex items-center gap-3 flex-wrap">
          {isEnterprise && (
            <Popover
              trigger={
                <button
                  type="button"
                  disabled={!config.enabled}
                  className={cn(
                    'billing-low-balance-recipient flex items-center gap-1.5 h-9 px-3 rounded-md border border-mg-border text-xs font-semibold text-mg-text-2 hover:bg-mg-fill-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <span className="text-mg-text-3">{t('billing.lowBalance.recipients', { defaultValue: '通知人' })}</span>
                  <span className="text-mg-text-1 max-w-[140px] truncate">
                    {selectedNames.length > 0 ? selectedNames.join('、') : '—'}
                  </span>
                </button>
              }
              content={
                <div className="p-2 w-56 space-y-0.5">
                  {candidates.map((m) => (
                    <label
                      key={m.account.account_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-mg-fill-0 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={config.recipientIds.includes(m.account.account_id)}
                        onChange={() => toggleRecipient(m.account.account_id)}
                        className="h-4 w-4 rounded-sm border-mg-border accent-brand-base"
                      />
                      <span className="flex-1 truncate text-mg-text-1">{m.account.display_name}</span>
                      <span className="text-xs text-mg-text-3">{m.role === 'tenant_owner' ? 'Owner' : 'Admin'}</span>
                    </label>
                  ))}
                  {candidates.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-mg-text-3">{t('billing.lowBalance.noCandidates', { defaultValue: '暂无可选通知人' })}</p>
                  )}
                </div>
              }
            />
          )}

          <div className="billing-low-balance-threshold flex items-center gap-1.5 h-9 px-3 rounded-md border border-mg-border">
            <span className="text-xs text-mg-text-3">{t('billing.lowBalance.threshold', { defaultValue: '提醒阈值' })}</span>
            <span className="text-xs text-mg-text-3">¥</span>
            <input
              type="number"
              min="0"
              disabled={!config.enabled}
              value={config.threshold}
              onChange={(e) => update({ threshold: e.target.value })}
              className="w-16 bg-transparent text-xs font-semibold text-mg-text-1 outline-none disabled:opacity-50"
            />
          </div>

          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => update({ enabled })}
            aria-label={t('billing.lowBalance.toggle', { defaultValue: '低余额提醒开关' })}
          />
        </div>
      </div>
    </div>
  )
}
