import React from 'react'
import Anthropic from '@lobehub/icons/es/Anthropic'
import Claude from '@lobehub/icons/es/Claude'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Gemini from '@lobehub/icons/es/Gemini'
import Google from '@lobehub/icons/es/Google'
import DeepSeek from '@lobehub/icons/es/DeepSeek'
import Qwen from '@lobehub/icons/es/Qwen'
import Mistral from '@lobehub/icons/es/Mistral'
import Ollama from '@lobehub/icons/es/Ollama'
import Meta from '@lobehub/icons/es/Meta'
import Moonshot from '@lobehub/icons/es/Moonshot'
import Minimax from '@lobehub/icons/es/Minimax'
import ChatGLM from '@lobehub/icons/es/ChatGLM'
import Cohere from '@lobehub/icons/es/Cohere'
import Groq from '@lobehub/icons/es/Groq'
import Zhipu from '@lobehub/icons/es/Zhipu'
import Baidu from '@lobehub/icons/es/Baidu'
// ── 后端 logo_url 按名匹配用的精选 LLM 图标 ──────────────────────────────────
import OpenRouter from '@lobehub/icons/es/OpenRouter'
import Kimi from '@lobehub/icons/es/Kimi'
import Wenxin from '@lobehub/icons/es/Wenxin'
import Grok from '@lobehub/icons/es/Grok'
import XAI from '@lobehub/icons/es/XAI'
import Doubao from '@lobehub/icons/es/Doubao'
import Hunyuan from '@lobehub/icons/es/Hunyuan'
import Spark from '@lobehub/icons/es/Spark'
import Yi from '@lobehub/icons/es/Yi'
import Stepfun from '@lobehub/icons/es/Stepfun'
import Baichuan from '@lobehub/icons/es/Baichuan'
import InternLM from '@lobehub/icons/es/InternLM'
import Together from '@lobehub/icons/es/Together'
import Fireworks from '@lobehub/icons/es/Fireworks'
import Perplexity from '@lobehub/icons/es/Perplexity'
import Hailuo from '@lobehub/icons/es/Hailuo'
import Volcengine from '@lobehub/icons/es/Volcengine'
import AzureAI from '@lobehub/icons/es/AzureAI'
import OpenCode from '@lobehub/icons/es/OpenCode'
import FastGPT from '@lobehub/icons/es/FastGPT'
import {
  BRAND_ALIASES,
  pickIconComponent,
  resolveVendorKeyFrom,
} from './icon-resolve'

/**
 * 厂商图标工厂：vendor 名（小写）→ 按尺寸渲染图标。
 * 新增厂商：import 对应 lobehub 图标后，在此追加一行即可。
 */
const ICON_FACTORY: Record<string, (size: number) => React.ReactNode> = {
  anthropic: (s) => <Claude.Color size={s} />,
  claude:    (s) => <Claude.Color size={s} />,
  openai:    (s) => <OpenAI size={s} />,
  chatgpt:   (s) => <OpenAI size={s} />,
  gemini:    (s) => <Gemini.Color size={s} />,
  google:    (s) => <Google.Color size={s} />,
  deepseek:  (s) => <DeepSeek.Color size={s} />,
  qwen:      (s) => <Qwen.Color size={s} />,
  // 通义千问的 vendor 字段后端实际写 alibaba / aliyun（catalog 实测 text-embedding-v4
  // 的 vendor 就是 "alibaba"），不补这两个 key 时 vendor 层解析不出、只能靠模型名推断（#791）
  alibaba:   (s) => <Qwen.Color size={s} />,
  aliyun:    (s) => <Qwen.Color size={s} />,
  tongyi:    (s) => <Qwen.Color size={s} />,
  mistral:   (s) => <Mistral.Color size={s} />,
  ollama:    (s) => <Ollama size={s} />,
  meta:      (s) => <Meta.Color size={s} />,
  llama:     (s) => <Meta.Color size={s} />,
  moonshot:  (s) => <Moonshot size={s} />,
  kimi:      (s) => <Moonshot size={s} />,
  minimax:   (s) => <Minimax.Color size={s} />,
  chatglm:   (s) => <ChatGLM.Color size={s} />,
  zhipu:     (s) => <Zhipu.Color size={s} />,
  glm:       (s) => <Zhipu.Color size={s} />,
  cohere:    (s) => <Cohere.Color size={s} />,
  groq:      (s) => <Groq size={s} />,
  baidu:     (s) => <Baidu.Color size={s} />,
  ernie:     (s) => <Baidu.Color size={s} />,
  wenxin:    (s) => <Wenxin size={s} />,
  seedream:  (s) => <Doubao.Color size={s} />,
  skylark:   (s) => <Doubao.Color size={s} />,
  bytedance: (s) => <Doubao.Color size={s} />,
  ark:       (s) => <Doubao.Color size={s} />,
  doubao:    (s) => <Doubao.Color size={s} />,
  hunyuan:   (s) => <Hunyuan size={s} />,
  spark:     (s) => <Spark size={s} />,
  yi:        (s) => <Yi size={s} />,
  stepfun:   (s) => <Stepfun size={s} />,
  baichuan:  (s) => <Baichuan size={s} />,
  internlm:  (s) => <InternLM size={s} />,
  together:  (s) => <Together size={s} />,
  fireworks: (s) => <Fireworks size={s} />,
  perplexity:(s) => <Perplexity size={s} />,
  hailuo:    (s) => <Hailuo size={s} />,
  grok:      (s) => <Grok size={s} />,
  xai:       (s) => <XAI size={s} />,
  openrouter:(s) => <OpenRouter size={s} />,
  volcengine:(s) => <Volcengine.Color size={s} />,
  volcano:   (s) => <Volcengine.Color size={s} />,
  azure:     (s) => <AzureAI.Color size={s} />,
}

