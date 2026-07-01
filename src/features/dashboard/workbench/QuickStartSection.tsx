import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LuKeyRound, LuPlug, LuScrollText, LuArrowRight, LuCopy, LuCheck, LuX, LuTerminal } from 'react-icons/lu'
import { Card } from '@/components/ui/Card'
import { useCopy } from '@/hooks/use-copy'
import { useMarket } from '@/hooks/useMarket'
import { getMarketConfig } from '@/config/market'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { appToast } from '@/lib/app-toast'
import { useAuthStore } from '@/store/auth'
import { ConnectModal } from '@/pages/api-keys/ConnectModal'

const DISMISS_KEY = 'modelgo_workbench_quickstart_dismissed'
const CLI_COMMAND = 'npx @model-go/cli@latest install'

function scopedWorkspacePath(workspaceId: string | null, path: string) {
  return workspaceId ? `/workspace/${workspaceId}/${path}` : '/settings/workspace'
}

/**
 * 模块 2：快速开始气泡（三步）+ CLI 卡；关闭态只存 localStorage，不调后端。
 * 第 2 步「立即接入」拉起 ConnectModal（模块 3，总览内轻量弹窗，不改路由、不含创建 Key 按钮）。
 */
export function QuickStartSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { copy, copied } = useCopy(1400)
  const market = useMarket()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [connectOpen, setConnectOpen] = useState(false)

  if (dismissed) return null

  const docsUrl = getMarketConfig(market).docsUrl
  const openAIBaseUrl = GATEWAY_ENDPOINTS[0]?.baseUrl ?? ''
  const anthropicBaseUrl = GATEWAY_ENDPOINTS[1]?.baseUrl ?? openAIBaseUrl

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  const handleCliCopy = async () => {
    const ok = await copy(CLI_COMMAND)
    if (ok) appToast.success(t('dashboard.workbench.quickStart.cliCopied'))
    else appToast.error(t('dashboard.workbench.quickStart.cliCopyFailed'))
  }

  const steps = [
    {
      icon: <LuKeyRound size={18} />,
      title: t('dashboard.workbench.quickStart.step1Title'),
      desc: t('dashboard.workbench.quickStart.step1Desc'),
      action: t('dashboard.workbench.quickStart.step1Action'),
      onClick: () => navigate(scopedWorkspacePath(activeWorkspaceId, 'api-keys')),
    },
    {
      icon: <LuPlug size={18} />,
      title: t('dashboard.workbench.quickStart.step2Title'),
      desc: t('dashboard.workbench.quickStart.step2Desc'),
      action: t('dashboard.workbench.quickStart.step2Action'),
      onClick: () => setConnectOpen(true),
    },
    {
      icon: <LuScrollText size={18} />,
      title: t('dashboard.workbench.quickStart.step3Title'),
      desc: t('dashboard.workbench.quickStart.step3Desc'),
      action: t('dashboard.workbench.quickStart.step3Action'),
      onClick: () => navigate('/logs'),
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

        <div className="mb-4 pr-8">
          <h3 className="text-base font-bold text-mg-text-1 m-0">{t('dashboard.workbench.quickStart.title')}</h3>
          <p className="text-xs text-mg-text-3 mt-1 m-0">{t('dashboard.workbench.quickStart.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.title} className="flex flex-col rounded-lg border border-mg-border bg-mg-fill-0 p-4">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-md text-white shadow-sm"
                  style={{ background: 'var(--mg-brand-gradient)' }}
                >
                  {step.icon}
                </span>
                <span className="text-xs font-mono font-bold text-mg-text-3">{`0${i + 1}`}</span>
              </div>
              <div className="mt-3 flex-1">
                <div className="text-sm font-bold text-mg-text-1">{step.title}</div>
                <div className="mt-1 text-xs leading-5 text-mg-text-3">{step.desc}</div>
              </div>
              <button
                type="button"
                onClick={step.onClick}
                className="mt-3 inline-flex items-center gap-1 self-start text-xs font-bold text-brand-base hover:text-brand-deep cursor-pointer"
              >
                {step.action}
                <LuArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-mg-border bg-mg-fill-0 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-mg-text-3">
            <LuTerminal size={14} className="shrink-0" />
            <span>{t('dashboard.workbench.quickStart.cliHint')}</span>
          </div>
          <button
            type="button"
            onClick={handleCliCopy}
            className="inline-flex items-center gap-2 rounded-md border border-mg-border bg-mg-bg-0 px-3 py-1.5 font-mono text-xs text-mg-text-1 hover:border-brand-base/35 transition-colors cursor-pointer"
          >
            <code>{CLI_COMMAND}</code>
            {copied ? <LuCheck size={14} className="text-mg-success" /> : <LuCopy size={14} />}
          </button>
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
