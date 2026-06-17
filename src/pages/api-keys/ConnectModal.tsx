/**
 * API Key 接入工具弹窗：按工具切换查看接入参数，支持拉起工具/打开文档与一键复制
 */
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useCopy } from '@/hooks/use-copy'
import { appToast } from '@/lib/app-toast'
import { useTranslation } from 'react-i18next'
import { LuCopy, LuCheck, LuZap, LuChevronRight, LuExternalLink, LuKey } from 'react-icons/lu'
import { CONNECT_ACTIONS, buildConnectSnippets, getConnectAction } from './constants'

type Props = {
  open: boolean
  onClose: () => void
  openAIBaseUrl: string
  anthropicBaseUrl: string
  createdKeyText: string
  docsUrl: string
  onCreateKey?: () => void
}

export function ConnectModal({ open, onClose, openAIBaseUrl, anthropicBaseUrl, createdKeyText, docsUrl, onCreateKey }: Props) {
  const { t } = useTranslation()
  const { copy } = useCopy()
  const [connectCopied, setConnectCopied] = useState<string | null>(null)
  const hasCreatedKey = createdKeyText.trim().length > 0

  async function handleConnectCopy(key: string, text: string) {
    const ok = await copy(text)
    if (!ok) {
      appToast.error('复制失败，请手动复制')
      return
    }
    setConnectCopied(key)
    appToast.success('已复制到剪贴板')
    setTimeout(() => setConnectCopied(null), 2000)
  }

  const connectSnippets = buildConnectSnippets({ openAIBaseUrl, anthropicBaseUrl, createdKeyText, docsUrl })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="立即接入"
      description="选择接入方式查看参数，按钮用于打开工具或文档。"
      size="lg"
      className="sm:max-w-[840px]"
    >
      <div className="space-y-4 py-2">
        <div className="rounded-md border border-mg-border bg-mg-bg-1/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-base/10 flex items-center justify-center shrink-0">
                <LuZap size={16} className="text-brand-base" />
              </div>
              <div>
                <div className="text-sm font-bold text-mg-text-0">ModelGo 接入参数</div>
                <div className="text-xs text-mg-text-2 mt-1">
                  {hasCreatedKey
                    ? t('apiKeys.connectModal.keyCreatedHint')
                    : t('apiKeys.connectModal.noKeyHint')}
                </div>
              </div>
            </div>
            {hasCreatedKey ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConnectCopy('api-key', createdKeyText)}
                className="shrink-0"
              >
                {connectCopied === 'api-key'
                  ? <><LuCheck className="w-3.5 h-3.5 mr-1.5" />已复制 Key</>
                  : <><LuCopy className="w-3.5 h-3.5 mr-1.5" />复制 API Key</>}
              </Button>
            ) : onCreateKey ? (
              <Button
                variant="brand"
                size="sm"
                onClick={onCreateKey}
                className="shrink-0"
              >
                <LuKey className="w-3.5 h-3.5 mr-1.5" />
                {t('apiKeys.create')}
              </Button>
            ) : null}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-mg-border/60 bg-mg-bg-0 px-3 py-2">
              <div className="text-mg-text-2 mb-1">OpenAI /v1</div>
              <code className="font-mono text-mg-text-0 break-all">{openAIBaseUrl}</code>
            </div>
            <div className="rounded-lg border border-mg-border/60 bg-mg-bg-0 px-3 py-2">
              <div className="text-mg-text-2 mb-1">Anthropic</div>
              <code className="font-mono text-mg-text-0 break-all">{anthropicBaseUrl}</code>
            </div>
          </div>
        </div>

        <Tabs defaultValue="cc-switch">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-mg-text-1">接入方式</div>
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-base hover:text-brand-deep hover:underline"
            >
              开发文档
              <LuExternalLink className="h-3 w-3" />
            </a>
          </div>
          <TabsList variant="pills" className="mt-2 w-full justify-start overflow-x-auto">
            {CONNECT_ACTIONS.map((action) => (
              <TabsTrigger key={action.key} value={action.key} variant="pills" className="shrink-0 gap-1.5 px-3">
                <span className="flex h-4 w-4 items-center justify-center text-mg-text-0">
                  {action.icon}
                </span>
                {action.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {connectSnippets.map((item) => {
            const action = getConnectAction(item.id)
            const isWebLink = item.launchHref.startsWith('http')

            return (
              <TabsContent key={item.id} value={item.id}>
                <div className="rounded-md border border-mg-border bg-mg-bg-0 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-mg-border bg-mg-bg-1 text-mg-text-0">
                        {action?.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-mg-text-0">{item.title}</div>
                        <div className="mt-1 text-xs leading-5 text-mg-text-2">{item.desc}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <a
                        href={item.launchHref}
                        target={isWebLink ? '_blank' : undefined}
                        rel={isWebLink ? 'noreferrer' : undefined}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand-base px-3 text-xs font-bold text-white shadow-sm shadow-brand-glow/15 transition-colors hover:bg-brand-deep"
                      >
                        {item.launchLabel}
                        {isWebLink ? <LuExternalLink className="h-3.5 w-3.5" /> : <LuChevronRight className="h-3.5 w-3.5" />}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleConnectCopy(item.id, item.copyText)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-mg-border bg-mg-bg-1 px-3 text-xs font-semibold text-mg-text-1 transition-colors hover:border-brand-base/35 hover:text-brand-base cursor-pointer"
                      >
                        {connectCopied === item.id ? <LuCheck className="h-3.5 w-3.5" /> : <LuCopy className="h-3.5 w-3.5" />}
                        {connectCopied === item.id ? '已复制' : item.copyLabel}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {item.params.map((param) => (
                      <div key={param.label} className="rounded-lg border border-mg-border/60 bg-mg-bg-1/60 px-3 py-2">
                        <div className="mb-1 text-[11px] font-bold text-mg-text-2">{param.label}</div>
                        <code className="block truncate font-mono text-xs font-semibold text-mg-text-0" title={param.value}>
                          {param.value}
                        </code>
                      </div>
                    ))}
                  </div>

                  {item.command && (
                    <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-mg-border bg-mg-code-bg p-3 text-xs leading-5 text-mg-text-0">
                      <code>{item.command}</code>
                    </pre>
                  )}
                </div>
              </TabsContent>
            )
          })}
        </Tabs>
      </div>
    </Modal>
  )
}
