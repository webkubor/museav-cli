import React, { useMemo } from 'react'
import { useCopy } from '@/hooks/use-copy'
import { useTranslation } from 'react-i18next'
import { LuArrowRight, LuCheck, LuCopy, LuInfo, LuSparkles, LuTerminal } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import { appToast } from '@/lib/app-toast'
import { useCurrency } from '@/hooks/use-platform-config'
import { useBalance } from '@/hooks/use-balance'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS, type Permission } from '@/config/permissions'
import { CLI_CODE } from '@/features/dashboard/constants/code-snippets'
import { formatFriendlyAmount } from '@/lib/utils'
import { QuickWeb3Icon, type QuickIconType } from './QuickAccessSection'
import './quick-access-section.css'
import './dashboard-top-panel.css'

function scopedWorkspacePath(workspaceId: string | null, path: string) {
  return workspaceId ? `/workspace/${workspaceId}/${path}` : '/dashboard'
}

function parseAmount(amount?: string) {
  if (!amount) return null
  const value = Number.parseFloat(amount)
  return Number.isFinite(value) ? value : null
}

function getCliCommandLine() {
  return CLI_CODE.split('\n').find((line) => line.startsWith('npm install -g modelgo-cli')) ?? 'npm install -g modelgo-cli'
}

export const DashboardTopPanel: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { copy, copied } = useCopy(1400)
  const account = useAuthStore((s) => s.account)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { symbol: currencySymbol } = useCurrency()
  const { hasPermission } = usePermissions()

  const { data: balance } = useBalance(activeTenantId)

  const greetingKey = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'dashboardTop.greeting.morning'
    if (hour < 18) return 'dashboardTop.greeting.afternoon'
    return 'dashboardTop.greeting.evening'
  }, [])

  const displayName = account?.display_name || account?.email || t('dashboardTop.greeting.defaultName')
  const availableAmount = parseAmount(balance?.available.amount)
  const thresholdAmount = parseAmount(balance?.low_balance_threshold.amount)
  const balanceText = availableAmount === null ? t('dashboardTop.status.balanceUnknown') : formatFriendlyAmount(availableAmount, currencySymbol)
  const isLowBalance = availableAmount !== null && thresholdAmount !== null && availableAmount <= thresholdAmount
  const cliCommand = getCliCommandLine()

  const allQuickActions: Array<{ icon: QuickIconType; label: string; path: string; primary?: boolean; permission?: Permission }> = [
    { icon: 'keys',        label: t('dashboardTop.quick.createKey'),   path: scopedWorkspacePath(activeWorkspaceId, 'api-keys'),   primary: true, permission: PERMS.API_KEYS_VIEW },
    { icon: 'usage',       label: t('dashboardTop.quick.recharge'),    path: '/billing',                                           permission: PERMS.BILLING_VIEW },
    { icon: 'observability',label: t('dashboardTop.quick.logs'),       path: '/logs',                                              permission: PERMS.LOGS_VIEW },
    { icon: 'models',      label: t('dashboardTop.quick.models'),      path: '/models/catalog',                                    permission: PERMS.MODELS_VIEW },
    { icon: 'guardrails',  label: t('dashboardTop.quick.guardrails'),  path: scopedWorkspacePath(activeWorkspaceId, 'guardrails'), permission: PERMS.GUARDRAILS_VIEW },
    { icon: 'compare',     label: t('dashboardTop.quick.compare'),     path: '/models/compare',                                    permission: PERMS.MODELS_VIEW },
    { icon: 'workspaces',  label: t('dashboardTop.quick.workspaces'),  path: '/settings/workspace' },
    { icon: 'orgSettings', label: t('dashboardTop.quick.orgSettings'), path: '/settings/organization',                             permission: PERMS.ORG_SETTINGS_EDIT },
  ]

  const quickActions = allQuickActions.filter(
    (a) => !a.permission || hasPermission(a.permission)
  )

  const handleCopy = async () => {
    const ok = await copy(cliCommand)
    if (ok) appToast.success(t('dashboardTop.onboarding.toastCopied'))
    else appToast.error(t('dashboardTop.onboarding.toastCopyFailed'))
  }

  return (
    <section className="dashboard-top-panel" aria-labelledby="dashboard-top-title">
      <div className="dashboard-top-greeting">
        <div className="dashboard-top-greeting-copy">
          <h1 id="dashboard-top-title" className="flex items-center gap-2 flex-wrap">
            <span>{t(greetingKey, { name: displayName })}</span>
            <span className="waving-hand" role="img" aria-label="waving hand">👋</span>
          </h1>
          <p>{t('dashboardTop.greeting.desc')}</p>
        </div>
        <span className="dashboard-top-live">
          <span aria-hidden />
          {t('dashboardTop.greeting.liveBadge')}
        </span>
      </div>

      <div className="dashboard-top-cards">
      <div className="dashboard-top-status" data-tone={isLowBalance ? 'warning' : 'normal'}>
        <span className="dashboard-top-status-mark" aria-hidden>
          <LuInfo size={18} />
        </span>
        <div className="dashboard-top-status-copy">
          <strong>{t(isLowBalance ? 'dashboardTop.status.lowTitle' : 'dashboardTop.status.normalTitle')}</strong>
          <p>
            {t(isLowBalance ? 'dashboardTop.status.lowDesc' : 'dashboardTop.status.normalDesc', {
              amount: balanceText,
            })}
          </p>
        </div>
        <button type="button" className="dashboard-top-secondary-action" onClick={() => navigate('/billing')}>
          {t(isLowBalance ? 'dashboardTop.status.rechargeAction' : 'dashboardTop.status.billingAction')}
          <LuArrowRight size={14} />
        </button>
      </div>

      <div className="dashboard-top-guide">
        <span className="dashboard-top-guide-icon" aria-hidden>
          <LuTerminal size={20} />
        </span>
        <div className="dashboard-top-guide-copy">
          <div className="dashboard-top-guide-title">
            <h2>{t('dashboardTop.onboarding.title')}</h2>
            <span>
              <LuSparkles size={12} />
              {t('dashboardTop.onboarding.recommended')}
            </span>
          </div>
          <p>{t('dashboardTop.onboarding.desc')}</p>
          <button type="button" className="dashboard-top-command" onClick={handleCopy}>
            <code>{cliCommand}</code>
            {copied ? <LuCheck size={15} /> : <LuCopy size={15} />}
          </button>
        </div>
        <button type="button" className="dashboard-top-secondary-action" onClick={() => navigate('/models/catalog')}>
          {t('dashboardTop.onboarding.action')}
          <LuArrowRight size={14} />
        </button>
      </div>
      </div>

      <div className="dashboard-top-quick">
        <span className="dashboard-top-quick-label">{t('dashboardTop.quick.label')}</span>
        <div className="dashboard-top-quick-list">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="dashboard-top-quick-button"
              data-primary={action.primary ? 'true' : 'false'}
              onClick={() => navigate(action.path)}
            >
              <span className="dashboard-top-quick-icon">
                <QuickWeb3Icon type={action.icon} />
              </span>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
