import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LuKeyRound, LuPlug, LuScrollText, LuArrowRight, LuX, LuSquareTerminal, LuZap, LuChevronRight } from 'react-icons/lu'
import { Card } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { useMarket } from '@/hooks/useMarket'
import { getMarketConfig } from '@/config/market'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { trackEvent } from '@/lib/track'
import { useTrackContext } from '@/hooks/use-track-context'
import { useAuthStore } from '@/store/auth'
import { ConnectModal } from '@/pages/api-keys/ConnectModal'

const DISMISS_KEY = 'modelgo_workbench_quickstart_dismissed'
const CLI_COMMAND = 'npx @model-go/cli@latest install'

function scopedWorkspacePath(workspaceId: string | null, path: string) {
  return workspaceId ? `/workspace/${workspaceId}/${path}` : '/workspaces'
}

/**
 * 模块 2：快速开始气泡（三步）+ CLI 卡；关闭态只存 localStorage，不调后端。
 * 第 2 步「立即接入」拉起 ConnectModal（模块 3，总览内轻量弹窗，不改路由、不含创建 Key 按钮）。
 */
export function QuickStartSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const market = useMarket()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const trackCtx = useTrackContext()

  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [connectOpen, setConnectOpen] = useState(false)

  if (dismissed) return null

  const docsUrl = getMarketConfig(market).docsUrl
  const openAIBaseUrl = GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''
  const anthropicBaseUrl = GATEWAY_ENDPOINTS[1]?.baseUrl ?? openAIBaseUrl

  const trackOnboardingAction = (action: string, extra?: Record<string, string>) =>
    trackEvent('overview_onboarding_action_click', { ...trackCtx, action, ...extra })

  const handleDismiss = () => {
    // 关闭态仅落 localStorage，不调后端 → dismiss_storage=local
    trackOnboardingAction('dismiss_bubble', { dismiss_storage: 'local' })
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const steps = [
    {
      icon: <LuKeyRound size={22} />,
      title: t('dashboard.workbench.quickStart.step1Title'),
      desc: t('dashboard.workbench.quickStart.step1Desc'),
      action: t('dashboard.workbench.quickStart.step1Action'),
      onClick: () => {
        trackOnboardingAction('create_api_key')
        trackEvent('destination_page_view', { ...trackCtx, destination: '/api-keys' }, { source: 'quickstart' })
        navigate(scopedWorkspacePath(activeWorkspaceId, 'api-keys'))
      },
    },
    {
      icon: <LuPlug size={22} />,
      title: t('dashboard.workbench.quickStart.step2Title'),
      desc: t('dashboard.workbench.quickStart.step2Desc'),
      action: t('dashboard.workbench.quickStart.step2Action'),
      onClick: () => {
        trackOnboardingAction('open_connect_modal')
        setConnectOpen(true)
      },
    },
    {
      icon: <LuScrollText size={22} />,
      title: t('dashboard.workbench.quickStart.step3Title'),
      desc: t('dashboard.workbench.quickStart.step3Desc'),
      action: t('dashboard.workbench.quickStart.step3Action'),
      onClick: () => {
        trackOnboardingAction('view_logs')
        trackEvent('destination_page_view', { ...trackCtx, destination: '/logs' }, { source: 'quickstart' })
        navigate('/logs')
      },
    },
  ]

  return (
    <>
      <Card className="p-5 relative">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t('dashboard.workbench.quickStart.dismiss')}
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-mg-text-3 hover:bg-mg-fill-1 hover:text-mg-text-1 transition-colors cursor-pointer"
        >
          <LuX size={16} />
        </button>

        <div className="mb-5 flex items-center gap-2.5 pr-8">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-base/12 text-brand-base">
            <LuZap size={17} />
          </span>
          <h3 className="text-base font-bold text-mg-text-1 m-0">{t('dashboard.workbench.quickStart.title')}</h3>
          <span className="inline-flex items-center rounded-full bg-brand-base/12 px-2 py-0.5 text-xs font-bold text-brand-base">
            {t('dashboard.workbench.quickStart.stepsBadge')}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-0">
          {steps.map((step, i) => (
            <div key={step.title} className="relative flex items-start gap-3 sm:pr-8">
              {/* 步骤连接线：圆心高度的虚线 + 箭头，指向下一步（最后一步不画） */}
              {i < steps.length - 1 && (
                <div className="pointer-events-none absolute right-1 top-7 hidden items-center sm:flex">
                  <span className="block w-6 border-t border-dashed border-mg-border" />
                  <LuChevronRight size={14} className="-ml-1 text-mg-text-4" />
                </div>
              )}
              <div className="relative shrink-0">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md"
                  style={{ background: 'var(--mg-brand-gradient)' }}
                >
                  {step.icon}
                </span>
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-mg-border bg-mg-bg-0 text-xs font-bold text-mg-text-2 shadow-sm">
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="text-sm font-bold text-mg-text-1">{step.title}</div>
                <div className="mt-1 text-xs leading-5 text-mg-text-3">{step.desc}</div>
                <button
                  type="button"
                  onClick={step.onClick}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-base hover:text-brand-deep cursor-pointer"
                >
                  {step.action}
                  <LuArrowRight size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mg-tile mt-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-base/12 text-brand-base">
              <LuSquareTerminal size={17} />
            </span>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-mg-text-1">{t('dashboard.workbench.quickStart.cliTitle')}</span>
                <span className="inline-flex items-center rounded-full bg-brand-base/12 px-1.5 py-px text-xs font-bold text-brand-base">
                  {t('dashboard.workbench.quickStart.cliBadge')}
                </span>
              </div>
              <span className="text-xs text-mg-text-3">{t('dashboard.workbench.quickStart.cliHint')}</span>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-mg-border bg-mg-bg-0 pl-3 pr-1.5 py-1 font-mono text-xs text-mg-text-1">
            <code>{CLI_COMMAND}</code>
            <CopyButton
              value={CLI_COMMAND}
              aria-label="复制命令"
              toast={t('dashboard.workbench.quickStart.cliCopied')}
              onCopied={() => trackOnboardingAction('copy_cli')}
            />
          </div>
        </div>
      </Card>

      <ConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        openAIBaseUrl={openAIBaseUrl}
        anthropicBaseUrl={anthropicBaseUrl}
        createdKeyText=""
        docsUrl={docsUrl}
      />
    </>
  )
}
