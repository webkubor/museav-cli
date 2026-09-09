/**
 * API Key 接入工具弹窗：按工具切换查看接入参数，支持拉起工具/打开文档与一键复制
 */
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { CopyButton } from '@/components/ui/CopyButton'
import { Select } from '@/components/ui/Select'
import { useTranslation } from 'react-i18next'
import { LuZap, LuChevronRight, LuExternalLink, LuKey } from 'react-icons/lu'
import { appToast } from '@/lib/app-toast'
import { getRequestErrorMessage } from '@/lib/request-error-message'
import { appendCrossSiteParams } from '@/lib/cross-site-link'
import { trackEvent } from '@/lib/track'
import { useTrackContext } from '@/hooks/use-track-context'
import { useAuthStore } from '@/store/auth'
import { LocaleNamespaces } from '@/components/i18n/LocaleNamespaces'
import { CONNECT_ACTIONS, buildConnectSnippets, getConnectAction, MGC_CLIENT_OPTIONS, connectActionLabel, deriveRegionFromBaseUrl, buildMgcCommand, type ConnectParam } from './constants'
import { buildConnectModelOptions, pickConnectModels } from './connect-models'
import { useQuery } from '@tanstack/react-query'
import { listModels } from '@/services/catalog'
import { listApiKeys, revealApiKey } from '@/services/api-keys'

type Props = {
  open: boolean
  onClose: () => void
  openAIBaseUrl: string
  anthropicBaseUrl: string
  createdKeyText: string
  docsUrl: string
  onCreateKey?: () => void
}

/**
 * 本弹窗的文案全在 `apiKeys` 语言包里，而它是**路由级懒加载**的（App.tsx CONSOLE_NAMESPACES
 * 只给 api-keys / models 系路由加载）。但弹窗有三个渲染点，两个不在这些路由里：
 * 全局顶栏 DashboardHeader、总览页 QuickStartSection —— 在那些页面点开，文案会整片退化成
 * `apiKeys.connectModal.title` 这样的 raw key（需求方 shared/modelgo_prd#375，国际站生产复现）。
 *
 * 所以 namespace 由弹窗自己兜底，而不是要求每个调用方记得在路由上挂 `apiKeys`——调用点会越加越多，
 * 靠约定必然再漏。`open=false` 时不挂载，语言包只在真正点开时才拉，不破坏懒加载省流量的初衷。
 */
export function ConnectModal(props: Props) {
  if (!props.open) return null
  return (
    <LocaleNamespaces namespaces={['apiKeys']} fallback={null}>
      <ConnectModalContent {...props} />
    </LocaleNamespaces>
  )
}

