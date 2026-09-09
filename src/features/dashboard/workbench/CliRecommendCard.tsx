import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { CopyButton } from '@/components/ui/CopyButton'
import { useMarket } from '@/hooks/useMarket'
import { getGatewayEndpoints } from '@/config/gateway'
import { trackEvent } from '@/lib/track'
import { useTrackContext } from '@/hooks/use-track-context'
import { deriveRegionFromBaseUrl, buildMgcInstallCommand } from '@/pages/api-keys/constants'

/**
 * 总览页 CLI 推荐卡（需求方#171 的 PRD FirstRunGuide cli-recommend-card）。
 *
 * ⚠️ 2026-08-27 本文件原名 QuickStartSection，里面是「三步快速开始气泡卡 + CLI 卡」两块。
 * 三步卡已按新手指南规格 §5.1 移除 —— 新手指南的侧栏入口**替代**它，
 * 「避免同一首用路径出现两个入口」；连同它仅限本地的 localStorage 关闭态、
 * 内嵌的 ConnectModal（顶栏「快速接入」是同一个弹窗，不需要第二个渲染点）一起删。
 * CLI 卡是另一条需求，与新手指南无关，原样保留。
 */
export function CliRecommendCard() {
  const { t } = useTranslation()
  const market = useMarket()
  const trackCtx = useTrackContext()

  const gatewayEndpoints = getGatewayEndpoints(market)
  const openAIBaseUrl = gatewayEndpoints[0]?.baseUrl ?? ''
  // CLI 命令用已发布真实包(常量 MGC_PACKAGE)+ 按市场区域,统一走 constants 的 builder,
  // 不在业务代码内联包名/命令字面量(与接入弹窗同包同契约)。
  const cliCommand = buildMgcInstallCommand(deriveRegionFromBaseUrl(openAIBaseUrl))

  return (
    <Card className="p-5">
      {/* 布局对齐 PRD FirstRunGuide cli-recommend-card(需求方#171):
          横排 icon(左) + copy 块(标题行 + 段落),命令内联在段落左侧「在终端运行 <命令> 自动写入…」,
          视觉用控制台 token(非 PRD hex)。 */}
      <div className="mg-tile flex items-center gap-4 p-4">
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
                onCopied={() => trackEvent('overview_onboarding_action_click', { ...trackCtx, action: 'copy_cli' })}
              />
            </span>
            {t('dashboard.workbench.quickStart.cliHintSuffix')}
          </p>
        </div>
      </div>
    </Card>
  )
}
