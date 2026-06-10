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

/**
 * 厂商图标工厂：vendor 名（小写）→ 按尺寸渲染图标。
 * 新增厂商：import 对应 lobehub 图标后，在此追加一行即可。
 */
const ICON_FACTORY: Record<string, (size: number) => React.ReactNode> = {
  anthropic: (s) => <Anthropic size={s} />,
  claude:    (s) => <Claude.Color size={s} />,
  openai:    (s) => <OpenAI size={s} />,
  chatgpt:   (s) => <OpenAI size={s} />,
  gemini:    (s) => <Gemini.Color size={s} />,
  google:    (s) => <Google.Color size={s} />,
  deepseek:  (s) => <DeepSeek.Color size={s} />,
  qwen:      (s) => <Qwen.Color size={s} />,
  mistral:   (s) => <Mistral.Color size={s} />,
  ollama:    (s) => <Ollama size={s} />,
  meta:      (s) => <Meta.Color size={s} />,
  llama:     (s) => <Meta.Color size={s} />,
  moonshot:  (s) => <Moonshot size={s} />,
  kimi:      (s) => <Moonshot size={s} />,
  minimax:   (s) => <Minimax.Color size={s} />,
  chatglm:   (s) => <ChatGLM.Color size={s} />,
  zhipu:     (s) => <Zhipu.Color size={s} />,
  cohere:    (s) => <Cohere.Color size={s} />,
  groq:      (s) => <Groq size={s} />,
  baidu:     (s) => <Baidu.Color size={s} />,
  ernie:     (s) => <Baidu.Color size={s} />,
  seedream:  (s) => <Doubao.Color size={s} />,
  skylark:   (s) => <Doubao.Color size={s} />,
  bytedance: (s) => <Doubao.Color size={s} />,
  ark:       (s) => <Doubao.Color size={s} />,
}

/**
 * 按厂商名解析本地图标：先精确命中，再做包含匹配（如 "OpenAI GPT-4" 命中 openai）。
 * 命中返回对应尺寸的图标节点，否则返回 null（交由调用方走文字兜底）。
 */
export function resolveVendorIcon(
  vendor: string | null | undefined,
  size = 28
): React.ReactNode | null {
  if (!vendor) return null
  const v = vendor.toLowerCase()
  if (ICON_FACTORY[v]) return ICON_FACTORY[v](size)
  const key = Object.keys(ICON_FACTORY).find((k) => v.includes(k))
  return key ? ICON_FACTORY[key](size) : null
}

type LobehubIconComp = React.ComponentType<{ size?: number }> & Record<string, React.ComponentType<{ size?: number }>>

/**
 * 精选 LLM 图标注册表：lobehub 组件名 → 组件。
 * 新增厂商：import 后在此追加一行即可（只打包用到的，体积可控）。
 */
const LOBEHUB_BY_NAME: Record<string, LobehubIconComp> = {
  OpenAI, OpenRouter, Anthropic, Claude, Gemini, Google, DeepSeek, Qwen, Mistral, Ollama,
  Meta, Moonshot, Kimi, Minimax, ChatGLM, Zhipu, Cohere, Groq, Baidu, Wenxin, Grok, XAI,
  Doubao, Hunyuan, Spark, Yi, Stepfun, Baichuan, InternLM, Together, Fireworks, Perplexity, Hailuo,
  // ByteDanceSeed 是后端写错的 lobehub 名，实际不存在，映射到 Doubao 兜底
  ByteDanceSeed: Doubao,
} as unknown as Record<string, LobehubIconComp>

/**
 * 按 lobehub 组件名解析图标（对应后端 logo_url，如 "OpenRouter.Color"）。
 * 格式：「图标名」或「图标名.变体」（变体如 Color / Mono / Text / Avatar）。
 * 命中精选表则渲染对应尺寸图标，否则返回 null（交由调用方走 vendor / 文字兜底）。
 */
export function resolveLobehubIcon(
  logoRef: string | null | undefined,
  size = 28
): React.ReactNode | null {
  if (!logoRef) return null
  const [name, variant] = logoRef.split('.')
  const Mod = LOBEHUB_BY_NAME[name]
  if (!Mod) return null
  const Comp = variant && Mod[variant] ? Mod[variant] : Mod
  if (typeof Comp !== 'function') return null
  return <Comp size={size} />
}
