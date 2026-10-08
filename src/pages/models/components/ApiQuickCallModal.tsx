/**
 * API 快捷调用弹窗（PRD §7.7；模型体验页专用，弹窗形态）
 * 每个模型列顶部 API 图标打开「{模型名称} 的 API 调用」弹窗：
 * 协议 Tab 只展示模型支持的协议；语言 Tab 固定为 cURL、Node.js、Python 三个
 * （PRD §7.7 原文，不随协议增减——跟公开模型广场详情页 §7.6 的六语言协议过滤方案
 * 是两套不同规范，本组件不能借用那套，否则模型体验页会多出协议自己不该有的
 * TypeScript/Claude Code Tab）；代码示例固定模板，不读取当前草稿、附件和模型参数。
 *
 * 公开模型广场详情页（/models/:modelId）用的是同一套代码示例生成器（含 typescript/
 * claudeCode 两个额外语言），但渲染为内嵌「API 接入」区块而非弹窗、且按协议过滤语言
 * Tab（见飞书《ModelGo首页重构 PRD：模型广场页面》v0.1 §7.6/§8.3），见
 * `../detail/ApiAccessPanel.tsx`，不要跟本组件混用同一套语言集合。
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuKey, LuExternalLink } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { ApiCodeBlock } from './ApiCodeBlock'
import {
  PROTOCOL_LABEL,
  PROTOCOL_LABEL_EN,
  buildCodeSample,
  languagesForProtocol,
  type ApiProtocol,
  type ApiCodeLanguage,
} from '../api-code-samples'
import { sortProtocols, mergeProtocolLabels } from '@/features/models/model-format'
import { usePublicProtocolsStore } from '@/store/use-public-protocols-store'
import '../styles/api-quick-call-modal.css'

export type { ApiProtocol, ApiCodeLanguage }

/** 模型体验页 API 弹窗固定语言集合（PRD §7.7），不随协议变化 */
const PLAYGROUND_LANGUAGES: ApiCodeLanguage[] = ['curl', 'nodejs', 'python']
const PLAYGROUND_LANGUAGE_LABEL: Record<'curl' | 'nodejs' | 'python', string> = {
  curl: 'cURL',
  nodejs: 'Node.js',
  python: 'Python',
}

export interface ApiQuickCallModalProps {
  open: boolean
  onClose: () => void
  modelName: string
  modelId: string
  /** 该模型支持哪些协议，决定协议 Tab 展示哪些 */
  supportedProtocols: ApiProtocol[]
  /** 埋点用（§10.3 playground_api_modal_action）：切协议/切语言/复制代码/复制模型 ID/获取 Key */
  onAction?: (action: 'switch_protocol' | 'switch_language' | 'copy_code' | 'copy_model_id' | 'get_key', protocol: ApiProtocol, language: ApiCodeLanguage) => void
}

