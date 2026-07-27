/**
 * API 快捷调用弹窗（PRD §7.7）
 * 每个模型列顶部 API 图标打开「{模型名称} 的 API 调用」弹窗：
 * 协议 Tab 只展示模型支持的协议；语言 Tab 为 cURL/Node.js/Python；
 * 代码示例固定模板，不读取当前草稿、附件和模型参数。
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LuKey, LuExternalLink } from 'react-icons/lu'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import '../styles/api-quick-call-modal.css'

export type ApiProtocol = 'openai' | 'anthropic' | 'native'
export type ApiCodeLanguage = 'curl' | 'nodejs' | 'python'

export interface ApiQuickCallModalProps {
  open: boolean
  onClose: () => void
  modelName: string
  modelId: string
  /** 该模型支持哪些协议，决定协议 Tab 展示哪些 */
  supportedProtocols: ApiProtocol[]
}

const PROTOCOL_LABEL: Record<ApiProtocol, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  // 原生协议不展示推理供应商名称
  native: '原生 API',
}

const LANGUAGE_LABEL: Record<ApiCodeLanguage, string> = {
  curl: 'cURL',
  nodejs: 'Node.js',
  python: 'Python',
}

const LANGUAGE_ORDER: ApiCodeLanguage[] = ['curl', 'nodejs', 'python']

/** 固定代码示例模板：不读取当前草稿、附件和模型参数，只做格式展示 */
function buildCodeSample(protocol: ApiProtocol, language: ApiCodeLanguage, modelId: string): string {
  const endpoint =
    protocol === 'anthropic'
      ? 'https://api.modelgo.com/v1/messages'
      : protocol === 'native'
        ? 'https://api.modelgo.com/v1/native/generate'
        : 'https://api.modelgo.com/v1/chat/completions'

  const bodyKeys =
    protocol === 'anthropic'
      ? `{"model":"${modelId}","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}`
      : `{"model":"${modelId}","messages":[{"role":"user","content":"Hello"}]}`

  switch (language) {
    case 'curl':
      return [
        `curl ${endpoint} \\`,
        `  -H "Authorization: Bearer $MODELGO_API_KEY" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -d '${bodyKeys}'`,
      ].join('\n')
    case 'nodejs':
      return [
        `import fetch from "node-fetch";`,
        ``,
        `const res = await fetch("${endpoint}", {`,
        `  method: "POST",`,
        `  headers: {`,
        `    Authorization: \`Bearer \${process.env.MODELGO_API_KEY}\`,`,
        `    "Content-Type": "application/json",`,
        `  },`,
        `  body: JSON.stringify(${bodyKeys}),`,
        `});`,
        `console.log(await res.json());`,
      ].join('\n')
    case 'python':
      return [
        `import os, requests`,
        ``,
        `res = requests.post(`,
        `    "${endpoint}",`,
        `    headers={"Authorization": f"Bearer {os.environ['MODELGO_API_KEY']}"},`,
        `    json=${bodyKeys},`,
        `)`,
        `print(res.json())`,
      ].join('\n')
    default:
      return ''
  }
}

export function ApiQuickCallModal({
  open,
  onClose,
  modelName,
  modelId,
  supportedProtocols,
}: ApiQuickCallModalProps) {
  const protocols = useMemo(
    () => (supportedProtocols.length > 0 ? supportedProtocols : (['openai'] as ApiProtocol[])),
    [supportedProtocols]
  )
  const [protocol, setProtocol] = useState<ApiProtocol>(protocols[0])
  const [language, setLanguage] = useState<ApiCodeLanguage>('curl')

  const activeProtocol = protocols.includes(protocol) ? protocol : protocols[0]
  const codeSample = buildCodeSample(activeProtocol, language, modelId)

  const footer = (
    <div className="api-quick-call-footer">
      <CopyButton
        value={codeSample}
        variant="labeled"
        label="复制代码"
        copiedLabel="已复制"
        buttonVariant="brand"
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
          <Button variant="outline" size="sm" asChild>
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
          <CopyButton value={modelId} aria-label="复制模型 ID" toast="已复制模型 ID" />
        </div>

        <Tabs value={activeProtocol} onValueChange={(v) => setProtocol(v as ApiProtocol)}>
          <TabsList variant="pills">
            {protocols.map((p) => (
              <TabsTrigger key={p} value={p} variant="pills">
                {PROTOCOL_LABEL[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Tabs value={language} onValueChange={(v) => setLanguage(v as ApiCodeLanguage)}>
          <TabsList variant="underline">
            {LANGUAGE_ORDER.map((lang) => (
              <TabsTrigger key={lang} value={lang} variant="underline">
                {LANGUAGE_LABEL[lang]}
              </TabsTrigger>
            ))}
          </TabsList>
          {LANGUAGE_ORDER.map((lang) => (
            <TabsContent key={lang} value={lang}>
              <div className="api-quick-call-code">
                <CopyButton
                  value={buildCodeSample(activeProtocol, lang, modelId)}
                  aria-label="复制代码"
                  toast="已复制代码示例"
                  className="api-quick-call-code-copy"
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
