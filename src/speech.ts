/**
 * 语音合成的底层实现 —— `museav speak` 只走一条通道：直连 MiniMax 官方 TTS。
 *
 * 为什么不走中台：截至 2026-11-20，中台**没有**语音合成端点，中台的语音协议层
 * 随 MiMo Token Plan 退订时就删掉了，现网请求 /api/speak 等路径一律 405（路由不存在）。
 * 中台是否重新接入语音要 owner 拍板，所以这里不写任何"中台契约"——
 * 猜出来的路径和字段会被后人当成正式契约读，那比没有更糟。
 *
 * 直连意味着：这条命令**不需要中台身份**，也**不扣中台 credits**，费用直接记在
 * 用户自己的 MiniMax 账户上。
 *
 * 字段不是照着文档猜的：与 muse·tv 里那条实测能出声的调用逐字对齐，
 * 并且 2026-11-20 由中台侧实测复核（200 + base_resp.status_code=0，音频在 data.audio，
 * 是 hex 字符串不是 base64 也不是直链）。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'

/** 直连上游用的音频格式：MiniMax 只出 mp3 */
const MINIMAX_FORMAT = 'mp3'
/** MiniMax 的默认模型档位（与 muse·tv 一致） */
const MINIMAX_DEFAULT_MODEL = 'speech-02-hd'
/** 上游认的语速范围（超出就拒） */
const SPEED_MIN = 0.5
const SPEED_MAX = 2.0
/** 找不到 PATH 里的 ffmpeg 时，再看这几个常见安装位置 */
const FFMPEG_FALLBACK_PATHS = ['/usr/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']

