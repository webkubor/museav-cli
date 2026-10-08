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
import { isZhLang, sortProtocols } from '@/features/models/model-format'
import type { PublicProtocol } from '@/types'

/**
 * 本模块内部协议标识 —— 「本模块能生成可复制示例」的那些协议，是 PublicProtocol
 * 的真子集，两者的对应关系由 PROTOCOL_TO_API 穷尽声明。
 *
 * 收录标准：平台自有、路径固定、请求体形状确定的端点。
 * - OpenAI/Anthropic 兼容端点（openai_chat_completions 起的 13 个）；
 * - content_generation：平台统一的异步内容生成任务入口（创建任务 → 轮询），
 *   视频/图像里走托管异步链路的模型打这个标（接入文档 models/video/async-tasks）；
 * - openai/anthropic：过渡期未重新打标模型仍会下发的旧值，示例与各自的端点粒度
 *   同名值等价（openai≈openai_chat_completions，anthropic≈anthropic_messages）；
 * - native：本模块内部值，不来自后端。各家原生透传（gemini_* / ark_* / kling_* /
 *   hailuo_* / vidu_*）与旧 'other' 都折到这里——它们的请求体各家互不相同，本模块
 *   不为它们伪造 OpenAI 风格示例（PRD §4.2「非目标」），给的是平台托管异步入口。
 */
export type ApiProtocol =
  | 'openai_chat_completions'
  | 'openai_responses'
  | 'openai_completions'
  | 'openai_embeddings'
  | 'openai_embeddings_multimodal'
  | 'openai_rerank'
  | 'openai_images'
  | 'openai_images_edits'
  | 'openai_speech'
  | 'openai_transcriptions'
  | 'openai_translations'
  | 'anthropic_messages'
  | 'openai_video'
  | 'content_generation'
  | 'dashscope_realtime'
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
  openai_completions: 'OpenAI Completions',
  openai_embeddings_multimodal: 'OpenAI Multimodal Embeddings',
  openai_images_edits: 'OpenAI Image Edits',
  openai_translations: 'OpenAI Translations',
  openai_video: 'OpenAI Video',
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
  // 与后端目录、model-format.ts 的 PROTOCOL_LABEL_ZH 同口径（中英同名专名）
  content_generation: 'Content Generation',
  dashscope_realtime: 'DashScope Realtime',
  // 原生协议不展示推理供应商名称
  native: '原生 API',
}

export const PROTOCOL_LABEL_EN: Record<ApiProtocol, string> = {
  openai_completions: 'OpenAI Completions',
  openai_embeddings_multimodal: 'OpenAI Multimodal Embeddings',
  openai_images_edits: 'OpenAI Image Edits',
  openai_translations: 'OpenAI Translations',
  openai_video: 'OpenAI Video',
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
  content_generation: 'Content Generation',
  dashscope_realtime: 'DashScope Realtime',
  native: 'Native API',
}

/** 是否是 Anthropic 家族协议（旧 anthropic 值与新 anthropic_messages 端点等价）。 */
function isAnthropicProtocol(protocol: ApiProtocol): boolean {
  return protocol === 'anthropic' || protocol === 'anthropic_messages'
}

/**
 * 平台托管链路（异步内容生成任务 / 各家原生透传兜底）：示例是裸 curl / fetch /
 * requests，不经过任何厂商 SDK。语言 Tab 因此不能挂「(OpenAI)」后缀——挂了会让人
 * 以为可以拿 openai SDK 直连这个端点。
 */
function isPlatformLane(protocol: ApiProtocol): boolean {
  return protocol === 'content_generation' || protocol === 'native'
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
  if (protocol === 'dashscope_realtime') return ['nodejs', 'python']
  if (isAnthropicProtocol(protocol)) return ['curl', 'python', 'claudeCode']
  switch (protocol) {
    case 'openai':
    case 'openai_chat_completions':
    case 'openai_responses':
    case 'openai_completions':
    case 'openai_embeddings':
    case 'openai_embeddings_multimodal':
    case 'openai_rerank':
    case 'openai_images':
    case 'openai_images_edits':
    case 'openai_speech':
    case 'openai_video':
      return ['curl', 'python', 'nodejs', 'typescript']
    // openai_transcriptions 是 multipart/form-data 请求（-F 文件字段），跟其余
    // openai 家族的 JSON body 形状不同，不提供假装是 JSON fetch 的 TypeScript 示例。
    default:
      return ['curl', 'nodejs', 'python']
  }
}

