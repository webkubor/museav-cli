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
import * as LobehubRegistry from '@lobehub/icons'

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

type LobehubIconComp = React.ComponentType<{ size?: number }>

/**
 * 按 lobehub 组件名解析图标（对应后端 logo_url，如 "OpenRouter.Color"）。
 * 格式：「图标名」或「图标名.变体」（变体如 Color / Mono / Text / Avatar）。
 * 命中全量注册表则渲染对应尺寸图标，否则返回 null（交由调用方走 vendor / 文字兜底）。
 */
export function resolveLobehubIcon(
  logoRef: string | null | undefined,
  size = 28
): React.ReactNode | null {
  if (!logoRef) return null
  const [name, variant] = logoRef.split('.')
  const registry = LobehubRegistry as unknown as Record<
    string,
    (LobehubIconComp & Record<string, LobehubIconComp>) | undefined
  >
  const Mod = registry[name]
  if (!Mod) return null
  const Comp = variant && Mod[variant] ? Mod[variant] : Mod
  if (typeof Comp !== 'function') return null
  return <Comp size={size} />
}
