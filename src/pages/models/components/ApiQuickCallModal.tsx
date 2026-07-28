/**
 * API 快捷调用弹窗（PRD §7.7；模型体验页专用，弹窗形态）
 * 每个模型列顶部 API 图标打开「{模型名称} 的 API 调用」弹窗：
 * 协议 Tab 只展示模型支持的协议；语言 Tab 按协议过滤（见 `../api-code-samples`）；
 * 代码示例固定模板，不读取当前草稿、附件和模型参数。
 *
 * 公开模型广场详情页（/models/:modelId）用的是同一套代码示例生成器，但渲染为内嵌
 * 「API 接入」区块而非弹窗（见飞书《ModelGo首页重构 PRD：模型广场页面》v0.1 §8.3
 * 「API请求渲染后滚动到正确模型的 API 区，不打开新弹窗」），见 `../detail/ApiAccessPanel.tsx`。
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LuKey, LuExternalLink } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import {
  PROTOCOL_LABEL,
  languagesForProtocol,
  languageLabel,
  buildCodeSample,
  type ApiProtocol,
  type ApiCodeLanguage,
} from '../api-code-samples'
import '../styles/api-quick-call-modal.css'

export type { ApiProtocol, ApiCodeLanguage }

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
  const protocols = useMemo(
    () => (supportedProtocols.length > 0 ? supportedProtocols : (['openai'] as ApiProtocol[])),
    [supportedProtocols]
  )
  const [protocol, setProtocol] = useState<ApiProtocol>(protocols[0])
  const [language, setLanguage] = useState<ApiCodeLanguage>('curl')

  const activeProtocol = protocols.includes(protocol) ? protocol : protocols[0]
  // 语言 Tab 按当前协议过滤（PRD §7.6）：openai → cURL/Python/Node.js/TypeScript(fetch)；
  // anthropic → cURL/Python(Anthropic)/Claude Code。切协议后若旧语言不在新协议的集合里，
  // 自动回退到该协议下第一个可用语言，避免停留在一个已不存在的 Tab 上。
  const languages = languagesForProtocol(activeProtocol)
  const activeLanguage = languages.includes(language) ? language : languages[0]
  const codeSample = buildCodeSample(activeProtocol, activeLanguage, modelId)

  const footer = (
    <div className="api-quick-call-footer">
      <CopyButton
        value={codeSample}
        variant="labeled"
        label="复制代码"
        copiedLabel="已复制"
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
          <span>{modelName} 的 API 调用</span>
          <Button variant="outline" size="sm" asChild onClick={() => onAction?.('get_key', activeProtocol, activeLanguage)}>
            <Link to="/api-keys">
              <LuKey size={14} className="mr-1.5" />
              获取 API Key
              <LuExternalLink size={12} className="ml-1" />
            </Link>
          </Button>
        </div>
      }
      footer={footer}
    >
      <div className="api-quick-call-body">
        <div className="api-quick-call-model-id">
          <span className="api-quick-call-model-id-label">模型 ID</span>
          <span className="api-quick-call-model-id-value">{modelId}</span>
          <CopyButton
            value={modelId}
            aria-label="复制模型 ID"
            toast="已复制模型 ID"
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
                {PROTOCOL_LABEL[p]}
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
                {languageLabel(activeProtocol, lang)}
              </TabsTrigger>
            ))}
          </TabsList>
          {languages.map((lang) => (
            <TabsContent key={lang} value={lang}>
              <div className="api-quick-call-code">
                <CopyButton
                  value={buildCodeSample(activeProtocol, lang, modelId)}
                  aria-label="复制代码"
                  toast="已复制代码示例"
                  className="api-quick-call-code-copy"
                  onCopied={() => onAction?.('copy_code', activeProtocol, lang)}
                />
                <pre className="api-quick-call-code-pre">
                  <code>{buildCodeSample(activeProtocol, lang, modelId)}</code>
                </pre>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Modal>
  )
}

export default ApiQuickCallModal
