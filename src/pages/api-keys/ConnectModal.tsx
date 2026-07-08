/**
 * API Key 接入工具弹窗：按工具切换查看接入参数，支持拉起工具/打开文档与一键复制
 */
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { CopyButton } from '@/components/ui/CopyButton'
import { useTranslation } from 'react-i18next'
import { LuZap, LuChevronRight, LuExternalLink, LuKey } from 'react-icons/lu'
import { appendThemeParam } from '@/lib/theme'
import { CONNECT_ACTIONS, buildConnectSnippets, getConnectAction, MGC_CLIENT_OPTIONS, deriveRegionFromBaseUrl, buildMgcCommand } from './constants'

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
  const hasCreatedKey = createdKeyText.trim().length > 0

  // @model-go/config 一键接入：区域自动推导、Key 自动预填，客户端由用户勾选
  const region = deriveRegionFromBaseUrl(openAIBaseUrl)
  const keyForCmd = hasCreatedKey ? createdKeyText : '<YOUR_MODELGO_API_KEY>'
  const [mgcAll, setMgcAll] = useState(false)
  const [mgcSelected, setMgcSelected] = useState<string[]>(['claude', 'codex'])
  const toggleMgcClient = (id: string) =>
    setMgcSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const mgcCommand = buildMgcCommand({ apiKey: keyForCmd, region, selected: mgcSelected, all: mgcAll })

  const connectSnippets = buildConnectSnippets({ openAIBaseUrl, anthropicBaseUrl, createdKeyText, docsUrl: appendThemeParam(docsUrl) })

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
        <div className="rounded-md border border-mg-border bg-mg-bg-0 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-base/10 flex items-center justify-center shrink-0">
                <LuZap size={16} className="text-brand-base" />
              </div>
              <div>
                <div className="text-sm font-bold text-mg-text-1">ModelGo 接入参数</div>
                <div className="text-xs text-mg-text-3 mt-1">
                  {hasCreatedKey
                    ? t('apiKeys.connectModal.keyCreatedHint')
                    : t('apiKeys.connectModal.noKeyHint')}
                </div>
              </div>
            </div>
            {hasCreatedKey ? (
              <CopyButton
                value={createdKeyText}
                variant="labeled"
                label="复制 API Key"
                copiedLabel="已复制 Key"
                className="shrink-0"
              />
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
              <div className="text-mg-text-3 mb-1">OpenAI /v1</div>
              <code className="font-mono text-mg-text-1 break-all">{openAIBaseUrl}</code>
            </div>
            <div className="rounded-lg border border-mg-border/60 bg-mg-bg-0 px-3 py-2">
              <div className="text-mg-text-3 mb-1">Anthropic</div>
              <code className="font-mono text-mg-text-1 break-all">{anthropicBaseUrl}</code>
            </div>
          </div>
        </div>

        <Tabs defaultValue="mgc">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-mg-text-2">接入方式</div>
            <a
              href={appendThemeParam(docsUrl)}
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
                <span className="flex h-4 w-4 items-center justify-center text-mg-text-1">
                  {action.icon}
                </span>
                {action.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="mgc">
            <div className="mg-tile p-4">
              <div className="text-sm font-bold text-mg-text-1">一条命令接入 AI 编程客户端</div>
              <div className="mt-1 text-xs leading-5 text-mg-text-2">
                勾选要接入的客户端，命令已自动填好 Key 与站点（{region === 'global' ? '国际站' : '国内站'}），复制到终端回车即可。
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMgcAll((v) => !v)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    mgcAll
                      ? 'border-brand-base bg-brand-base/10 text-brand-base'
                      : 'border-mg-border bg-mg-fill-0 text-mg-text-2 hover:border-brand-base/35'
                  }`}
                >
                  全部 12 个
                </button>
                {MGC_CLIENT_OPTIONS.map((opt) => {
                  const active = !mgcAll && mgcSelected.includes(opt.id)
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={mgcAll}
                      onClick={() => toggleMgcClient(opt.id)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                        active
                          ? 'border-brand-base bg-brand-base/10 text-brand-base'
                          : 'border-mg-border bg-mg-fill-0 text-mg-text-2 hover:border-brand-base/35'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              <pre className="mt-4 max-h-32 overflow-auto rounded-md border border-mg-border bg-mg-code-bg p-3 text-xs leading-5 text-mg-text-1">
                <code className="break-all">{mgcCommand}</code>
              </pre>

              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[11px] text-mg-text-3">
                  {hasCreatedKey ? '已填入你刚创建的 Key' : '创建密钥后将自动填入真实 Key'}
                </span>
                <CopyButton
                  value={mgcCommand}
                  variant="labeled"
                  buttonVariant="brand"
                  label="复制命令"
                />
              </div>
            </div>
          </TabsContent>

          {connectSnippets.map((item) => {
            const action = getConnectAction(item.id)
            const isWebLink = item.launchHref.startsWith('http')

            return (
              <TabsContent key={item.id} value={item.id}>
                <div className="rounded-md border border-mg-border bg-mg-bg-0 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-mg-border bg-mg-fill-0 text-mg-text-1">
                        {action?.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-mg-text-1">{item.title}</div>
                        <div className="mt-1 text-xs leading-5 text-mg-text-3">{item.desc}</div>
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
                      <CopyButton
                        value={item.copyText}
                        variant="labeled"
                        label={item.copyLabel}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {item.params.map((param) => (
                      <div key={param.label} className="rounded-lg border border-mg-border/60 bg-mg-fill-0 px-3 py-2">
                        <div className="mb-1 text-[11px] font-bold text-mg-text-3">{param.label}</div>
                        <code className="block truncate font-mono text-xs font-semibold text-mg-text-1" title={param.value}>
                          {param.value}
                        </code>
                      </div>
                    ))}
                  </div>

                  {item.command && (
                    <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-mg-border bg-mg-code-bg p-3 text-xs leading-5 text-mg-text-1">
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