export function ApiQuickCallModal({
  open,
  onClose,
  modelName,
  modelId,
  supportedProtocols,
  onAction,
}: ApiQuickCallModalProps) {
  const { t, i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')
  const publicProtocolItems = usePublicProtocolsStore((s) => s.items)
  const protocolLabel = mergeProtocolLabels(
    isZh ? PROTOCOL_LABEL : PROTOCOL_LABEL_EN,
    publicProtocolItems,
    isZh ? 'label' : 'label_en',
  )
  const protocols = useMemo(
    // sortProtocols：协议 Tab 顺序统一 openai → anthropic → other/native（QA：端点兼容顺序不一致）
    () => (supportedProtocols.length > 0 ? sortProtocols(supportedProtocols) : (['openai_chat_completions'] as ApiProtocol[])),
    [supportedProtocols]
  )
  const [protocol, setProtocol] = useState<ApiProtocol>(protocols[0])
  const [language, setLanguage] = useState<ApiCodeLanguage>('curl')

  const activeProtocol = protocols.includes(protocol) ? protocol : protocols[0]
  // 语言 Tab 固定 cURL/Node.js/Python（PRD §7.7），不随协议变化
  // 语言 Tab 也按协议过滤（同详情页 ApiAccessPanel）：realtime 只有 Node.js / Python，
  // 写死三语会出现「cURL」标签下却是 Node.js 代码（prd46#1211 review）
  const protocolLanguages = languagesForProtocol(activeProtocol)
  const filtered = PLAYGROUND_LANGUAGES.filter((lang) => protocolLanguages.includes(lang))
  const languages = filtered.length > 0 ? filtered : PLAYGROUND_LANGUAGES
  const activeLanguage = languages.includes(language) ? language : languages[0]
  const codeSample = buildCodeSample(activeProtocol, activeLanguage, modelId)

  const footer = (
    <div className="api-quick-call-footer">
      <CopyButton
        value={codeSample}
        variant="labeled"
        label={t('modelsExperience.apiModal.copyCode')}
        copiedLabel={t('modelsExperience.apiModal.copied')}
        buttonVariant="brand"
        onCopied={() => onAction?.('copy_code', activeProtocol, activeLanguage)}
      />
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <div className="api-quick-call-header">
          <span>{t('modelsExperience.apiModal.title', { name: modelName })}</span>
          <Button variant="outline" size="sm" asChild onClick={() => onAction?.('get_key', activeProtocol, activeLanguage)}>
            <Link to="/api-keys">
              <LuKey size={14} className="mr-1.5" />
              {t('modelsExperience.apiModal.getApiKey')}
              <LuExternalLink size={12} className="ml-1" />
            </Link>
          </Button>
        </div>
      }
      footer={footer}
    >
      <div className="api-quick-call-body">
        <div className="api-quick-call-model-id">
          <span className="api-quick-call-model-id-label">{t('modelsExperience.apiModal.modelId')}</span>
          <span className="api-quick-call-model-id-value">{modelId}</span>
          <CopyButton
            value={modelId}
            aria-label={t('modelsExperience.apiModal.copyModelId')}
            toast={t('modelsExperience.apiModal.modelIdCopied')}
            onCopied={() => onAction?.('copy_model_id', activeProtocol, activeLanguage)}
          />
        </div>

        <Tabs
          value={activeProtocol}
          onValueChange={(v) => {
            onAction?.('switch_protocol', v as ApiProtocol, activeLanguage)
            setProtocol(v as ApiProtocol)
          }}
        >
          <TabsList variant="pills">
            {protocols.map((p) => (
              <TabsTrigger key={p} value={p} variant="pills">
                {/* `?? p` 兜底同 ApiAccessPanel：没收录的 code 显示原文，不渲染空块 */}
                {protocolLabel[p] ?? p}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs
          value={activeLanguage}
          onValueChange={(v) => {
            onAction?.('switch_language', activeProtocol, v as ApiCodeLanguage)
            setLanguage(v as ApiCodeLanguage)
          }}
        >
          <TabsList variant="underline">
            {languages.map((lang) => (
              <TabsTrigger key={lang} value={lang} variant="underline">
                {PLAYGROUND_LANGUAGE_LABEL[lang as 'curl' | 'nodejs' | 'python']}
              </TabsTrigger>
            ))}
          </TabsList>
          {languages.map((lang) => (
            <TabsContent key={lang} value={lang}>
              <div className="api-quick-call-code">
                <CopyButton
                  value={buildCodeSample(activeProtocol, lang, modelId)}
                  aria-label={t('modelsExperience.apiModal.copyCode')}
                  toast={t('modelsExperience.apiModal.codeCopied')}
                  className="api-quick-call-code-copy"
                  onCopied={() => onAction?.('copy_code', activeProtocol, lang)}
                />
                <ApiCodeBlock code={buildCodeSample(activeProtocol, lang, modelId)} />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Modal>
  )
}

export default ApiQuickCallModal
