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
import { getGatewayDomain } from '@/config/gateway'
import { sortProtocols } from '@/features/models/model-format'
import type { PublicProtocol } from '@/types'

/**
 * 本模块内部协议标识。2026-08 随 gateway_models.public_protocols 升级为端点粒度：
 * openai_chat/openai_responses/openai_images/openai_embeddings/openai_audio/
 * anthropic_messages 是新 6 值，openai/anthropic 是过渡期未重新打标模型仍会下发的
 * 旧值（原样保留，代码示例与各自的端点粒度同名值等价：openai≈openai_chat，
 * anthropic≈anthropic_messages）。native 是本模块内部值，对应旧 'other'（见
 * mapApiProtocols），不直接来自后端。
 */
export type ApiProtocol =
  | 'openai_chat'
  | 'openai_responses'
  | 'openai_images'
  | 'openai_embeddings'
  | 'openai_audio'
  | 'anthropic_messages'
  | 'openai'
  | 'anthropic'
  | 'native'
export type ApiCodeLanguage = 'curl' | 'nodejs' | 'python' | 'typescript' | 'claudeCode'

/**
 * 下面两张表是**本地兜底**——真源是 modelgo-model-gateway `pkg/publicprotocols`
 * 注册表，经 /catalog/public-protocols 运行时拉取后用 mergeProtocolLabels 覆盖
 * （见 ApiQuickCallModal.tsx / ApiAccessPanel.tsx）；文案与 model-format.ts 的
 * PROTOCOL_LABEL_ZH/EN 同口径（2026-08-26 对齐）。openai/anthropic（过渡期旧值）
 * 与 native（本模块内部值，对应远端 'other'，不在远端目录里，恒用本地文案）不参与
 * 覆盖。
 */
export const PROTOCOL_LABEL: Record<ApiProtocol, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openai_chat: 'OpenAI 兼容',
  openai_responses: 'OpenAI Response',
  openai_images: 'OpenAI 图片',
  openai_embeddings: 'OpenAI 向量',
  openai_audio: 'OpenAI 语音',
  anthropic_messages: 'Anthropic 兼容',
  // 原生协议不展示推理供应商名称
  native: '原生 API',
}

export const PROTOCOL_LABEL_EN: Record<ApiProtocol, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openai_chat: 'OpenAI Compatible',
  openai_responses: 'OpenAI Responses',
  openai_images: 'OpenAI Images',
  openai_embeddings: 'OpenAI Embeddings',
  openai_audio: 'OpenAI Audio',
  anthropic_messages: 'Anthropic Compatible',
  native: 'Native API',
}

/** 是否是 Anthropic 家族协议（旧 anthropic 值与新 anthropic_messages 端点等价）。 */
function isAnthropicProtocol(protocol: ApiProtocol): boolean {
  return protocol === 'anthropic' || protocol === 'anthropic_messages'
}

const LANGUAGE_LABEL: Record<ApiCodeLanguage, string> = {
  curl: 'cURL',
  nodejs: 'Node.js',
  python: 'Python',
  typescript: 'TypeScript',
  claudeCode: 'Claude Code',
}

/**
 * 每个协议展示的代码 Tab（PRD §7.6 原文，2026-08 端点粒度升级后 openai 家族 5 个
 * 端点值——chat/responses/images/embeddings/audio——语言集与旧 openai 值一致，
 * anthropic_messages 与旧 anthropic 值一致）：
 * - OpenAI 家族：cURL、Python（OpenAI）、Node.js（OpenAI）、TypeScript（fetch）
 * - Anthropic 家族：cURL、Python（Anthropic）、Claude Code
 * - 其他/原生协议：不伪造不受支持的 OpenAI/Anthropic 示例（PRD §4.2「非目标」），
 *   保留最基础的 cURL/Node.js/Python 通用示例。
 */
