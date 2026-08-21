/**
 * 小米 MiMo 语音能力（合成 / 音色设计 / 音色克隆 / 识别）—— 直连上游，不经中台。
 *
 * 为什么直连：中台的出音链路还没接完（media_type=audio 的路由与落盘在做），而这批能力
 * 目前只给内部用、不开放给租户。CLI 直连能立刻用上，也天然不会漏给租户——租户手里
 * 没有这把 key。等中台接完再决定要不要把 CLI 切过去。
 *
 * ⚠️ 协议层的真源是 museav-manager 的 `shared/mimo-audio.js`（那边有 11 个单测钉着）。
 * 这里是 TS 副本，**改协议要同步两边**。复制而不是共享的原因：CLI 是独立发布的 npm 包，
 * 跨仓 import 会把中台仓变成它的构建依赖。
 *
 * ## 四个反直觉的点（实测踩出来的，写错不会报错，只是拿不到音频）
 *
 * 1. 合成**不走 /v1/audio/speech**。OpenAI 那套音频端点这边一个都没有（试了七个全 404），
 *    四种能力共用 `/v1/chat/completions`，靠 model 区分。
 * 2. **待合成文本放 assistant 角色**，user 放音色指令。反过来写会得到一段「回答」而不是朗读。
 * 3. 音频是 **base64** 回在 `message.audio.data`，不是二进制流。
 * 4. 识别的输入音频在 user 的 content **数组**里（`type: 'input_audio'`），且要裸 base64。
 *
 * key 走 MIMO_API_KEY 环境变量（跟 OLLAMA_HOST / MUSEAV_LOCAL_VLM 一个路子），不进
 * ~/.museav.json —— 那个文件存的是中台身份，跟这个上游是两回事。
 */
import { readFile } from 'node:fs/promises'

/** 专属 Base URL。换端点用 MIMO_BASE_URL，不用改代码 */
const BASE = (process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1').replace(/\/+$/, '')

const MODELS = {
  tts: 'mimo-v2.5-tts',
  design: 'mimo-v2.5-tts-voicedesign',
  clone: 'mimo-v2.5-tts-voiceclone',
  asr: 'mimo-v2.5-asr',
} as const

/** 默认预置音色。上游没有「列出音色」的接口，这个是文档给出且实测可用的 */
export const DEFAULT_VOICE = 'Chloe'

export function mimoKey(): string {
  const key = process.env.MIMO_API_KEY || ''
  if (!key) {
    throw new Error(
      '缺少 MIMO_API_KEY。语音能力直连小米 MiMo，不走中台身份：\n'
      + '  export MIMO_API_KEY=...        或\n'
      + '  cs kyvault run --env MIMO_API_KEY=secret://mimo/api-key -- museav speak ...',
    )
  }
  return key
}

async function call(body: unknown): Promise<any> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mimoKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`上游 HTTP ${res.status}：${text.slice(0, 200)}`)
  let data: any
  try { data = JSON.parse(text) } catch { throw new Error(`上游返回不是 JSON：${text.slice(0, 200)}`) }
  if (data?.error) throw new Error(data.error.message || String(data.error))
  if (!Array.isArray(data?.choices) || !data.choices.length) throw new Error('上游返回里没有 choices')
  return data
}

export interface SpeakOptions {
  /** 预置音色名（默认 Chloe）。与 design / clonePath 互斥 */
  voice?: string
  /** 一句话描述音色 → 走音色设计 */
  design?: string
  /** 音色样本音频路径 → 走音色克隆 */
  clonePath?: string
  /** 风格/语气指令。三种模式都能用 */
  instruction?: string
}

/** 合成的三种模式。asr 不在里面——它是识别，不由 speechMode 决定 */
export type SpeechMode = 'tts' | 'design' | 'clone'

/** 用哪种模式，取决于给了什么参数——克隆 > 设计 > 预置音色 */
export function speechMode(opts: SpeakOptions): SpeechMode {
  if (opts.clonePath) return 'clone'
  if (opts.design) return 'design'
  return 'tts'
}

/**
 * 合成语音，返回 WAV 数据。
 * @param text 要读出来的文本
 */
export async function synthesize(text: string, opts: SpeakOptions = {}): Promise<Buffer> {
  const content = String(text || '').trim()
  if (!content) throw new Error('要合成的文本是空的')

  const mode = speechMode(opts)
  const messages: Array<{ role: string; content: string }> = []
  // user 放指令：设计模式靠它定义音色，其余模式靠它调语气
  const instruction = mode === 'design' ? opts.design : opts.instruction
  if (instruction) messages.push({ role: 'user', content: instruction })
  // 待合成文本必须是 assistant，见文件头第 2 条
  messages.push({ role: 'assistant', content })

  const audio: Record<string, string> = { format: 'wav' }
  if (mode === 'clone') {
    const buf = await readFile(opts.clonePath as string)
    audio.voice = `data:audio/wav;base64,${buf.toString('base64')}`
  } else if (mode === 'tts') {
    audio.voice = opts.voice || DEFAULT_VOICE
  }

  const data = await call({ model: MODELS[mode], messages, audio })
  const b64 = data.choices[0]?.message?.audio?.data
  if (!b64) throw new Error('上游没有返回音频（audio.data 为空）')
  return Buffer.from(b64, 'base64')
}

/**
 * 识别音频里的文字。
 *
 * ⚠️ 质量有波动：同一段合成音频两次实测，一次「声影成诗，一念成相」（同音字级别），
 * 一次「上庸城失，一面呈象」（整句都错）。别把结果直接当可信文本用在计费或入库口径上。
 */
export async function transcribe(audioPath: string): Promise<string> {
  const buf = await readFile(audioPath)
  const format = /\.(wav|mp3|m4a|flac|ogg|pcm)$/i.exec(audioPath)?.[1]?.toLowerCase() || 'wav'
  const data = await call({
    model: MODELS.asr,
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: buf.toString('base64'), format } }] }],
  })
  const text = data.choices[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('上游没有返回识别文本')
  return text.trim()
}

/** WAV 时长（秒），用于给用户一个「出了多长」的反馈。头部损坏时返回 null 而不是抛错 */
export function wavSeconds(buf: Buffer): number | null {
  if (buf.length < 44 || buf.subarray(0, 4).toString() !== 'RIFF') return null
  const byteRate = buf.readUInt32LE(28)
  return byteRate > 0 ? (buf.length - 44) / byteRate : null
}
