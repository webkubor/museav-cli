/**
 * 接入中心卡：协议地址快捷复制 + 接入方式入口 + 新建密钥成功展示横幅
 */
import { useState } from 'react'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'
import { Button } from '@/components/ui/Button'
import { useCopy } from '@/hooks/use-copy'
import { appToast } from '@/lib/app-toast'
import { useTranslation } from 'react-i18next'
import {
  LuCopy,
  LuCheck,
  LuX,
  LuKey,
  LuTriangleAlert,
  LuExternalLink,
} from 'react-icons/lu'
import { CONNECT_ACTIONS, formatEndpointDisplay, getGatewayVisual } from './constants'

type Props = {
  docsUrl: string
  onOpenConnect: () => void
  revealVisible: boolean
  createdKeyText: string
  onDismissReveal: () => void
}

export function AccessCenterCard({ docsUrl, onOpenConnect, revealVisible, createdKeyText, onDismissReveal }: Props) {
  const { t } = useTranslation()
  const { copy, copied } = useCopy()
  const [quickCopied, setQuickCopied] = useState<string | null>(null)

  async function handleQuickCopy(key: string, text: string) {
    const ok = await copy(text)
    if (!ok) {
      appToast.error('复制失败，请手动复制')
      return
    }
    setQuickCopied(key)
    setTimeout(() => setQuickCopied(null), 2000)
  }

  async function handleCopyKey(text: string) {
    const ok = await copy(text)
    if (!ok) {
      appToast.error('复制失败，请手动复制')
      return
    }
    appToast.success(t('apiKeys.table.copyMaskedSuccess'))
  }

  return (
    <div className="overflow-hidden rounded-md border border-mg-border bg-mg-bg-0 shadow-sm">
      <div className={`${revealVisible ? 'border-b border-mg-border/45' : ''} px-4 py-3`}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-mg-text-0">接入中心</div>
            <div className="mt-0.5 text-xs text-mg-text-2">复制必要地址，或直接打开工具。</div>
          </div>
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand-base hover:text-brand-deep hover:underline"
          >
            开发文档
            <LuExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="w-full shrink-0 xl:w-[420px]">
            <div className="mb-1.5 text-[11px] font-bold text-mg-text-1">协议地址</div>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
              {GATEWAY_ENDPOINTS.map(({ label, baseUrl: value }, index) => {
                const visual = getGatewayVisual(index)
                return (
                  <button
                    key={label}
                    type="button"
                    title={`复制 ${value}`}
                    onClick={() => handleQuickCopy(label, value)}
                    className={`group flex h-9 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left transition-colors cursor-pointer ${
                      quickCopied === label
                        ? 'bg-mg-success/5 border-mg-success/30'
                        : 'bg-mg-bg-1/55 border-mg-border/70 hover:border-brand-base/40 hover:bg-brand-base/5'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-md bg-mg-bg-0 border border-mg-border flex items-center justify-center shrink-0 text-mg-text-0">
                      {visual.icon}
                    </span>
                    <span className="w-20 shrink-0 text-[11px] font-bold text-mg-text-0">{visual.label}</span>
                    <code className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold text-mg-text-1">
                      {formatEndpointDisplay(value)}
                    </code>
                    <span className={`shrink-0 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                      quickCopied === label ? 'text-mg-success' : 'text-mg-text-2 group-hover:text-brand-base'
                    }`}>
                      {quickCopied === label
                        ? <><LuCheck size={12} /> 已复制</>
                        : <><LuCopy size={12} /> 复制</>}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 text-[11px] font-bold text-mg-text-1">接入方式</div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {CONNECT_ACTIONS.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={onOpenConnect}
                  className="group flex h-8 items-center gap-1.5 rounded-lg border border-mg-border bg-mg-bg-1/55 px-2 text-left transition-colors hover:border-brand-base/40 hover:bg-brand-base/5 cursor-pointer"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-mg-bg-0 border border-mg-border/60 text-mg-text-0">
                    {action.icon}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-bold text-mg-text-0">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {revealVisible && (
        <div className="animate-in fade-in slide-in-from-top-1 bg-mg-success/5 px-4 py-3 duration-300">
          {/* 标题 + 关闭（整行） */}
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-mg-success/15 flex items-center justify-center shrink-0 border border-mg-success/20">
                <LuKey size={15} className="text-mg-success" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-mg-text-0">您的新 API Key 已就绪</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-mg-warning">
                  <LuTriangleAlert size={12} className="shrink-0" />
                  请立即复制并保存，关闭后将无法再查看完整密钥
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissReveal}
              className="text-mg-text-3 hover:text-mg-text-1 p-1.5 rounded-lg hover:bg-mg-fill-1 transition-colors cursor-pointer shrink-0"
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>

          {/* 密钥框 + 快速接入：紧挨同一行（小屏堆叠，大屏按钮跟随密钥框，不留空当） */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-mg-border bg-mg-code-bg px-3 py-2 font-mono text-sm font-bold tracking-wider">
              <span className="min-w-0 flex-1 truncate text-mg-success select-all">{createdKeyText}</span>
              <button
                type="button"
                onClick={() => handleCopyKey(createdKeyText)}
                className={[
                  'shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer',
                  copied
                    ? 'bg-mg-success/15 text-mg-success'
                    : 'bg-mg-fill-1 text-mg-text-1 hover:bg-mg-fill-2 hover:text-mg-text-0',
                ].join(' ')}
              >
                {copied ? <LuCheck className="w-3.5 h-3.5" /> : <LuCopy className="w-3.5 h-3.5" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <Button variant="brand" onClick={onOpenConnect} className="shrink-0 h-auto rounded-lg px-5 text-sm font-semibold cursor-pointer">
              快速接入
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