/**
 * 按厂商名解析本地图标：先精确命中，再做包含匹配（如 "OpenAI GPT-4" 命中 openai）。
 * 命中返回对应尺寸的图标节点，否则返回 null（交由调用方走文字兜底）。
 */
/**
 * 解析厂商名命中的品牌 key（ICON_FACTORY 的键，如 "deepseek"）。
 * 先精确命中再包含匹配，未命中返回 null。用于「同品牌去重」——多个 provider 值
 * （deepseek / deepseek-v4 / deepseek-chat）会命中同一 key，只需展示一个图标。
 */
export function resolveVendorKey(vendor: string | null | undefined): string | null {
  return resolveVendorKeyFrom(Object.keys(ICON_FACTORY), vendor)
}


/** 解析厂商名命中的「规范品牌」（别名已收敛）。用于同品牌去重，只展示一个图标。 */
export function resolveVendorBrand(vendor: string | null | undefined): string | null {
  const key = resolveVendorKey(vendor)
  if (!key) return null
  return BRAND_ALIASES[key] ?? key
}

export function resolveVendorIcon(
  vendor: string | null | undefined,
  size = 28
): React.ReactNode | null {
  const key = resolveVendorKey(vendor)
  return key ? ICON_FACTORY[key](size) : null
}

/**
 * 模型名/模型 ID 前缀 → vendor key 推断表。
 * 用于 logs/usage/tasks 等没有 vendor 字段、只有 model_id 或 display_name 的场景。
 * 按前缀从长到短匹配，避免 gpt-4o-mini 同时命中 gpt 和 o（不会，但长前缀优先更稳）。
 * 新增模型族：按「前缀（小写）→ ICON_FACTORY 的 key」追加即可。
 */
const MODEL_PREFIX_TO_VENDOR: Array<[string, string]> = [
  // OpenAI 族（gpt / o1 / o3 / chatgpt / dall-e / tts / whisper）
  ['gpt', 'openai'], ['chatgpt', 'openai'], ['o1', 'openai'], ['o3', 'openai'], ['o4', 'openai'],
  ['dall-e', 'openai'], ['dall', 'openai'], ['tts', 'openai'], ['whisper', 'openai'], ['sora', 'openai'],
  ['text-embedding', 'openai'], ['text-davinci', 'openai'],
  // Anthropic / Claude
  ['claude', 'anthropic'], ['anthropic', 'anthropic'],
  // Google / Gemini
  ['gemini', 'gemini'], ['gemma', 'gemini'], ['palm', 'google'], ['bard', 'google'], ['veo', 'google'],
  ['imagen', 'google'],
  // DeepSeek
  ['deepseek', 'deepseek'], ['deep-seek', 'deepseek'],
  // 通义千问
  ['qwen', 'qwen'], ['tongyi', 'qwen'], ['wanx', 'qwen'],
  // 智谱 GLM
  ['glm', 'glm'], ['chatglm', 'chatglm'], ['zhipu', 'zhipu'], ['cogview', 'zhipu'], ['cogvideox', 'zhipu'],
  // Moonshot / Kimi
  ['kimi', 'kimi'], ['moonshot', 'moonshot'], ['moonshot-v1', 'moonshot'],
  // MiniMax
  ['minimax', 'minimax'], ['abab', 'minimax'],
  // 豆包 / 字节
  ['doubao', 'doubao'], ['seedream', 'seedream'], ['skylark', 'skylark'], ['bytedance', 'bytedance'],
  ['ark', 'ark'], ['seaweed', 'bytedance'],
  // 火山引擎（provider 聚合，logo_url=Volcengine.Color）
  ['volcengine', 'volcengine'], ['volcano', 'volcengine'],
  // 百度文心
  ['ernie', 'ernie'], ['wenxin', 'wenxin'], ['baidu', 'baidu'],
  // Mistral
  ['mistral', 'mistral'], ['mixtral', 'mistral'], ['codestral', 'mistral'], ['pixtral', 'mistral'],
  // Meta Llama
  ['llama', 'llama'], ['meta', 'meta'], ['metallama', 'meta'],
  // Cohere
  ['cohere', 'cohere'], ['command', 'cohere'],
  // Groq
  ['groq', 'groq'],
  // 腾讯混元
  ['hunyuan', 'hunyuan'], ['hunyuan-turbos', 'hunyuan'], ['hunyuan-vision', 'hunyuan'],
  // 讯飞星火
  ['spark', 'spark'], ['iflytek', 'spark'], ['xfyun', 'spark'],
  // 零一万物
  ['yi-', 'yi'], ['yi34b', 'yi'], ['yi-lightning', 'yi'],
  // 阶跃
  ['step', 'stepfun'], ['stepfun', 'stepfun'],
  // 百川
  ['baichuan', 'baichuan'],
  // InternLM
  ['internlm', 'internlm'],
  // Grok / xAI
  ['grok', 'grok'], ['xai', 'xai'],
  // OpenRouter（聚合，模型名常带 openrouter/ 前缀）
  ['openrouter', 'openrouter'],
  // 海螺
  ['hailuo', 'hailuo'], ['minimax-hailuo', 'hailuo'],
  // Fireworks
  ['fireworks', 'fireworks'],
  // Together
  ['together', 'together'],
  // Perplexity
  ['perplexity', 'perplexity'], ['sonar', 'perplexity'],
  // Ollama
  ['ollama', 'ollama'],
]