/** Tab 展示文案：Python/Node.js 在 openai/anthropic 家族协议下要带协议后缀区分 SDK 风格 */
export function languageLabel(protocol: ApiProtocol, language: ApiCodeLanguage): string {
  if (language === 'python') {
    if (isAnthropicProtocol(protocol)) return 'Python (Anthropic)'
    return isPlatformLane(protocol) ? 'Python' : 'Python (OpenAI)'
  }
  if (language === 'nodejs') return isPlatformLane(protocol) ? 'Node.js' : 'Node.js (OpenAI)'
  if (language === 'typescript') return 'TypeScript (fetch)'
  return LANGUAGE_LABEL[language]
}

/**
 * 后端 public_protocols → 本模块协议标识的**穷尽映射**。
 *
 * ⚠️ 为什么必须是一张全量表，而不是「原生透传类走正则、其余原样透传」：原样透传
 * 在后端枚举扩容时**不报错**。2026-08-26 网关把 public_protocols 扩到 42 值时，
 * model-format.ts 的两张标签表跟上了、本模块没跟上，`content_generation` 于是既
 * 拿不到文案也拿不到端点——线上表现是详情页「API 接入」的协议 Tab 塌成一个只剩
 * padding 的纯色块（国内 8 个 / 国外 17 个视频模型全中，2026-08-28 两站实测）。
 * 改成 Record<PublicProtocol, ApiProtocol> 之后，PublicProtocol 每新增一个值，
 * `tsc -b` 会当场顶出这里缺的那条，逼着新值表态，不再靠人记得。
 *
 * 表态只有两种：映射到同名值（在 ENDPOINT_PATH 里有实测过的真实路径），或者折成
 * native（请求体形状各家互不相同，不伪造 OpenAI 风格示例，PRD §4.2「非目标」）。
 */
const PROTOCOL_TO_API: Record<PublicProtocol, ApiProtocol> = {
  // ── 平台自有端点：路径固定、请求体形状确定，示例可复制即用 ──
  openai_chat_completions: 'openai_chat_completions',
  openai_responses: 'openai_responses',
  openai_completions: 'openai_completions',
  openai_embeddings: 'openai_embeddings',
  openai_embeddings_multimodal: 'openai_embeddings_multimodal',
  openai_rerank: 'openai_rerank',
  openai_images: 'openai_images',
  openai_images_edits: 'openai_images_edits',
  openai_speech: 'openai_speech',
  openai_transcriptions: 'openai_transcriptions',
  openai_translations: 'openai_translations',
  anthropic_messages: 'anthropic_messages',
  openai_video: 'openai_video',
  content_generation: 'content_generation',
  dashscope_realtime: 'dashscope_realtime',
  // ── 过渡期旧值：语义等于各自的端点粒度同名值 ──
  openai: 'openai',
  anthropic: 'anthropic',
  // ── 各家原生透传 + 旧 'other'：折成 native ──
  gemini_generate_content: 'native',
  gemini_predict: 'native',
  gemini_predict_long_running: 'native',
  gemini_files: 'native',
  ark_batch_chat_completions: 'native',
  ark_context_create: 'native',
  ark_context_chat_completions: 'native',
  ark_tokenization: 'native',
  kling_text2video: 'native',
  kling_image2video: 'native',
  kling_multi_image2video: 'native',
  kling_omni_video: 'native',
  kling_video_extend: 'native',
  kling_motion_control: 'native',
  kling_avatar_image2video: 'native',
  kling_multi_elements: 'native',
  kling_advanced_lip_sync: 'native',
  kling_text_to_audio: 'native',
  kling_video_to_audio: 'native',
  kling_tts: 'native',
  hailuo_video_generation: 'native',
  vidu_text2video: 'native',
  vidu_img2video: 'native',
  vidu_start_end2video: 'native',
  vidu_reference2video: 'native',
  other: 'native',
}

