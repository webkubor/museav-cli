import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/Switch'
import { Popover } from '@/components/ui/Popover'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { listTenantMembers } from '@/services/tenants'
import { getLowBalanceAlert, updateLowBalanceAlert, type SetLowBalanceAlertRequest } from '@/services/billing'
import { currencySymbol, isZhLang } from '@/features/models/model-format'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/track'
import { amountBand } from './billing-tracking'

/**
 * 低余额提醒（PRD 1.0.4 §8.5，续 #530）。
 * 后端接口已交付（qa#528）：GET/PATCH /tenants/:id/billing/low-balance-alert，
 * 三态更新——字段缺省=不动那部分配置，出现=整体替换。之前这里只落 localStorage
 * （当时后端未交付），2026-07-29 实测接口已上线，改回真实请求。
 */
export function LowBalanceAlert({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const { isEnterprise } = useTenantRole()
  const queryClient = useQueryClient()

  const alertQueryKey = ['billing', 'low-balance-alert', tenantId]
  const { data: alert, isLoading } = useQuery({
    queryKey: alertQueryKey,
    queryFn: () => getLowBalanceAlert(tenantId),
    enabled: Boolean(tenantId),
  })

  // 阈值输入框草稿：编辑中不能被 refetch/轮询打断，仅在阈值来源变化（切租户/首次加载/
  // 保存成功后端回填）时才同步，用户正在打字时不会被覆盖。
  const [thresholdDraft, setThresholdDraft] = useState('')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (alert) setThresholdDraft(alert.threshold?.amount ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.threshold?.amount, tenantId])

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

  const mutation = useMutation({
    mutationFn: (body: SetLowBalanceAlertRequest) => updateLowBalanceAlert(tenantId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(alertQueryKey, data)
    },
    // 需求方#427：带上后端具体报错——只弹笼统「保存失败」时，用户会把接口报错当成「开关坏了」
    onError: (err: Error) => {
      appToast.requestError(err, t('billing.lowBalance.saveFailed'))
    },
  })

  if (isLoading || !alert) return null

  const toggleRecipient = (accountId: string) => {
    const has = alert.recipient_account_ids.includes(accountId)
    // 企业租户开启提醒时至少保留 1 个通知人，不允许移除最后一个
    if (has && alert.enabled && alert.recipient_account_ids.length <= 1) return
    const nextRecipientIds = has
      ? alert.recipient_account_ids.filter((id) => id !== accountId)
      : [...alert.recipient_account_ids, accountId]
    mutation.mutate({ recipient_account_ids: nextRecipientIds })
    trackEvent('billing_low_balance_recipients_update', {
      recipient_count: nextRecipientIds.length,
      result: 'success',
    })
  }

  const selectedNames = candidates
    .filter((m) => alert.recipient_account_ids.includes(m.account.account_id))
    .map((m) => m.account.display_name)

  return (
    <div className="billing-low-balance rounded-lg border border-mg-border bg-card-bg p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm font-bold text-mg-text-1">{t('billing.lowBalance.title')}</div>
          <p className="text-xs text-mg-text-3">
            {t('billing.lowBalance.desc')}
          </p>
        </div>

        {/* qa#278：内部两个 chip（通知人/提醒阈值）不能拆散换行——原型是同排展示；
            之前 flex-wrap 会在通知人 chip 较长（如测试账号全名）时把两个 chip 拆成
            两行。真的放不下就让整个 controls 块换到标题下方（外层 flex-wrap 管），
            内部这里改 nowrap + shrink-0 保证两个 chip 始终同排。 */}
        <div className="billing-low-balance-controls flex items-center gap-3 flex-nowrap shrink-0">
          {isEnterprise && (
            <Popover
              trigger={
                <button
                  type="button"
                  disabled={!alert.enabled}
                  className={cn(
                    'billing-low-balance-recipient flex shrink-0 items-center gap-1.5 h-9 px-3 rounded-md border border-mg-border text-xs font-semibold text-mg-text-2 hover:bg-mg-fill-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <span className="whitespace-nowrap text-mg-text-3">{t('billing.lowBalance.recipients')}</span>
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
                        checked={alert.recipient_account_ids.includes(m.account.account_id)}
                        onChange={() => toggleRecipient(m.account.account_id)}
                        className="h-4 w-4 rounded-sm border-mg-border accent-brand-base"
                      />
                      <span className="flex-1 truncate text-mg-text-1">{m.account.display_name}</span>
                      <span className="text-xs text-mg-text-3">{m.role === 'tenant_owner' ? 'Owner' : 'Admin'}</span>
                    </label>
                  ))}
                  {candidates.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-mg-text-3">{t('billing.lowBalance.noCandidates')}</p>
                  )}
                </div>
              }
            />
          )}

          <div className="billing-low-balance-threshold flex items-center gap-1.5 h-9 px-3 rounded-md border border-mg-border shrink-0">
            {/* qa#278 二轮反馈：容器变窄时标签文字会逐字换行，缺 nowrap 保护 */}
            <span className="whitespace-nowrap text-xs text-mg-text-3">{t('billing.lowBalance.threshold')}</span>
            {/* 阈值币种取接口 threshold.currency（#372：此前写死 ¥，国际站也显示人民币符号） */}
            <span className="text-xs text-mg-text-3">{currencySymbol(alert.threshold?.currency, isZhLang())}</span>
            <input
              type="number"
              min="0"
              disabled={!alert.enabled}
              value={thresholdDraft}
              onChange={(e) => setThresholdDraft(e.target.value)}
              onBlur={() => {
                if (!thresholdDraft.trim() || thresholdDraft === alert.threshold?.amount) return
                mutation.mutate({ threshold: thresholdDraft })
                // §11.2 billing_low_balance_threshold_update：只在失焦（提交完整值）时上报，避免逐键触发
                trackEvent('billing_low_balance_threshold_update', {
                  threshold_band: amountBand(thresholdDraft),
                  result: 'success',
                })
              }}
              className="w-16 bg-transparent text-xs font-semibold text-mg-text-1 outline-none disabled:opacity-50"
            />
          </div>

          <Switch
            checked={alert.enabled}
            disabled={mutation.isPending}
            onCheckedChange={(enabled) => {
              mutation.mutate({ enabled })
              // §11.2 billing_low_balance_toggle：low_balance_recipient_role_set 依赖后端审计字段，
              // 目前只报前端能拿到的开关/阈值/人数
              trackEvent('billing_low_balance_toggle', {
                enabled,
                threshold_band: amountBand(thresholdDraft),
                low_balance_recipient_count: alert.recipient_account_ids.length,
              })
            }}
            aria-label={t('billing.lowBalance.toggle')}
          />
        </div>
      </div>
    </div>
  )
}