function ConnectModalContent({ open, onClose, openAIBaseUrl, anthropicBaseUrl, createdKeyText, docsUrl, onCreateKey }: Props) {
  const { t } = useTranslation()
  const trackCtx = useTrackContext()
  const hasCreatedKey = createdKeyText.trim().length > 0

  // @model-go/config 一键接入：区域自动推导、Key 自动预填，客户端由用户勾选
  const region = deriveRegionFromBaseUrl(openAIBaseUrl)
  const keyForCmd = hasCreatedKey ? createdKeyText : '<YOUR_MODELGO_API_KEY>'
  const [mgcAll, setMgcAll] = useState(false)
  const [mgcSelected, setMgcSelected] = useState<string[]>(['claude', 'codex'])
  const toggleMgcClient = (id: string) =>
    setMgcSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const mgcCommand = buildMgcCommand({ apiKey: keyForCmd, region, selected: mgcSelected, all: mgcAll })

  // 接入参数要钉真实存在的模型，否则 Claude Code 用官方默认 slug → 网关 403（需求方 #257）。
  // 按 tab 所需编程客户端分别拉目录：CC Switch / Claude Code = claude-code，Codex / SDK / cURL = codex。
  // coding_tool 为空的模型（QA 的 FakeLLM 夹具等）永不命中，服务端口径见 qa#583。
  // include_hidden：广场里设为「隐藏」的模型也要能在这里接入——隐藏 = 不出现在公开浏览
  // 列表，不等于不能用已知 model_id 接入（需求方 shared/modelgo_prd#567，后端 qa#601）。
  // 服务端只在同时带 coding_tool 时认这个参数，所以 QA 夹具那批（coding_tools 为空）
  // 依然进不来，qa#583 的隔离不受影响。
  // 仅在弹窗打开时拉取，避免全局 Header 每页都打一次目录请求。
  const anthropicModelsQuery = useQuery({
    queryKey: ['catalog-models', 'connect-modal', 'claude-code'],
    queryFn: () => listModels({ coding_tool: 'claude-code', include_hidden: true, page_size: 100 }),
    enabled: open,
    staleTime: 5 * 60_000,
  })
  const openaiModelsQuery = useQuery({
    queryKey: ['catalog-models', 'connect-modal', 'codex'],
    queryFn: () => listModels({ coding_tool: 'codex', include_hidden: true, page_size: 100 }),
    enabled: open,
    staleTime: 5 * 60_000,
  })
  const anthropicModelOptions = useMemo(
    () => buildConnectModelOptions(anthropicModelsQuery.data?.items ?? [], 'claude-code'),
    [anthropicModelsQuery.data]
  )
  const openaiModelOptions = useMemo(
    () => buildConnectModelOptions(openaiModelsQuery.data?.items ?? [], 'codex'),
    [openaiModelsQuery.data]
  )
  // 下拉未选时的默认项：沿用 #257 的挑选规则（旗舰 Claude / 最新 GPT），不是列表第一个
  const defaults = useMemo(
    () => pickConnectModels([...anthropicModelOptions, ...openaiModelOptions]),
    [anthropicModelOptions, openaiModelOptions]
  )

  // 需求方 shared#322：Key 与模型改为下拉可选。模型按 tab 各记一份，切 tab 不互相覆盖。
  const [modelByMethod, setModelByMethod] = useState<Partial<Record<string, string>>>({})
  const modelOptionsFor = (method: string) =>
    method === 'codex' ? openaiModelOptions : anthropicModelOptions
  const defaultModelFor = (method: string) =>
    method === 'codex'
      ? (defaults.codexModel ?? openaiModelOptions[0] ?? '')
      : (defaults.claudeModel ?? anthropicModelOptions[0] ?? '')
  const modelFor = (method: string) => modelByMethod[method] ?? defaultModelFor(method)

  const workspaceId = useAuthStore((s) => s.activeWorkspaceId) ?? ''
  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', 'connect-modal', workspaceId],
    queryFn: () => listApiKeys(workspaceId, { page_size: 100 }),
    enabled: open && !!workspaceId,
    staleTime: 60_000,
  })
  // 停用/过期的 Key 选出来也调不通，不放进下拉
  const apiKeyOptions = useMemo(
    () => (apiKeysQuery.data?.items ?? []).filter((k) => k.status === 'active'),
    [apiKeysQuery.data]
  )
  const [pickedKeyId, setPickedKeyId] = useState('')
  // 默认选中：刚在本页创建完 Key 就点进来的，默认选那一把（createdKeyText 是它的明文），否则第一把
  const defaultKeyId = useMemo(() => {
    if (!apiKeyOptions.length) return ''
    const created = createdKeyText ? apiKeyOptions.find((k) => createdKeyText.startsWith(k.prefix)) : undefined
    return (created ?? apiKeyOptions[0]).api_key_id
  }, [apiKeyOptions, createdKeyText])
  // 用派生值而不是 effect 回写：列表还没到 / 切空间后旧选中失效时自动落回默认，不产生级联渲染
  const selectedKeyId = apiKeyOptions.some((k) => k.api_key_id === pickedKeyId) ? pickedKeyId : defaultKeyId
  const selectedKey = apiKeyOptions.find((k) => k.api_key_id === selectedKeyId) ?? null

  /**
   * 参数区一律只渲染掩码（明文不常驻 DOM），复制时才取明文：
   * 刚创建的那把直接用手上的明文，其余走 reveal 端点（与 API Key 列表页复制同一条路径）。
   */
  const resolveKeyPlaintext = async () => {
    if (!selectedKey) return createdKeyText || '<YOUR_MODELGO_API_KEY>'
    if (createdKeyText && createdKeyText.startsWith(selectedKey.prefix)) return createdKeyText
    const res = await revealApiKey(workspaceId, selectedKey.api_key_id)
    return res.key
  }

  const connectSnippets = buildConnectSnippets({
    openAIBaseUrl,
    anthropicBaseUrl,
    createdKeyText: selectedKey?.masked ?? createdKeyText,
    docsUrl: appendCrossSiteParams(docsUrl),
    t,
    models: {
      'cc-switch': modelFor('cc-switch') || undefined,
      'claude-code': modelFor('claude-code') || undefined,
      codex: modelFor('codex') || undefined,
    },
  })

  const [launching, setLaunching] = useState<string | null>(null)
  /** 拉起本地工具：先把 href 里的掩码换成明文再跳，失败给明确提示而不是拉起一个用不了的 Provider */
  const handleLaunch = async (methodId: string, href: string) => {
    if (!selectedKey) return
    setLaunching(methodId)
    try {
      const plaintext = await resolveKeyPlaintext()
      window.location.assign(href.replaceAll(selectedKey.masked, plaintext))
    } catch (e) {
      appToast.error(getRequestErrorMessage(e, t('apiKeys.connectModal.revealError')))
    } finally {
      setLaunching(null)
    }
  }

  /**
   * 参数格：普通字段渲染只读值；apiKey / model 字段渲染内嵌下拉。
   * 下拉复用 ui/Select，只把触发器的边框底色去掉，让它读起来仍是一张参数卡（对齐 PRD 原型）。
   */
  // text-left 是必要的：Select 触发器全局是居中文本，长值（Key 名 · 掩码）会整段缩进、跟旁边只读参数不齐
  // min-w-0 flex-1（替代 w-full）：flex 行里触发器默认 min-width:auto 不收缩，长 Key 名会把旁边的复制按钮挤出卡片（需求方#555）
  const SELECT_TRIGGER =
    'h-auto min-w-0 flex-1 border-0 bg-transparent px-0 text-left font-mono text-xs font-semibold text-mg-text-1 hover:border-0 focus:border-0 focus:ring-0 [&>span]:block [&>span]:truncate'

  const renderParam = (methodId: string, param: ConnectParam) => {
    const shell = 'rounded-lg border border-mg-border/60 bg-mg-fill-0 px-3 py-2'
    const labelCls = 'mb-1 text-xs font-bold text-mg-text-3'

    if (param.field === 'apiKey') {
      return (
        <div key={param.label} className={shell}>
          <div className={labelCls}>{param.label}</div>
          <div className="flex items-center gap-1">
            <Select
              value={selectedKeyId}
              onChange={setPickedKeyId}
              className={SELECT_TRIGGER}
              emptyText={t('apiKeys.connectModal.noAvailableKey')}
              data-track="connect_select_key"
            >
              {apiKeyOptions.map((k) => (
                <Select.Option key={k.api_key_id} value={k.api_key_id}>
                  {k.name} · {k.masked}
                </Select.Option>
              ))}
            </Select>
            <CopyButton
              value={selectedKey?.masked ?? ''}
              getValue={resolveKeyPlaintext}
              aria-label={t('apiKeys.connectModal.copyApiKeyAria')}
              disabled={!selectedKey}
              className="shrink-0"
              onCopied={() => trackEvent('copy_connect_params', { ...trackCtx, method: `${methodId}:key` })}
            />
          </div>
        </div>
      )
    }

    if (param.field === 'model') {
      const options = modelOptionsFor(methodId)
      return (
        <div key={param.label} className={shell}>
          <div className={labelCls}>{param.label}</div>
          <div className="flex items-center gap-1">
            <Select
              value={param.value}
              onChange={(v) => setModelByMethod((prev) => ({ ...prev, [methodId]: v }))}
              className={SELECT_TRIGGER}
              emptyText={t('apiKeys.connectModal.noAvailableModel')}
              data-track="connect_select_model"
            >
              {options.map((id) => (
                <Select.Option key={id} value={id}>
                  {id}
                </Select.Option>
              ))}
            </Select>
            <CopyButton
              value={param.value}
              aria-label={t('apiKeys.connectModal.copyModelAria')}
              className="shrink-0"
              onCopied={() => trackEvent('copy_connect_params', { ...trackCtx, method: `${methodId}:model` })}
            />
          </div>
        </div>
      )
    }

    return (
      <div key={param.label} className={shell}>
        <div className={labelCls}>{param.label}</div>
        <code className="block truncate font-mono text-xs font-semibold text-mg-text-1" title={param.value}>
          {param.value}
        </code>
      </div>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('apiKeys.connectModal.title')}
      description={t('apiKeys.connectModal.desc')}
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
                <div className="text-sm font-bold text-mg-text-1">{t('apiKeys.connectModal.paramsTitle')}</div>
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
                label={t('apiKeys.connectModal.copyApiKey')}
                copiedLabel={t('apiKeys.connectModal.copiedKey')}
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
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-mg-text-3">OpenAI /v1</span>
                <CopyButton
                  value={openAIBaseUrl}
                  aria-label={t('apiKeys.connectModal.copyBaseUrl')}
                  onCopied={() => trackEvent('copy_connect_endpoint', { ...trackCtx, endpoint: 'openai' })}
                />
              </div>
              <code className="font-mono text-mg-text-1 break-all">{openAIBaseUrl}</code>
            </div>
            <div className="rounded-lg border border-mg-border/60 bg-mg-bg-0 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-mg-text-3">Anthropic</span>
                <CopyButton
                  value={anthropicBaseUrl}
                  aria-label={t('apiKeys.connectModal.copyBaseUrl')}
                  onCopied={() => trackEvent('copy_connect_endpoint', { ...trackCtx, endpoint: 'anthropic' })}
                />
              </div>
              <code className="font-mono text-mg-text-1 break-all">{anthropicBaseUrl}</code>
            </div>
          </div>
        </div>

        <Tabs
          defaultValue="mgc"
          onValueChange={(method) => trackEvent('connect_method', { ...trackCtx, method })}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-mg-text-2">{t('apiKeys.connectModal.method')}</div>
            <a
              href={appendCrossSiteParams(docsUrl)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-brand-base hover:text-brand-deep hover:underline"
            >
              {t('apiKeys.connectModal.docs')}
              <LuExternalLink className="h-3 w-3" />
            </a>
          </div>
          <TabsList variant="pills" className="mt-2 w-full justify-start overflow-x-auto">
            {CONNECT_ACTIONS.map((action) => (
              <TabsTrigger key={action.key} value={action.key} variant="pills" className="shrink-0 gap-1.5 px-3">
                <span className="flex h-4 w-4 items-center justify-center text-mg-text-1">
                  {action.icon}
                </span>
                {connectActionLabel(t, action.key)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="mgc">
            <div className="mg-tile p-4">
              <div className="text-sm font-bold text-mg-text-1">{t('apiKeys.connectModal.mgcTitle')}</div>
              <div className="mt-1 text-xs leading-5 text-mg-text-2">
                {t('apiKeys.connectModal.mgcDesc', { site: region === 'global' ? t('apiKeys.connectModal.globalSite') : t('apiKeys.connectModal.domesticSite') })}
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
                  {t('apiKeys.connectModal.allClients')}
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
                <span className="text-xs text-mg-text-3">
                  {hasCreatedKey ? t('apiKeys.connectModal.keyInjected') : t('apiKeys.connectModal.keyAutoFill')}
                </span>
                <CopyButton
                  value={mgcCommand}
                  variant="labeled"
                  buttonVariant="brand"
                  label={t('apiKeys.connectModal.copyCommand')}
                  onCopied={() => trackEvent('copy_connect_params', { ...trackCtx, method: 'mgc' })}
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
                      {isWebLink ? (
                        <a
                          href={item.launchHref}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand-base px-3 text-xs font-bold text-white shadow-sm shadow-brand-glow/15 transition-colors hover:bg-brand-deep"
                        >
                          {item.launchLabel}
                          <LuExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        // 拉起工具的 deep link 必须带明文 Key，否则 CC Switch / Claude Code 导进去的
                        // 是掩码、Provider 直接不可用；点的时候才 reveal，不把明文常驻在 href 上。
                        <Button
                          variant="brand"
                          size="sm"
                          disabled={!selectedKey}
                          loading={launching === item.id}
                          onClick={() => handleLaunch(item.id, item.launchHref)}
                          className="shrink-0 gap-1.5"
                        >
                          {item.launchLabel}
                          <LuChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <CopyButton
                        value={item.copyText}
                        // 参数区展示掩码，复制时才把选中 Key 换成明文——否则复制出去的配置不可用。
                        // 还没建过 Key 时两者都是空串，String.replaceAll('', x) 会在每个字符间插入
                        // 替换值（产生逐字符乱码）；此时 copyText 已经带占位符，原样返回即可。
                        getValue={async () => {
                          const maskedOrCreated = selectedKey?.masked ?? createdKeyText
                          if (!maskedOrCreated) return item.copyText
                          return item.copyText.replaceAll(maskedOrCreated, await resolveKeyPlaintext())
                        }}
                        variant="labeled"
                        label={item.copyLabel}
                        onCopied={() => trackEvent('copy_connect_params', { ...trackCtx, method: item.id })}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {item.params.map((param) => renderParam(item.id, param))}
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
