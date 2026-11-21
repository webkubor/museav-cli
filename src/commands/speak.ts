/**
 * museav speak —— 文字转语音，把音频落到本地文件
 *
 * 为什么要单独一条命令：配音是视频链路（muse·tv）里独立的一步——
 * 文本先写好，念白后合成，最后跟画面拼成片子。把它做成一条能单独跑的命令，
 * 意味着"这段话听着对不对"可以脱离整条片子先验收，而不是等片子渲完才发现念错字。
 *
 * 通道只有一条：**直连 MiniMax 官方 TTS**。
 *
 * 为什么不是走中台：截至 2026-11-20 中台**没有**语音合成端点——中台的语音协议层
 * 随 MiMo Token Plan 退订时删掉了，现网请求一律 405（路由不存在）。所以这条命令
 * **不需要中台身份**，也**不扣中台 credits**，费用直接记在用户自己的 MiniMax 账户上。
 * 中台若重新接入语音，以届时给出的正式契约为准。
 *
 * stdout 契约：**只有落盘音频的绝对路径**（其余信息一律走 stderr），
 * 方便 shell 直接接：`OUT=$(museav speak "你好" --voice male-qn-qingse)`。
 */
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { loadConfigOptional } from '../config.js'
import { hasFfmpeg, assertAudioBytes, isWavBuffer, mp3ToWav, resolveSpeakText, speakViaMinimax, validateSpeed } from '../speech.js'

export interface SpeakOptions {
  text?: string
  file?: string
  voice?: string
  language?: string
  format?: string
  speed?: number | string
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

export async function speak(positional: string | undefined, opts: SpeakOptions): Promise<void> {
  const text = await resolveSpeakText({ positional, text: opts.text, file: opts.file })

  const provider = opts.provider || 'minimax'
  if (provider === 'studio') {
    throw new Error(
      '中台没有语音合成端点：中台的语音通道已随 MiMo Token Plan 退订下线，现网未开放（路由不存在）。\n' +
      '目前只有直连上游这一条通道：museav speak "文本" --voice <音色ID>（默认就是 --provider minimax）\n' +
      '（自带 MiniMax API Key，不扣中台 credits；中台若重新接入语音，会先给出正式契约）',
    )
  }
  if (provider !== 'minimax') {
    throw new Error(`未知的通道 "${provider}"。目前只有 minimax（直连上游）一条通道`)
  }

  const format = (opts.format || 'mp3').toLowerCase()
  if (format !== 'mp3' && format !== 'wav') {
    throw new Error(`--format 只支持 mp3 / wav，收到 "${opts.format}"`)
  }

  // 语速要在调用上游（可能计费）之前就拦下来：非法值不发给上游
  const speed = validateSpeed(opts.speed)

  // 直连上游用不到中台身份，所以凭证在需要时才要
  const cfg = loadConfigOptional()

  // 要 wav 就得有 ffmpeg —— 这事得在调用上游（可能计费）之前问清楚
  if (format === 'wav' && !hasFfmpeg()) {
    throw new Error(
      '要 wav 需要本机装 ffmpeg（本机没找到）：上游不一定回 wav，回了 mp3 就得本机转一道。\n' +
      '先合成 mp3 再自行转码，或改用 --format mp3。',
    )
  }

  const requested = {
    text,
    voice: opts.voice,
    language: opts.language,
    format: format as 'mp3' | 'wav',
    speed,
    model: opts.model,
  }

  process.stderr.write(
    `合成中（直连上游${opts.voice ? ` · 音色 ${opts.voice}` : ''} · ${text.length} 字）...\n`,
  )

  let data: Buffer
  let mime: string
  let voiceUsed: string | undefined

  const r = await speakViaMinimax(requested, cfg.minimaxApiKey || '')
  data = r.data
  mime = r.mime
  voiceUsed = r.voice

  // 落盘之前先看一眼这段字节：不是音频就别写（写了就是 0 字节或一段垃圾，还报"成功"）
  assertAudioBytes(data)

  const outPath = resolveOutputPath(opts.out, format)
  if (existsSync(outPath) && !opts.overwrite) {
    throw new Error(`输出文件已存在：${outPath}（要覆盖加 --overwrite，或换一个 --out）`)
  }
  await mkdir(dirname(outPath), { recursive: true })

  if (format === 'wav' && !isWavBuffer(data)) {
    // 回来的不是 wav（上游默认给 mp3），由本机 ffmpeg 转成 24k 单声道，
    // 跟视频链路后面的处理对齐
    await mp3ToWav(data, outPath)
  } else {
    await writeFile(outPath, data)
  }
  if (format === 'wav') mime = 'audio/wav'

  const size = existsSync(outPath) ? (await import('node:fs')).statSync(outPath).size : data.length
  process.stderr.write(`✅ 已落盘：${outPath}（${(size / 1024).toFixed(1)} KB · ${mime}${voiceUsed ? ` · 音色 ${voiceUsed}` : ''}）\n`)
  process.stderr.write('   注意：直连上游，不扣中台 credits，费用走 MiniMax 账单\n')

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