/**
 * 按模型名/模型 ID 前缀推断 vendor key（返回 ICON_FACTORY 的键）。
 * logs/usage/tasks 链路后端未返回 vendor，只能用 model_id 或 display_name 反查。
 * 先转小写 + 去版本后缀（-v1.2 / :latest），再按前缀表从长到短匹配。
 * 命中返回 key，否则 null（交由调用方走文字兜底）。
 */
export function inferVendorByModelName(
  modelIdOrName: string | null | undefined
): string | null {
  if (!modelIdOrName) return null
  // 取最后一段（去掉 provider/ 前缀如 "deepseek/deepseek-chat" → "deepseek-chat"）
  const tail = modelIdOrName.includes('/') ? modelIdOrName.split('/').pop() ?? modelIdOrName : modelIdOrName
  const v = tail.toLowerCase().trim()
  for (const [prefix, vendorKey] of MODEL_PREFIX_TO_VENDOR) {
    if (v.startsWith(prefix)) return vendorKey
  }
  return null
}

// 纯逻辑在 icon-resolve.ts（不 import lobehub，故可单测）；本文件只负责真实图标表与 JSX
type LobehubIconComp = React.ComponentType<{ size?: number }> & Record<string, React.ComponentType<{ size?: number }>>

/**
 * 精选 LLM 图标注册表：lobehub 组件名 → 组件。
 * 新增厂商：import 后在此追加一行即可（只打包用到的，体积可控）。
 */
const LOBEHUB_BY_NAME: Record<string, LobehubIconComp> = {
  OpenAI, OpenRouter, Anthropic, Claude, Gemini, Google, DeepSeek, Qwen, Mistral, Ollama,
  Meta, Moonshot, Kimi, Minimax, ChatGLM, Zhipu, Cohere, Groq, Baidu, Wenxin, Grok, XAI,
  Doubao, Hunyuan, Spark, Yi, Stepfun, Baichuan, InternLM, Together, Fireworks, Perplexity, Hailuo,
  Volcengine, AzureAI, OpenCode, FastGPT,
  // ByteDanceSeed 是后端写错的 lobehub 名，实际不存在，映射到 Doubao 兜底
  ByteDanceSeed: Doubao,
} as unknown as Record<string, LobehubIconComp>

/**
 * 按 lobehub 组件名解析图标（对应后端 logo_url，如 "OpenRouter.Color"）。
 * 格式：「图标名」或「图标名.变体」（变体如 Color / Mono / Text / Avatar）。
 * 命中精选表则渲染对应尺寸图标，否则返回 null（交由调用方走 vendor / 文字兜底）。
 * 名字大小写不敏感，变体名保持大小写敏感（lobehub 的变体就是 Color/Mono/Text/Avatar）。
 */
export function resolveLobehubIcon(
  logoRef: string | null | undefined,
  size = 28
): React.ReactNode | null {
  const Comp = pickIconComponent(LOBEHUB_BY_NAME, logoRef) as LobehubIconComp | null
  if (!Comp) return null
  return <Comp size={size} />
}
