/**
 * museav speak —— 文本转语音，stdout 输出生成的文件路径。
 * museav transcribe —— 语音转文本，stdout 输出识别结果。
 *
 * 三种音色来源，给了什么参数就走哪条：
 *   默认         预置音色（--voice Chloe）
 *   --design     一句话描述音色，当场造一个
 *   --clone      拿一段音频当样本，克隆它的音色
 *
 * 直连小米 MiMo，不经中台，需要 MIMO_API_KEY —— 原因见 src/mimo-speech.ts 的文件头。
 */
import { writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { synthesize, transcribe, speechMode, wavSeconds, DEFAULT_VOICE } from '../mimo-speech.js'

const MODE_LABEL = { tts: '预置音色', design: '音色设计', clone: '音色克隆' } as const

export interface SpeakCliOptions {
  out?: string
  voice?: string
  design?: string
  clone?: string
  instruction?: string
}

export async function speak(text: string, opts: SpeakCliOptions = {}): Promise<void> {
  const mode = speechMode({ clonePath: opts.clone, design: opts.design })
  // 克隆模式下 opts.clone 是整条路径，进度行里只留文件名——绝对路径会把这行顶到换行
  const detail = mode === 'tts' ? (opts.voice || DEFAULT_VOICE)
    : mode === 'clone' ? basename(opts.clone || '') : (opts.design || '')
  process.stderr.write(`合成中（${MODE_LABEL[mode]}${detail ? ` · ${detail}` : ''}）...\n`)

  const buf = await synthesize(text, {
    voice: opts.voice,
    design: opts.design,
    clonePath: opts.clone,
    instruction: opts.instruction,
  })

  // 默认落在当前目录，文件名带时间戳避免连续合成互相覆盖
  const out = resolve(opts.out || `speech-${Date.now()}.wav`)
  await writeFile(out, buf)
  const secs = wavSeconds(buf)
  process.stderr.write(`✅ ${(buf.length / 1024).toFixed(0)}KB${secs ? ` · ${secs.toFixed(2)}s` : ''}\n`)
  console.log(out)
}

export async function transcribeCmd(audioPath: string): Promise<void> {
  process.stderr.write(`识别中 ${audioPath} ...\n`)
  const text = await transcribe(audioPath)
  // 质量有波动（见 mimo-speech.ts 的注释），提醒一句，但不影响 stdout 的机器可读性
  process.stderr.write('✅ 识别完成（同音字可能有误，重要场景请核对）\n')
  console.log(text)
}
