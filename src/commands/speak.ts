/**
 * museav speak —— 文字转语音，把音频落到本地文件
 *
 * 为什么要单独一条命令：配音是视频链路（muse·tv / reel-kit）里独立的一步——
 * 文本先写好，念白后合成，最后跟画面拼成片子。把它做成一条能单独跑的命令，
 * 意味着"这段话听着对不对"可以脱离整条片子先验收，而不是等片子渲完才发现念错字。
 *
 * 两条通道：
 *   studio（默认）—— 走中台 POST /api/speak。中台是唯一的 API 入口与计费口径。
 *   minimax       —— 直连 MiniMax 官方 TTS，**绕过中台**：不扣中台 credits，
 *                    按上游账单走。直连拿到的音频是 mp3；要 wav 会用本机 ffmpeg 转一道。
 *
 * stdout 契约：**只有落盘音频的绝对路径**（其余信息一律走 stderr），
 * 方便 shell 直接接：`OUT=$(museav speak "你好" --voice male-qn-qingse)`。
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { StudioClient } from '../client.js'
import { loadConfigOptional } from '../config.js'
import { mp3ToWav, resolveSpeakText, speakViaMinimax } from '../speech.js'

export interface SpeakOptions {
  text?: string
  file?: string
  voice?: string
  language?: string
  format?: string
  speed?: number
  out?: string
  provider?: string
  model?: string
  overwrite?: boolean
}

function timestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export async function speak(client: StudioClient | null, positional: string | undefined, opts: SpeakOptions): Promise<void> {
  const text = await resolveSpeakText({ positional, text: opts.text, file: opts.file })

  const provider = opts.provider || 'studio'
  if (provider !== 'studio' && provider !== 'minimax') {
    throw new Error(`未知的通道 "${provider}"。可用：studio（走中台，默认）、minimax（直连上游，绕过中台计费）`)
  }

  const format = (opts.format || 'mp3').toLowerCase()
  if (format !== 'mp3' && format !== 'wav') {
    throw new Error(`--format 只支持 mp3 / wav，收到 "${opts.format}"`)
  }

  // 直连上游时中台身份用不上，所以凭证在需要时才要
  const cfg = provider === 'minimax' ? loadConfigOptional() : null

  const requested = {
    text,
    voice: opts.voice,
    language: opts.language,
    format: format as 'mp3' | 'wav',
    speed: opts.speed,
    model: opts.model,
  }

  process.stderr.write(
    `合成中（通道 ${provider}${opts.voice ? ` · 音色 ${opts.voice}` : ''} · ${text.length} 字）...\n`,
  )

  let data: Buffer
  let mime: string
  let url: string | undefined
  let voiceUsed: string | undefined

  if (provider === 'studio') {
    if (!client) throw new Error('走中台的 speak 需要中台身份：museav login 或 museav config --apiKey')
    const r = await client.speak(requested)
    data = r.data
    mime = r.mime
    url = r.url
    voiceUsed = r.voice
    if (r.cost?.credits != null) {
      process.stderr.write(`   中台计费：${r.cost.credits} ${r.cost.unit || 'credits'}\n`)
    }
  } else {
    const r = await speakViaMinimax(requested, cfg?.minimaxApiKey || '')
    data = r.data
    mime = r.mime
    voiceUsed = r.voice
  }

  const outPath = resolveOutputPath(opts.out, format)
  if (existsSync(outPath) && !opts.overwrite) {
    throw new Error(`输出文件已存在：${outPath}（要覆盖加 --overwrite，或换一个 --out）`)
  }
  await mkdir(dirname(outPath), { recursive: true })

  if (provider === 'minimax' && format === 'wav') {
    // 直连只有 mp3，wav 由本机 ffmpeg 转（24k 单声道，跟视频链路后面的处理对齐）
    await mp3ToWav(data, outPath)
  } else {
    await writeFile(outPath, data)
  }

  const size = existsSync(outPath) ? (await import('node:fs')).statSync(outPath).size : data.length
  process.stderr.write(`✅ 已落盘：${outPath}（${(size / 1024).toFixed(1)} KB · ${mime}${voiceUsed ? ` · 音色 ${voiceUsed}` : ''}）\n`)
  if (provider === 'minimax') {
    process.stderr.write('   注意：直连上游不扣中台 credits，费用走 MiniMax 账单\n')
  }
  if (url) process.stderr.write(`   中台直链：${url}\n`)

  // stdout 只出路径：调用方要的是"音频在哪"，不是一段说明
  console.log(outPath)
}

/** 输出路径：不给 --out 就落到当前目录的 speech-<时间戳>.<格式> */
function resolveOutputPath(out: string | undefined, format: string): string {
  if (out) {
    const abs = isAbsolute(out) ? out : resolve(process.cwd(), out)
    return abs
  }
  return join(process.cwd(), `speech-${timestamp()}.${format}`)
}