export function languagesForProtocol(protocol: ApiProtocol): ApiCodeLanguage[] {
  if (isAnthropicProtocol(protocol)) return ['curl', 'python', 'claudeCode']
  switch (protocol) {
    case 'openai':
    case 'openai_chat':
    case 'openai_responses':
    case 'openai_images':
    case 'openai_embeddings':
    case 'openai_audio':
      return ['curl', 'python', 'nodejs', 'typescript']
    default:
      return ['curl', 'nodejs', 'python']
  }
}

/** Tab 展示文案：Python/Node.js 在 openai/anthropic 家族协议下要带协议后缀区分 SDK 风格 */
export function languageLabel(protocol: ApiProtocol, language: ApiCodeLanguage): string {
  if (language === 'python') return isAnthropicProtocol(protocol) ? 'Python (Anthropic)' : 'Python (OpenAI)'
  if (language === 'nodejs') return 'Node.js (OpenAI)'
  if (language === 'typescript') return 'TypeScript (fetch)'
  return LANGUAGE_LABEL[language]
}

/**
 * CatalogModelItem/Detail 的 protocols 用 'other'，本模块内部用 'native'——统一在此
 * 映射，避免各处各写一份。2026-08 起 'other' 是唯一需要重映射的值：新增的 6 个端点
 * 粒度值（openai_chat 起）与旧 openai/anthropic 值一样，原样映射到自身。
 */
export function mapApiProtocols(protocols: PublicProtocol[] | undefined): ApiProtocol[] {
  // 顺序统一 sortProtocols（QA：端点兼容顺序不一致），协议 Tab 顺序不再跟后端数组走
  return sortProtocols((protocols ?? []).map((p): ApiProtocol => (p === 'other' ? 'native' : p)))
}

/**
 * 端点粒度协议 → { 路径, 请求体 } 表（PRD 端点表，2026-08 升级）。openai/anthropic
 * 两个旧值分别复用 openai_chat/anthropic_messages 的端点与请求体——过渡期未重新
 * 打标的模型语义就是「Chat Completions」「Messages」，与新值等价。native 单独在
 * 调用处处理（不进这张表），'other' 不会进到这里（mapApiProtocols 已重映射为 native）。
 */
const ENDPOINT_PATH: Record<Exclude<ApiProtocol, 'native'>, string> = {
  openai: '/v1/chat/completions',
  openai_chat: '/v1/chat/completions',
  openai_responses: '/v1/responses',
  openai_images: '/v1/images/generations',
  openai_embeddings: '/v1/embeddings',
  openai_audio: '/v1/audio/speech',
  anthropic: '/messages',
  anthropic_messages: '/messages',
}

function bodyKeysFor(protocol: ApiProtocol, modelId: string): string {
  switch (protocol) {
    case 'anthropic':
    case 'anthropic_messages':
      return `{"model":"${modelId}","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}`
    case 'openai_responses':
      return `{"model":"${modelId}","input":"Hello"}`
    case 'openai_images':
      return `{"model":"${modelId}","prompt":"A cute corgi wearing sunglasses","n":1,"size":"1024x1024"}`
    case 'openai_embeddings':
      return `{"model":"${modelId}","input":"Hello, world!"}`
    case 'openai_audio':
      return `{"model":"${modelId}","input":"Hello, welcome to ModelGo.","voice":"alloy"}`
    default:
      return `{"model":"${modelId}","messages":[{"role":"user","content":"Hello"}]}`
  }
}