export function mapApiProtocols(protocols: PublicProtocol[] | undefined): ApiProtocol[] {
  // `?? 'native'` 兜的是**运行时**比 PublicProtocol 新的值（后端先发、前端还没跟）。
  // 绝不原样透传未知值：透传的下场就是 ENDPOINT_PATH[未知] 的 undefined 拼进 URL，
  // 加上没有文案的空 Tab。折成 native 至少给出平台托管入口这条能用的路。
  const mapped = (protocols ?? []).map((p): ApiProtocol => PROTOCOL_TO_API[p] ?? 'native')
  // 去重：多个原生透传值（如 kling_text2video + kling_image2video）会折到同一个
  // native，不去重就是两个一模一样的 Tab + React 重复 key 告警。
  // 顺序统一 sortProtocols（QA：端点兼容顺序不一致），协议 Tab 顺序不跟后端数组走。
  return sortProtocols([...new Set(mapped)])
}

/**
 * 协议 → 网关真实路径。openai/anthropic 两个旧值分别复用 openai_chat_completions/
 * anthropic_messages 的端点——过渡期未重新打标的模型语义就是「Chat Completions」
 * 「Messages」，与新值等价。native 也进这张表（不再在调用处特判），值取平台托管
 * 的异步任务入口。
 *
 * 真源 = /catalog/public-protocols 下发的 endpoint 字段 + 接入文档
 * （modelgo-doc-web `content/<market>/<lang>/models/`）。2026-08-28 对 api.modelgo.ai /
 * api.modelgo.com 逐条 POST 探活校准（**401 = 路由存在且需鉴权，404 = 没这条路由**），
 * 改掉两条网关上根本不存在的路径：
 * - anthropic 家族 `/messages` → `/v1/messages`。旧值两个网关都实测 404，线上
 *   792 个 Anthropic 协议模型的 cURL / fetch 示例复制过去全是 404；Python
 *   (Anthropic) Tab 走 SDK 的 base_url 自己拼 /v1/messages，一直是对的，不受影响。
 * - native `/v1/native/generate` → `/v1/content_generation/tasks`（接入文档「通用
 *   异步内容生成任务」，平台统一的创建任务 → 轮询入口）。旧值同样实测 404。
 */
const ENDPOINT_PATH: Record<ApiProtocol, string> = {
  openai: '/v1/chat/completions',
  openai_chat_completions: '/v1/chat/completions',
  openai_responses: '/v1/responses',
  openai_completions: '/v1/completions',
  openai_embeddings: '/v1/embeddings',
  openai_embeddings_multimodal: '/v1/embeddings/multimodal',
  openai_rerank: '/v1/rerank',
  openai_images: '/v1/images/generations',
  openai_images_edits: '/v1/images/edits',
  openai_speech: '/v1/audio/speech',
  openai_transcriptions: '/v1/audio/transcriptions',
  openai_translations: '/v1/audio/translations',
  openai_video: '/v1/video/generations',
  anthropic: '/v1/messages',
  anthropic_messages: '/v1/messages',
  content_generation: '/v1/content_generation/tasks',
  dashscope_realtime: '/api-ws/v1/realtime',
  native: '/v1/content_generation/tasks',
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
    case 'openai_completions':
      return `{"model":"${modelId}","prompt":"Hello"}`
    case 'openai_embeddings_multimodal':
      return `{"model":"${modelId}","input":[{"type":"text","text":"Hello, world!"}]}`
    case 'openai_video':
      return `{"model":"${modelId}","prompt":"a neon city cat"}`
    case 'openai_rerank':
      return `{"model":"${modelId}","query":"What is ModelGo?","documents":["ModelGo is a model gateway.","The weather is nice today."]}`
    case 'openai_images':
      return `{"model":"${modelId}","prompt":"A cute corgi wearing sunglasses","n":1,"size":"1024x1024"}`
    case 'openai_speech':
      return `{"model":"${modelId}","input":"Hello, welcome to ModelGo.","voice":"alloy"}`
    // 平台统一异步任务入口：创建任务只要 model + 通用生成字段（不是 chat messages），
    // 结果靠 GET /v1/content_generation/tasks/{task_id} 轮询（接入文档
    // models/video/async-tasks「通用异步内容生成任务」）。
    case 'content_generation':
    case 'native':
      return `{"model":"${modelId}","prompt":"a neon city cat"}`
    default:
      return `{"model":"${modelId}","messages":[{"role":"user","content":"Hello"}]}`
  }
}

