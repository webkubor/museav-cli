import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LuKeyRound, LuPlug, LuScrollText, LuArrowRight, LuX, LuZap, LuChevronRight } from 'react-icons/lu'
import { Card } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { useMarket } from '@/hooks/useMarket'
import { getGatewayEndpoints } from '@/config/gateway'
import { trackEvent } from '@/lib/track'
import { useTrackContext } from '@/hooks/use-track-context'
import { useAuthStore } from '@/store/auth'
import { useConnectModalStore } from '@/store/use-connect-modal-store'
import { deriveRegionFromBaseUrl, buildMgcInstallCommand } from '@/pages/api-keys/constants'

const DISMISS_KEY = 'modelgo_workbench_quickstart_dismissed'

function scopedWorkspacePath(workspaceId: string | null, path: string) {
  return workspaceId ? `/workspace/${workspaceId}/${path}` : '/workspaces'
}

/**
 * 快速开始气泡（三步）+ CLI 卡；关闭态只存 localStorage，不调后端。
 *
 * 2026-08-27 曾按新手指南规格 §5.1 移除三步卡（本文件当时改名 CliRecommendCard 只留 CLI 卡）；
 * 需求方 prd46#1055 要求恢复「三个按钮 + 可关闭」的版本，2026-09-17 按单还原。
 * 与旧版唯一差异：第 2 步「立即接入」改走 useConnectModalStore 打开顶栏那份全局
 * 快速接入弹窗（§7.3 弹窗本体只在 DashboardHeader 渲染一份），不再内嵌 ConnectModal。
 */
export function QuickStartSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const market = useMarket()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const trackCtx = useTrackContext()
  const openConnectModal = useConnectModalStore((s) => s.open)

  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  if (dismissed) return null

  const gatewayEndpoints = getGatewayEndpoints(market)
  const openAIBaseUrl = gatewayEndpoints[0]?.baseUrl ?? ''
  // CLI 命令用已发布真实包(常量 MGC_PACKAGE)+ 按市场区域,统一走 constants 的 builder,
  // 不在业务代码内联包名/命令字面量(与接入弹窗同包同契约)。
  const cliCommand = buildMgcInstallCommand(deriveRegionFromBaseUrl(openAIBaseUrl))

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
        openConnectModal()
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
        <div className="min-w-0">
          <h3 className="text-base font-bold text-mg-text-1 m-0">{t('dashboard.workbench.quickStart.title')}</h3>
          <p className="text-xs text-mg-text-3 mt-0.5 m-0">{t('dashboard.workbench.quickStart.subtitle')}</p>
        </div>
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
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-deep to-brand-base text-white shadow-md">
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

      {/* 布局对齐 PRD FirstRunGuide cli-recommend-card(需求方#171):
          横排 icon(左) + copy 块(标题行 + 段落),命令内联在段落左侧「在终端运行 <命令> 自动写入…」,
          视觉用控制台 token(非 PRD hex)。 */}
      <div className="mg-tile mt-4 flex items-center gap-4 p-4">
        {/* PRD cli-icon:48×48 方形「>_」单色 */}
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-mg-border bg-brand-base/10 font-mono text-base font-extrabold text-brand-base">
          &gt;_
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-base font-bold text-mg-text-1">{t('dashboard.workbench.quickStart.cliTitle')}</span>
            <span className="inline-flex items-center rounded-md border border-brand-base/25 bg-brand-base/10 px-1.5 py-px text-xs font-bold text-brand-base">
              {t('dashboard.workbench.quickStart.cliBadge')}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-mg-text-3">
            {t('dashboard.workbench.quickStart.cliHintPrefix')}
            <span className="mx-1 inline-flex items-center gap-1 rounded-md border border-mg-border bg-mg-bg-0 px-2 py-0.5 align-middle font-mono text-xs text-brand-base">
              <code>{cliCommand}</code>
              <CopyButton
                value={cliCommand}
                aria-label={t('dashboard.workbench.quickStart.copyCliAria')}
                toast={t('dashboard.workbench.quickStart.cliCopied')}
                onCopied={() => trackOnboardingAction('copy_cli')}
              />
            </span>
            {t('dashboard.workbench.quickStart.cliHintSuffix')}
          </p>
        </div>
      </div>
    </Card>
  )
}