/** 固定代码示例模板：不读取当前草稿、附件和模型参数，只做格式展示 */
export function buildCodeSample(protocol: ApiProtocol, language: ApiCodeLanguage, modelId: string): string {
  // 网关真实 base：OpenAI 兼容协议带 /v1，Anthropic 兼容协议不带 /v1（见 modelgo-env-urls 记忆）
  // 域名按当前市场取（国内 api.modelgo.com / 国际 api.modelgo.ai），不写死——
  // 写死会让国际站的示例代码给出国内网关地址，复制即用不了（需求方 shared/modelgo_prd#376）
  const base = `https://${getGatewayDomain()}`
  const endpoint = protocol === 'native' ? `${base}/v1/native/generate` : `${base}${ENDPOINT_PATH[protocol]}`
  const bodyKeys = bodyKeysFor(protocol, modelId)
  // openai_audio（TTS）响应是二进制音频，不是 JSON——示例落盘成文件而不是打印 JSON，
  // 其余端点（含 native）响应统一是 JSON，沿用原有 “打印返回体” 写法。
  const isAudio = protocol === 'openai_audio'

  switch (language) {
    case 'curl':
      return isAudio
        ? [
            `curl ${endpoint} \\`,
            `  -H "Authorization: Bearer $MODELGO_API_KEY" \\`,
            `  -H "Content-Type: application/json" \\`,
            `  -d '${bodyKeys}' \\`,
            `  --output speech.mp3`,
          ].join('\n')
        : [
            `curl ${endpoint} \\`,
            `  -H "Authorization: Bearer $MODELGO_API_KEY" \\`,
            `  -H "Content-Type: application/json" \\`,
            `  -d '${bodyKeys}'`,
          ].join('\n')
    case 'nodejs':
      return isAudio
        ? [
            `import fetch from "node-fetch";`,
            `import { writeFile } from "node:fs/promises";`,
            ``,
            `const res = await fetch("${endpoint}", {`,
            `  method: "POST",`,
            `  headers: {`,
            `    Authorization: \`Bearer \${process.env.MODELGO_API_KEY}\`,`,
            `    "Content-Type": "application/json",`,
            `  },`,
            `  body: JSON.stringify(${bodyKeys}),`,
            `});`,
            `await writeFile("speech.mp3", Buffer.from(await res.arrayBuffer()));`,
          ].join('\n')
        : [
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
      // TypeScript(fetch)：只允许 openai 家族协议出现（见 languagesForProtocol），固定用
      // 浏览器/Node 原生 fetch，不引入额外 SDK 依赖，区别于 nodejs Tab 的 node-fetch 写法。
      // 仅 chat 端点（openai/openai_chat）响应形状固定为 choices[0].message.content，
      // 其余端点（responses/images/embeddings/audio）响应结构各不相同，示例只做通用打印。
      if (protocol === 'openai' || protocol === 'openai_chat') {
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
      }
      if (isAudio) {
        return [
          `const res = await fetch("${endpoint}", {`,
          `  method: "POST",`,
          `  headers: {`,
          `    Authorization: \`Bearer \${process.env.MODELGO_API_KEY}\`,`,
          `    "Content-Type": "application/json",`,
          `  },`,
          `  body: JSON.stringify(${bodyKeys}),`,
          `});`,
          `const audio = new Uint8Array(await res.arrayBuffer());`,
          `// 二进制音频数据，按需写入文件或播放`,
        ].join('\n')
      }
      return [
        `const res = await fetch("${endpoint}", {`,
        `  method: "POST",`,
        `  headers: {`,
        `    Authorization: \`Bearer \${process.env.MODELGO_API_KEY}\`,`,
        `    "Content-Type": "application/json",`,
        `  },`,
        `  body: JSON.stringify(${bodyKeys}),`,
        `});`,
        `const data: unknown = await res.json();`,
        `console.log(data);`,
      ].join('\n')
    case 'python':
      if (isAnthropicProtocol(protocol)) {
        return [
          `import os`,
          `from anthropic import Anthropic`,
          ``,
          `client = Anthropic(`,
          `    api_key=os.environ["MODELGO_API_KEY"],`,
          `    base_url="${base}",`,
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
      if (isAudio) {
        return [
          `import os, requests`,
          ``,
          `res = requests.post(`,
          `    "${endpoint}",`,
          `    headers={"Authorization": f"Bearer {os.environ['MODELGO_API_KEY']}"},`,
          `    json=${bodyKeys},`,
          `)`,
          `with open("speech.mp3", "wb") as f:`,
          `    f.write(res.content)`,
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
      // Claude Code 只在 anthropic 家族协议下展示（见 languagesForProtocol）。命令行形式，
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
