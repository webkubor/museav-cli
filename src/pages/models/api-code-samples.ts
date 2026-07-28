/**
 * API 代码示例生成器（PRD §7.6/§7.7、飞书《ModelGo首页重构 PRD：模型广场页面》v0.1 §11
 * 「API 示例复用：详情与模型体验 API 弹窗复用固定示例生成器，仅接收模型 ID、协议和语言，
 * 不接收 Prompt、附件、参数或推理供应商」）。
 *
 * 单一真源：`ApiQuickCallModal`（模型体验弹窗）与公开详情页 API 接入区共用本模块，
 * 禁止各自维护一份代码模板。
 *
 * 协议单一来源：代码 Tab 从 protocols 派生，无对应协议时不显示空 Tab（§11「协议单一来源」）。
 */
export type ApiProtocol = 'openai' | 'anthropic' | 'native'
export type ApiCodeLanguage = 'curl' | 'nodejs' | 'python' | 'typescript' | 'claudeCode'

export const PROTOCOL_LABEL: Record<ApiProtocol, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  // 原生协议不展示推理供应商名称
  native: '原生 API',
}

export const PROTOCOL_LABEL_EN: Record<ApiProtocol, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  native: 'Native API',
}

const LANGUAGE_LABEL: Record<ApiCodeLanguage, string> = {
  curl: 'cURL',
  nodejs: 'Node.js',
  python: 'Python',
  typescript: 'TypeScript',
  claudeCode: 'Claude Code',
}

/**
 * 每个协议展示的代码 Tab（PRD §7.6 原文）：
 * - OpenAI 协议：cURL、Python（OpenAI）、Node.js（OpenAI）、TypeScript（fetch）
 * - Anthropic 协议：cURL、Python（Anthropic）、Claude Code
 * - 其他/原生协议：不伪造不受支持的 OpenAI/Anthropic 示例（PRD §4.2「非目标」），
 *   保留最基础的 cURL/Node.js/Python 通用示例。
 */
export function languagesForProtocol(protocol: ApiProtocol): ApiCodeLanguage[] {
  switch (protocol) {
    case 'anthropic':
      return ['curl', 'python', 'claudeCode']
    case 'openai':
      return ['curl', 'python', 'nodejs', 'typescript']
    default:
      return ['curl', 'nodejs', 'python']
  }
}

/** Tab 展示文案：Python/Node.js 在 openai/anthropic 协议下要带协议后缀区分 SDK 风格 */
export function languageLabel(protocol: ApiProtocol, language: ApiCodeLanguage): string {
  if (language === 'python') return protocol === 'anthropic' ? 'Python (Anthropic)' : 'Python (OpenAI)'
  if (language === 'nodejs') return 'Node.js (OpenAI)'
  if (language === 'typescript') return 'TypeScript (fetch)'
  return LANGUAGE_LABEL[language]
}

/** 固定代码示例模板：不读取当前草稿、附件和模型参数，只做格式展示 */
export function buildCodeSample(protocol: ApiProtocol, language: ApiCodeLanguage, modelId: string): string {
  // 网关真实 base：OpenAI 兼容协议带 /v1，Anthropic 兼容协议不带 /v1（见 modelgo-env-urls 记忆）
  const endpoint =
    protocol === 'anthropic'
      ? 'https://api.modelgo.com/messages'
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
    case 'typescript':
      // TypeScript(fetch)：只允许 openai 协议出现（见 languagesForProtocol），固定用浏览器/Node
      // 原生 fetch，不引入额外 SDK 依赖，区别于 nodejs Tab 的 node-fetch 写法。
      return [
        `interface ChatCompletionResponse {`,
        `  choices: { message: { content: string } }[];`,
        `}`,
        ``,
        `const res = await fetch("${endpoint}", {`,
        `  method: "POST",`,
        `  headers: {`,
        `    Authorization: \`Bearer \${process.env.MODELGO_API_KEY}\`,`,
        `    "Content-Type": "application/json",`,
        `  },`,
        `  body: JSON.stringify(${bodyKeys}),`,
        `});`,
        `const data: ChatCompletionResponse = await res.json();`,
        `console.log(data.choices[0].message.content);`,
      ].join('\n')
    case 'python':
      if (protocol === 'anthropic') {
        return [
          `import os`,
          `from anthropic import Anthropic`,
          ``,
          `client = Anthropic(`,
          `    api_key=os.environ["MODELGO_API_KEY"],`,
          `    base_url="https://api.modelgo.com",`,
          `)`,
          ``,
          `message = client.messages.create(`,
          `    model="${modelId}",`,
          `    max_tokens=1024,`,
          `    messages=[{"role": "user", "content": "Hello"}],`,
          `)`,
          `print(message.content)`,
        ].join('\n')
      }
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
    case 'claudeCode':
      // Claude Code 只在 anthropic 协议下展示（见 languagesForProtocol）。命令行形式，
      // 参照 @model-go/config（modelgo-config 仓）README「30 秒上手」的用法风格：
      // 先用 config 工具一次性写入 ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY，再用
      // --model 指定当前模型启动 Claude Code。
      return [
        `# 一键写入 Claude Code 配置（@model-go/config）`,
        `npx @model-go/config -k $MODELGO_API_KEY --only claude`,
        ``,
        `# 指定当前模型启动`,
        `claude --model ${modelId}`,
      ].join('\n')
    default:
      return ''
  }
}
