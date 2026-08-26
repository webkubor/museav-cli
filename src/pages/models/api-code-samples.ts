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
 * 本模块内部协议标识。2026-08-26 随 gateway_models.public_protocols 按「厂商 +
 * 能力」命名规范扩容为 12 值：openai_chat 改名 openai_chat_completions，
 * openai_audio 拆成 openai_speech（TTS）/openai_transcriptions（STT，multipart
 * 而非 JSON body），新增 openai_rerank；openai/anthropic 是过渡期未重新打标模型仍
 * 会下发的旧值（原样保留，代码示例与各自的端点粒度同名值等价：openai≈
 * openai_chat_completions，anthropic≈anthropic_messages）。native 是本模块内部值，
 * 对应远端 'other' 以及三个 Google 原生透传值 google_gemini/google_imagen/
 * google_video（原生协议各家请求形状不同，本模块不伪造 OpenAI/Anthropic 风格的
 * 示例，统一走 native 的通用兜底，见 mapApiProtocols），不直接来自后端。
 */
export type ApiProtocol =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'openai_embeddings'
  | 'openai_rerank'
  | 'openai_images'
  | 'openai_speech'
  | 'openai_transcriptions'
  | 'anthropic_messages'
  | 'openai'
  | 'anthropic'
  | 'native'
export type ApiCodeLanguage = 'curl' | 'nodejs' | 'python' | 'typescript' | 'claudeCode'

/**
 * 下面两张表是**本地兜底**——真源是 modelgo-model-gateway `pkg/publicprotocols`
 * 注册表，经 /catalog/public-protocols 运行时拉取后用 mergeProtocolLabels 覆盖
 * （见 ApiQuickCallModal.tsx / ApiAccessPanel.tsx）；文案与 model-format.ts 的
 * PROTOCOL_LABEL_ZH/EN 同口径（厂商+能力英文专名，中英同名）。openai/anthropic
 * （过渡期旧值）与 native（本模块内部值，对应远端 'other'/google_* 三值，不在远端
 * 目录里，恒用本地文案）不参与覆盖。
 */
export const PROTOCOL_LABEL: Record<ApiProtocol, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openai_chat_completions: 'OpenAI Chat Completions',
  openai_responses: 'OpenAI Responses',
  openai_embeddings: 'OpenAI Embeddings',
  openai_rerank: 'OpenAI Rerank',
  openai_images: 'OpenAI Images',
  openai_speech: 'OpenAI Speech',
  openai_transcriptions: 'OpenAI Transcriptions',
  anthropic_messages: 'Anthropic Messages',
  // 原生协议不展示推理供应商名称
  native: '原生 API',
}

export const PROTOCOL_LABEL_EN: Record<ApiProtocol, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openai_chat_completions: 'OpenAI Chat Completions',
  openai_responses: 'OpenAI Responses',
  openai_embeddings: 'OpenAI Embeddings',
  openai_rerank: 'OpenAI Rerank',
  openai_images: 'OpenAI Images',
  openai_speech: 'OpenAI Speech',
  openai_transcriptions: 'OpenAI Transcriptions',
  anthropic_messages: 'Anthropic Messages',
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
    case 'openai_chat_completions':
    case 'openai_responses':
    case 'openai_embeddings':
    case 'openai_rerank':
    case 'openai_images':
    case 'openai_speech':
      return ['curl', 'python', 'nodejs', 'typescript']
    // openai_transcriptions 是 multipart/form-data 请求（-F 文件字段），跟其余
    // openai 家族的 JSON body 形状不同，不提供假装是 JSON fetch 的 TypeScript 示例。
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
 * CatalogModelItem/Detail 的 protocols 用 'other' 与三个 Google 原生透传值，本模块
 * 内部统一映射到 'native'——避免各处各写一份，也避免为原生协议伪造 OpenAI/
 * Anthropic 风格的示例（PRD §4.2）。2026-08-26 起需要重映射的是 'other' 与
 * google_gemini/google_imagen/google_video 四个值；其余端点粒度值（
 * openai_chat_completions 起）与旧 openai/anthropic 值一样，原样映射到自身。
 */
