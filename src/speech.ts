/**
 * 语音合成的两条通道 —— `museav speak` 的底层实现。
 *
 * 1) studio（默认）：走中台 POST /api/speak。中台是唯一的 API 入口与计费口径，
 *    个人 login / 租户 apiKey 都用这一条。
 * 2) minimax：直连 MiniMax 官方 TTS（api.minimaxi.com/v1/t2a_v2）。
 *    这是**绕过中台**的一条：它不认中台身份、不扣中台 credits、按上游账单走。
 *    中台的语音端点还没开放时（speak/transcribe 曾随 MiMo Token Plan 退订下线），
 *    只有这条路能立刻出声——所以它必须显式选（--provider minimax），不能默认走它。
 *
 * 通道契约不臆造：studio 的字段以中台实现为准；minimax 的字段与 reel-kit
 * （muse·tv）里那条实测能出声的调用逐字对齐，不是照着文档猜的。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import type { SpeakResult } from './client.js'

/** 直连上游用的音频格式：MiniMax 只出 mp3 */
const MINIMAX_FORMAT = 'mp3'
/** MiniMax 的默认模型档位（与 reel-kit 一致） */
const MINIMAX_DEFAULT_MODEL = 'speech-02-hd'

export interface SpeakInput {
  text: string
  voice?: string
  language?: string
  format?: 'mp3' | 'wav'
  speed?: number
  model?: string
}

/**
 * 解析要合成的文本：位置参数 / --text / --file（'-' 读 stdin）三选一。
 * 三种来源不能同时给——同时给说明调用方自己也没想清楚要哪段话，宁可报错。
 */
export async function resolveSpeakText(input: {
  positional?: string
  text?: string
  file?: string
}): Promise<string> {
  const given = [input.positional, input.text, input.file].filter(v => v !== undefined && v !== '')
  if (given.length > 1) {
    throw new Error('文本只能给一处：位置参数 / --text / --file 三选一')
  }
  if (!given.length) {
    throw new Error(
      '没有要合成的文本。任选一种：\n' +
      '  museav speak "要念的句子"\n' +
      '  museav speak --text "要念的句子"\n' +
      '  museav speak --file script.txt',
    )
  }
  if (input.file) {
    const raw = input.file === '-'
      ? await new Promise<string>((resolve, reject) => {
        let buf = ''
        process.stdin.setEncoding('utf-8')
        process.stdin.on('data', (c: string) => { buf += c })
        process.stdin.on('end', () => resolve(buf))
        process.stdin.on('error', reject)
      })
      : await readFile(input.file, 'utf-8')
    if (!raw.trim()) throw new Error(`文本是空的：${input.file}`)
    return raw.trim()
  }
  const text = String(given[0]).trim()
  if (!text) throw new Error('文本是空的，没有可合成的内容')
  return text
}

/**
 * 直连 MiniMax TTS。
 * key 来源：MINIMAX_API_KEY 环境变量（CI / agent 注入）优先，其次 museav config 里的
 * minimaxApiKey（写进 ~/.museav.json，权限 0600）。
 */
export async function speakViaMinimax(input: SpeakInput, apiKey: string): Promise<SpeakResult> {
  if (!apiKey) {
    throw new Error(
      '未配置 MiniMax API Key。任选一种：\n' +
      '  export MINIMAX_API_KEY=...\n' +
      '  museav config --minimaxApiKey ...',
    )
  }
  if (!input.voice) {
    throw new Error('MiniMax 直连必须指定 --voice <音色 ID>（例如 male-qn-qingse）')
  }
  const baseUrl = process.env.MINIMAX_TTS_BASE_URL || 'https://api.minimaxi.com'
  const resp = await fetch(`${baseUrl}/v1/t2a_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model || MINIMAX_DEFAULT_MODEL,
      text: input.text,
      stream: false,
      voice_setting: { voice_id: input.voice, speed: input.speed ?? 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: MINIMAX_FORMAT, channel: 1 },
    }),
    signal: AbortSignal.timeout(120000),
  })
  const result: any = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const detail = result.base_resp?.status_msg ? `：${result.base_resp.status_msg}` : ''
    throw new Error(`MiniMax HTTP ${resp.status}${detail}`)
  }
  // 成功回执里也带 base_resp，status_code 为 0 才算成功——有 base_resp 不等于失败
  if (result.base_resp?.status_code) {
    throw new Error(
      `MiniMax 拒绝请求（${result.base_resp.status_code}）：${result.base_resp.status_msg || '请核对权限或额度'}`,
    )
  }
  const hex: string | undefined = result.data?.audio
  if (!hex) throw new Error('MiniMax 未返回音频数据')
  return {
    data: Buffer.from(hex, 'hex'),
    mime: 'audio/mpeg',
    voice: input.voice,
  }
}

/** 本机有没有 ffmpeg（有才能把 mp3 转成 wav） */
export function hasFfmpeg(): boolean {
  return existsSync('/usr/bin/ffmpeg') || existsSync('/opt/homebrew/bin/ffmpeg') || existsSync('/usr/local/bin/ffmpeg')
}

/**
 * 这段字节是不是已经是 wav（RIFF/WAVE 头）。
 *
 * 要 wav 却拿到 mp3 是很现实的事：中台的音频格式由服务端说了算，调用方说了
 * format=wav 也不保证回的是 wav。所以先看字节本身，别只看"我请求了什么"。
 */
export function isWavBuffer(data: Buffer): boolean {
  return data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WAVE'
}

/**
 * mp3 → wav（24kHz 单声道 16bit）。
 * muse·tv 的配音链路后面统一按 wav 处理（拼接、混音），所以直连上游拿到 mp3 后要转一道。
 * 没有 ffmpeg 就明确报错，不给出一个「看起来成功」的假 wav。
 */
export async function mp3ToWav(mp3: Buffer, outPath: string): Promise<void> {
  if (!hasFfmpeg()) {
    throw new Error(
      '要 wav 需要本机装 ffmpeg（本机没找到）。\n' +
      '先合成 mp3 再自行转码，或改用 --format mp3。',
    )
  }
  const bin = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg'
    : existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg'
      : '/usr/bin/ffmpeg'
  const tmp = `${outPath}.tmp.mp3`
  await writeFile(tmp, mp3)
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, ['-y', '-loglevel', 'error', '-i', tmp, '-ar', '24000', '-ac', '1', outPath])
      child.on('error', reject)
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg 转换失败（退出码 ${code}）`))))
    })
  } finally {
    // 中间文件用完就删：留个 .tmp.mp3 在输出目录里，下一次同名的合成会以为文件已存在
    await rm(tmp, { force: true })
  }
}