/** 固定代码示例模板：不读取当前草稿、附件和模型参数，只做格式展示 */
export function buildCodeSample(protocol: ApiProtocol, language: ApiCodeLanguage, modelId: string): string {
  // base 只到域名，`/v1` 一律由 ENDPOINT_PATH 携带（Anthropic 家族也是 /v1/messages，
  // 2026-08-28 双网关探活确认）；Python (Anthropic) 示例例外——SDK 的 base_url 要的
  // 就是不带 /v1 的裸域名，它自己拼 /v1/messages。
  // 域名按当前市场取（国内 api.modelgo.com / 国际 api.modelgo.ai），不写死——
  // 写死会让国际站的示例代码给出国内网关地址，复制即用不了（需求方 shared/modelgo_prd#376）
  const base = `https://${getGatewayDomain()}`
  const endpoint = `${base}${ENDPOINT_PATH[protocol]}`
  const bodyKeys = bodyKeysFor(protocol, modelId)
  // openai_speech（TTS）响应是二进制音频，不是 JSON——示例落盘成文件而不是打印 JSON。
  // openai_transcriptions（STT）请求本身是 multipart/form-data（上传音频文件），不是
  // JSON body——跟其余端点（含 native）的 JSON 请求/JSON 响应形状都不一样，单独处理。
  const isAudio = protocol === 'openai_speech'
  const isTranscription = protocol === 'openai_transcriptions'
  // 示例里的注释也要跟界面语言走：英文站复制到的代码带中文注释，等于把中文
  // 漏进了对外英文页面（同 shared/modelgo_prd#1067 的那类整块未适配）。
  const isZh = isZhLang()

  if (protocol === 'dashscope_realtime') {
    const realtimeEndpoint = `wss://${getGatewayDomain()}${ENDPOINT_PATH[protocol]}?model=${encodeURIComponent(modelId)}`
    if (language === 'python') {
      return [
        `# pip install "websockets>=14"`,
        `import asyncio`,
        `import os`,
        `import websockets`,
        ``,
        `async def main():`,
        `    async with websockets.connect(`,
        `        "${realtimeEndpoint}",`,
        `        additional_headers={"Authorization": f"Bearer {os.environ['MODELGO_API_KEY']}"},`,
        `    ) as ws:`,
        `        print(await ws.recv())  # session.created`,
        `        await ws.send('{"type":"session.update","session":{"modalities":["text","audio"]}}')`,
        `        print(await ws.recv())  # session.updated`,
        ``,
        `asyncio.run(main())`,
      ].join('\n')
    }
    return [
      `// npm install ws`,
      `import WebSocket from "ws";`,
      ``,
      `const ws = new WebSocket("${realtimeEndpoint}", {`,
      `  headers: { Authorization: \`Bearer \${process.env.MODELGO_API_KEY}\` },`,
      `});`,
      ``,
      `ws.on("open", () => {`,
      `  ws.send(JSON.stringify({ type: "session.update", session: { modalities: ["text", "audio"] } }));`,
      `});`,
      `ws.on("message", (data) => console.log(data.toString()));`,
    ].join('\n')
  }

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
          isZh
            ? `// 二进制音频数据，按需写入文件或播放`
            : `// Raw audio bytes — write to a file or play as needed`,
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
        isZh
          ? `# 一键写入 Claude Code 配置（@model-go/config）`
          : `# Write the Claude Code config in one step (@model-go/config)`,
        `npx @model-go/config -k $MODELGO_API_KEY --only claude`,
        ``,
        isZh ? `# 指定当前模型启动` : `# Start Claude Code with this model`,
        `claude --model ${modelId}`,
      ].join('\n')
    default:
      return ''
  }
}