export function mapApiProtocols(protocols: PublicProtocol[] | undefined): ApiProtocol[] {
  const NATIVE_ONLY = new Set(['other', 'google_gemini', 'google_imagen', 'google_video'])
  // 顺序统一 sortProtocols（QA：端点兼容顺序不一致），协议 Tab 顺序不再跟后端数组走
  return sortProtocols((protocols ?? []).map((p): ApiProtocol => (NATIVE_ONLY.has(p) ? 'native' : (p as ApiProtocol))))
}

/**
 * 端点粒度协议 → 路径表（PRD 端点表，2026-08-26 随厂商+能力命名升级）。openai/
 * anthropic 两个旧值分别复用 openai_chat_completions/anthropic_messages 的端点——
 * 过渡期未重新打标的模型语义就是「Chat Completions」「Messages」，与新值等价。
 * native 单独在调用处处理（不进这张表），'other' 与 google_* 三值不会进到这里
 * （mapApiProtocols 已重映射为 native）。
 */
const ENDPOINT_PATH: Record<Exclude<ApiProtocol, 'native'>, string> = {
  openai: '/v1/chat/completions',
  openai_chat_completions: '/v1/chat/completions',
  openai_responses: '/v1/responses',
  openai_embeddings: '/v1/embeddings',
  openai_rerank: '/v1/rerank',
  openai_images: '/v1/images/generations',
  openai_speech: '/v1/audio/speech',
  openai_transcriptions: '/v1/audio/transcriptions',
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
    case 'openai_embeddings':
      return `{"model":"${modelId}","input":"Hello, world!"}`
    case 'openai_rerank':
      return `{"model":"${modelId}","query":"What is ModelGo?","documents":["ModelGo is a model gateway.","The weather is nice today."]}`
    case 'openai_images':
      return `{"model":"${modelId}","prompt":"A cute corgi wearing sunglasses","n":1,"size":"1024x1024"}`
    case 'openai_speech':
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
  // openai_speech（TTS）响应是二进制音频，不是 JSON——示例落盘成文件而不是打印 JSON。
  // openai_transcriptions（STT）请求本身是 multipart/form-data（上传音频文件），不是
  // JSON body——跟其余端点（含 native）的 JSON 请求/JSON 响应形状都不一样，单独处理。
  const isAudio = protocol === 'openai_speech'
  const isTranscription = protocol === 'openai_transcriptions'

  switch (language) {
    case 'curl':
      if (isTranscription) {
        return [
          `curl ${endpoint} \\`,
          `  -H "Authorization: Bearer $MODELGO_API_KEY" \\`,
          `  -F model="${modelId}" \\`,
          `  -F file="@audio.mp3"`,
        ].join('\n')
      }
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
      if (isTranscription) {
        return [
          `import fs from "node:fs";`,
          `import fetch, { FormData, fileFromSync } from "node-fetch";`,
          ``,
          `const form = new FormData();`,
          `form.set("model", "${modelId}");`,
          `form.set("file", fileFromSync("audio.mp3"));`,
          `const res = await fetch("${endpoint}", {`,
          `  method: "POST",`,
          `  headers: { Authorization: \`Bearer \${process.env.MODELGO_API_KEY}\` },`,
          `  body: form,`,
          `});`,
          `console.log(await res.json());`,
        ].join('\n')
      }
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
      // TypeScript(fetch)：只允许 openai 家族协议出现（见 languagesForProtocol，
      // openai_transcriptions 因 multipart 请求形状不同被排除在外），固定用
      // 浏览器/Node 原生 fetch，不引入额外 SDK 依赖，区别于 nodejs Tab 的 node-fetch 写法。
      // 仅 chat 端点（openai/openai_chat_completions）响应形状固定为
      // choices[0].message.content，其余端点（responses/embeddings/rerank/images/
      // speech）响应结构各不相同，示例只做通用打印。
      if (protocol === 'openai' || protocol === 'openai_chat_completions') {
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
      if (isTranscription) {
        return [
          `import os, requests`,
          ``,
          `res = requests.post(`,
          `    "${endpoint}",`,
          `    headers={"Authorization": f"Bearer {os.environ['MODELGO_API_KEY']}"},`,
          `    data={"model": "${modelId}"},`,
          `    files={"file": open("audio.mp3", "rb")},`,
          `)`,
          `print(res.json())`,
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