/** 语音合成结果：音频字节 + 用到的音色 */
export interface SpeakResult {
  /** 音频内容（已解码，不是 base64/hex 文本） */
  data: Buffer
  /** 音频 MIME */
  mime: string
  /** 实际用的音色 */
  voice?: string
}

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
  // language_boost 是上游的顶层字段（不是 voice_setting 里的），只在上游文档列过的值里选；
  // 不给 --language 就不发这个字段——上游自己会按文本判断语言
  const languageBoost = languageBoostOf(input.language)
  const resp = await fetch(`${baseUrl}/v1/t2a_v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model || MINIMAX_DEFAULT_MODEL,
      text: input.text,
      stream: false,
      ...(languageBoost ? { language_boost: languageBoost } : {}),
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
    data: decodeAudioHex(hex),
    mime: 'audio/mpeg',
    voice: input.voice,
  }
}

/**
 * 把上游回的 hex 音频解成字节。
 *
 * 以前这一步是 `Buffer.from(hex, 'hex')` 裸解：非法 hex 会被 Node 静默截断，
 * 空响应会解出 0 字节，两种情况都会落一个 0 字节的 .mp3 并报"成功"。
 * 所以这里自己先校验：不是合法 hex、长度是奇数、或者解出来是空的，都直接报错。
 */
export function decodeAudioHex(hex: string): Buffer {
  const trimmed = String(hex).trim()
  if (!trimmed) {
    throw new Error('上游返回的音频是空的（0 字节），已中止，没有写文件')
  }
  if (!/^[0-9a-fA-F]+$/.test(trimmed) || trimmed.length % 2 !== 0) {
    throw new Error(
      `上游返回的音频不是合法的 hex 编码（${trimmed.length} 个字符，含非十六进制字符或长度为奇数），已中止，没有写文件`,
    )
  }
  const buf = Buffer.from(trimmed, 'hex')
  if (buf.length === 0) {
    throw new Error('上游返回的音频是空的（0 字节），已中止，没有写文件')
  }
  return buf
}

/**
 * 校验语速。
 *
 * 以前 --speed 是 `Number(v)`，给了 'abc' 就变 NaN，再原样发给上游，
 * 上游要么报错、要么当成默认值处理——两种都不明不白。这里自己拦：
 * 必须是数字，且在 0.5–2.0 之间。
 *
 * 原始字符串也接受：报错时要把用户实际写的东西回给他（"abc"），不是回 "NaN"。
 */
export function validateSpeed(speed: number | string | undefined): number | undefined {
  if (speed === undefined) return undefined
  const raw = typeof speed === 'string' ? speed.trim() : speed
  if (raw === '') {
    throw new Error(`--speed 要是一个数字（${SPEED_MIN}–${SPEED_MAX}），收到空值`)
  }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    throw new Error(`--speed 要是一个数字（${SPEED_MIN}–${SPEED_MAX}），收到 "${String(raw)}"`)
  }
  if (n < SPEED_MIN || n > SPEED_MAX) {
    throw new Error(`--speed 超出范围：要 ${SPEED_MIN}–${SPEED_MAX} 之间，收到 ${n}`)
  }
  return n
}

/**
 * 猜这段字节是什么音频格式（只认文件头，不解码）：'mp3' / 'wav' / null。
 *
 * mp3：'ID3' 标签开头，或者帧同步字节 0xFF Ex（高位三 bit 为 1）。
 * wav：'RIFF' 开头且第 9-12 字节是 'WAVE'。
 */
export function sniffAudioFormat(data: Buffer): 'mp3' | 'wav' | null {
  if (data.length >= 3 && data.subarray(0, 3).toString('ascii') === 'ID3') return 'mp3'
  if (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) return 'mp3'
  if (isWavBuffer(data)) return 'wav'
  return null
}

/**
 * 这段字节是不是音频（mp3 或 wav）。不是就别落盘——
 * 上游偶尔会回一段 JSON 错误页或者被截断的内容，落成一个"能打开"的假音频更难查。
 */
export function assertAudioBytes(data: Buffer): void {
  if (sniffAudioFormat(data)) return
  const head = data.subarray(0, 8).toString('hex')
  throw new Error(
    `上游返回的内容不是音频（开头 ${head} 既不是 mp3 的 ID3/帧同步，也不是 wav 的 RIFF/WAVE），已中止，没有写文件`,
  )
}

/**
 * --language 的取值映射到上游 language_boost。
 * 上游只认这几个值，写别的上游会拒；没给就返回 undefined（不发这个字段）。
 */
function languageBoostOf(language: string | undefined): 'Chinese' | 'English' | undefined {
  if (!language) return undefined
  const v = language.trim().toLowerCase()
  if (v === 'zh' || v === 'zh-cn' || v === 'chinese' || v === '中文') return 'Chinese'
  if (v === 'en' || v === 'en-us' || v === 'english' || v === '英文') return 'English'
  throw new Error(`--language 只支持 zh / en（上游只认 Chinese / English），收到 "${language}"`)
}

/** 本机有没有 ffmpeg（有才能把 mp3 转成 wav） */
export function hasFfmpeg(): boolean {
  return findFfmpeg() !== null
}

/**
 * 找出本机的 ffmpeg，找不到返回 null。
 *
 * 以前只认三条硬编码的 unix 路径（/usr/bin、/opt/homebrew/bin、/usr/local/bin），
 * 装在 Windows、MacPorts 或别的位置的 ffmpeg 一律被当成"没装"。
 * 现在先按 PATH 找（跨平台，spawnSync 自己走系统的 PATH 解析），
 * 找不到再退回那三条常见安装位置。
 *
 * 结果按 PATH 缓存：同一批进程里反复调用不至于每次都起一次子进程，
 * 而测试改 PATH 后仍然能拿到新的结果。
 */
export function findFfmpeg(): string | null {
  const pathKey = process.env.PATH ?? ''
  const cached = ffmpegCache.get(pathKey)
  if (cached !== undefined) return cached
  const found = detectFfmpeg()
  ffmpegCache.set(pathKey, found)
  return found
}

const ffmpegCache = new Map<string, string | null>()

function detectFfmpeg(): string | null {
  // PATH 优先：命令行里敲 ffmpeg 能跑通，这台机器就有
  try {
    const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 10000 })
    if (!r.error && r.status === 0) return 'ffmpeg'
  } catch { /* 找不到就算了，往下走兜底路径 */ }
  for (const p of FFMPEG_FALLBACK_PATHS) {
    if (existsSync(p)) return p
  }
  return null
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
  const bin = findFfmpeg()
  if (!bin) {
    throw new Error(
      '要 wav 需要本机装 ffmpeg（本机没找到）。\n' +
      '先合成 mp3 再自行转码，或改用 --format mp3。',
    )
  }
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
