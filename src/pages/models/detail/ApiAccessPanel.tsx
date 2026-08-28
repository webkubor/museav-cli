/**
 * 详情页「API 接入」区块（飞书《ModelGo首页重构 PRD：模型广场页面》v0.1 §7.6）：
 * 标题「API 接入」，标题右侧只保留「获取API Key」；代码 Tab 按协议过滤，复用
 * `../api-code-samples` 生成器（与模型体验页 ApiQuickCallModal 同一份，§11「API 示例
 * 复用：详情与模型体验 API 弹窗复用固定示例生成器，仅接收模型 ID、协议和语言」），
 * 示例预填当前模型 ID / ModelGo Base URL / MODELGO_API_KEY 占位符，不展示真实密钥。
 *
 * 区别于模型体验页的 ApiQuickCallModal（弹窗形态）：本区块是详情页内嵌 section，
 * 不打开新弹窗（§8.3「API请求渲染后滚动到正确模型的 API 区，不打开新弹窗」）。
 */
import { forwardRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuKey, LuExternalLink } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { ApiCodeBlock } from '../components/ApiCodeBlock'
import {
  PROTOCOL_LABEL,
  PROTOCOL_LABEL_EN,
  languagesForProtocol,
  languageLabel,
  buildCodeSample,
  type ApiProtocol,
  type ApiCodeLanguage,
} from '../api-code-samples'
import { mergeProtocolLabels } from '@/features/models/model-format'
import { usePublicProtocolsStore } from '@/store/use-public-protocols-store'
import '../styles/api-quick-call-modal.css'

export interface ApiAccessPanelProps {
  modelId: string
  /** 该模型支持哪些协议，决定协议 Tab 展示哪些；无协议数据时按 openai_chat_completions 兜底 */
  protocols: ApiProtocol[]
  isZh: boolean
  onGetKeyClick: () => void
  /** 埋点：marketplace_api_tab_changed */
  onTabChange?: (codeTab: ApiCodeLanguage, protocol: ApiProtocol) => void
  /** 埋点：marketplace_api_code_copied */
  onCodeCopied?: (codeTab: ApiCodeLanguage) => void
}

const ApiAccessPanel = forwardRef<HTMLDivElement, ApiAccessPanelProps>(function ApiAccessPanel(
  { modelId, protocols, isZh, onGetKeyClick, onTabChange, onCodeCopied },
  ref,
) {
  const { t } = useTranslation()
  const safeProtocols = protocols.length > 0 ? protocols : (['openai_chat_completions'] as ApiProtocol[])
  const [protocol, setProtocol] = useState<ApiProtocol>(safeProtocols[0])
  const activeProtocol = safeProtocols.includes(protocol) ? protocol : safeProtocols[0]

  // 语言 Tab 按协议过滤，切协议后若旧语言不在新集合里自动回退第一个可用语言。
  const languages = languagesForProtocol(activeProtocol)
  const [language, setLanguage] = useState<ApiCodeLanguage>(languages[0])
  const activeLanguage = languages.includes(language) ? language : languages[0]

  const publicProtocolItems = usePublicProtocolsStore((s) => s.items)
  const protocolLabel = mergeProtocolLabels(
    isZh ? PROTOCOL_LABEL : PROTOCOL_LABEL_EN,
    publicProtocolItems,
    isZh ? 'label' : 'label_en',
  )

  return (
    // 分隔靠外层区块卡（详情页已按原型拆成 hero / 规格 / API / 相关模型 四块卡），
    // 这里不再自带上分隔线，否则卡内会多出一条悬空横线。
    <section ref={ref} id="api-access" className="scroll-mt-20">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-mg-text-1 text-[14px] font-semibold">
          {t('modelsCatalog.apiAccess.title')}
        </h3>
        <Button variant="outline" size="sm" onClick={onGetKeyClick}>
          <LuKey size={14} className="mr-1.5" />
          {t('modelsCatalog.apiAccess.getApiKey')}
          <LuExternalLink size={12} className="ml-1" />
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {/* 只有一个协议时不展示协议 Tab（无需在唯一选项上做单 Tab 展示） */}
        {safeProtocols.length > 1 && (
          <Tabs value={activeProtocol} onValueChange={(v) => setProtocol(v as ApiProtocol)}>
            <TabsList variant="pills">
              {safeProtocols.map((p) => (
                <TabsTrigger key={p} value={p} variant="pills">
                  {/* `?? p`：本地兜底表与远端目录都没收录时退回原始 code。渲染
                      undefined 会让这个 pills Tab 塌成一个只剩 padding 的纯色块——
                      2026-08-28 线上 content_generation 就是这个形状。显示 code 不好看，
                      但比空块可诊断（PROTOCOL_TO_API 已让这种情况在编译期暴露，这里是兜底）。 */}
                  {protocolLabel[p] ?? p}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <Tabs
          value={activeLanguage}
          onValueChange={(v) => {
            const next = v as ApiCodeLanguage
            setLanguage(next)
            onTabChange?.(next, activeProtocol)
          }}
        >
          <TabsList variant="underline">
            {languages.map((lang) => (
              <TabsTrigger key={lang} value={lang} variant="underline">
                {languageLabel(activeProtocol, lang)}
              </TabsTrigger>
            ))}
          </TabsList>
          {languages.map((lang) => (
            <TabsContent key={lang} value={lang}>
              <div className="api-quick-call-code">
                <CopyButton
                  value={buildCodeSample(activeProtocol, lang, modelId)}
                  aria-label={t('modelsCatalog.apiAccess.copyCode')}
                  toast={t('modelsCatalog.apiAccess.codeCopied')}
                  className="api-quick-call-code-copy"
                  onCopied={() => onCodeCopied?.(lang)}
                />
                <ApiCodeBlock code={buildCodeSample(activeProtocol, lang, modelId)} />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  )
})

export { ApiAccessPanel }
