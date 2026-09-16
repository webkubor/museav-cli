/**
 * 本地视觉 —— reverse 的可选加速路，引擎委托给 mlx-vlm-kit 的 `vlm` 命令。
 *
 * 2026-09-16 换掉了原来自带的 Ollama 实现。原因不是 Ollama 不好用，是分工：
 * **CLI 只负责调中台 API + 把结果整成 SCULPT 结构，本地模型交给专门的工具。**
 * 自带一套 Ollama 调用等于在 CLI 里养第二个模型运行时 —— 同一台 Mac 上
 * Ollama(qwen3-vl:8b) 和 MLX(Qwen3-VL-4B) 各拉一份模型干同一件事。
 *
 * 本文件真正的资产是 sculptSystemPrompt() 与 normalizeSculpt()：
 * 提示词与返回结构从中台 _reverse-core.js / reverse-template.js 移植，
 * 保证本地路与 API 路产出同构。换引擎不动这两样。
 *
 * 装： pipx install git+https://github.com/webkubor/mlx-vlm-kit.git
 */
import { spawn } from 'node:child_process'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compressForVision } from './compress.js'
import type { ReverseResult } from './client.js'

/** 本地读图命令。换实现用 MUSEAV_VLM_BIN，不用改代码 */
export const LOCAL_VLM_BIN = process.env.MUSEAV_VLM_BIN || 'vlm'
/** 给用户看的引擎名（提示语里用） */
export const LOCAL_VLM_MODEL = 'mlx-vlm-kit (Qwen3-VL · MLX)'
/** SCULPT 要输出六个字段 + 中英两版 prompt，vlm 默认 400 token 不够 */
const MAX_TOKENS = 1400

const ALLOWED_RATIOS = ['3:4', '9:16', '1:1', '4:3', '16:9']

export interface LocalVlmStatus {
  running: boolean
  modelPresent: boolean
  host: string
  /** running=false 时的原因（给用户看的行动指引） */
  reason?: string
}

const INSTALL_HINT = `未找到 ${LOCAL_VLM_BIN} —— 装: pipx install git+https://github.com/webkubor/mlx-vlm-kit.git`

/** 跑一条命令，拿 stdout/stderr/退出码。不用 shell，参数原样传，不存在注入 */
function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${bin} 超时（${timeoutMs / 1000}s）`)) }, timeoutMs)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, err }) })
  })
}

/** 探活：vlm 在不在。不触发模型下载 —— --version 不加载模型，秒回 */
export async function checkLocalVlm(): Promise<LocalVlmStatus> {
  const host = LOCAL_VLM_BIN
  try {
    const { code, out } = await run(LOCAL_VLM_BIN, ['--version'], 10_000)
    if (code !== 0) return { running: false, modelPresent: false, host, reason: INSTALL_HINT }
    // 模型是否已下载这里探不出来（vlm 首次调用时自动拉 ~2.9GB），
    // 所以 modelPresent 恒 true，真下载发生在 reverseLocally 里，进度打在 stderr。
    return { running: true, modelPresent: true, host: out.trim() || host }
  } catch {
    return { running: false, modelPresent: false, host, reason: INSTALL_HINT }
  }
}

/** SCULPT 系统提示词 —— 从中台 reverse-template.js 移植。本地路只做纯读图，
 *  中台提示词里的 genre / body_md（给 image-to-template 用的）在 ReverseResult 里
 *  根本不消费，本地砍掉这两项省几百个输出 token——输出长度直接决定本地推理耗时 */
function sculptSystemPrompt(): string {
  return (
    `你是一位专业的 AI 图像逆向工程师。请分析这张图片，用 SCULPT 六要素框架逆推生成该图片所需的 prompt。` +
    `严格输出 JSON，不要输出任何其他文字：\n` +
    `{\n` +
    `  "sculpt": {\n` +
    `    "subject": "主体描述 — 画面中的人物/物体/场景，包括外貌、姿态、服饰",\n` +
    `    "composition": "构图描述 — 视角、布局、留白、视觉引导线",\n` +
    `    "universe": "世界观 — 时代背景、艺术风格、整体氛围",\n` +
    `    "light": "光影描述 — 光源方向、色温、明暗对比、光影效果",\n` +
    `    "print": "输出特性 — 比例、色调倾向、对比度、饱和度",\n` +
    `    "texture": "质感描述 — 材质、表面纹理、细节精度"\n` +
    `  },\n` +
    `  "prompt": "整合 SCULPT 六要素后的完整英文 prompt（适合 AI 图像生成模型）",\n` +
    `  "prompt_cn": "对应中文 prompt",\n` +
    `  "style_tags": ["2-4 个关键风格标签"],\n` +
    `  "aspect_ratio": "推荐比例，从 3:4|9:16|1:1|4:3|16:9 中按图片比例选一个",\n` +
    `  "zh_name": "4-8 字风格名（供技能命名）",\n` +
    `  "description": "一句话描述该风格"` +
    `\n}\n要求：prompt 必须是英文，详细且精确，覆盖全部六个维度；prompt_cn 为对应中文；只输出 JSON。`
  )
}

/** 本地逆向一张图。任何失败都抛 Error，由调用方决定回落 */
export async function reverseLocally(filePath: string): Promise<ReverseResult> {
  // 复用上传同款压缩：图小不仅传得快，本地 VLM 推理也快。
  // vlm 收的是文件路径，压过的图得先落临时文件。
  const { buffer, note } = await compressForVision(filePath)
  if (note) process.stderr.write(`  ${note}\n`)
  let target = filePath
  let temp: string | null = null
  if (buffer) {
    temp = join(tmpdir(), `museav-reverse-${process.pid}-${Date.now()}.jpg`)
    await writeFile(temp, buffer)
    target = temp
  } else {
    await readFile(filePath)   // 早失败：读不了就别等模型加载完才报错
  }

  try {
    const { code, out, err } = await run(LOCAL_VLM_BIN, buildVlmArgs(target, sculptSystemPrompt()), 5 * 60 * 1000)
    if (code !== 0) throw new Error(`${LOCAL_VLM_BIN} 退出码 ${code}: ${err.trim().slice(0, 200)}`)
    return normalizeSculpt(parseJsonLoose(parseVlmOutput(out)))
  } finally {
    if (temp) await unlink(temp).catch(() => {})
  }
}

/** vlm 的 argv。**全局参数必须排在子命令前面** —— vlm 的 argparse 把 --json /
 *  --max-tokens 定义在顶层 parser 上，写到 `ask` 后面会被当成未知参数直接报错。
 *  单独抽出来是为了能测：顺序写反在运行时才炸，而那时模型已经加载过一轮了。 */
export function buildVlmArgs(imagePath: string, question: string): string[] {
  return ['--json', '--max-tokens', String(MAX_TOKENS), 'ask', imagePath, '--q', question]
}

/** 剥掉 vlm --json 的外层信封 { ok, text, elapsed_secs }，取出模型原话 */
export function parseVlmOutput(stdout: string): string {
  const envelope = JSON.parse(stdout.trim()) as { ok?: boolean; text?: string }
  const content = envelope.text || ''
  if (!content.trim()) throw new Error('本地模型返回空内容')
  return content
}

/** 视觉模型「只输出 JSON」的承诺不可信：剥 ```json 围栏、截首尾大括号 */
function parseJsonLoose(text: string): Record<string, unknown> {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  return JSON.parse(t) as Record<string, unknown>
}

/** 与中台 basePayload 同构的归一化：超长截断、非法比例兜底 3:4 */
function normalizeSculpt(parsed: Record<string, unknown>): ReverseResult {
  const sculptIn = (parsed.sculpt || {}) as Record<string, unknown>
  const sculpt: Record<string, string> = {}
  for (const key of ['subject', 'composition', 'universe', 'light', 'print', 'texture']) {
    sculpt[key] = String(sculptIn[key] || '').slice(0, 500)
  }
  const ratio = ALLOWED_RATIOS.includes(parsed.aspect_ratio as string)
    ? (parsed.aspect_ratio as string)
    : ALLOWED_RATIOS.includes(parsed.ratio as string)
      ? (parsed.ratio as string)
      : '3:4'
  return {
    ok: true,
    sculpt,
    prompt: String(parsed.prompt || '').slice(0, 2000),
    prompt_cn: String(parsed.prompt_cn || '').slice(0, 2000),
    style_tags: Array.isArray(parsed.style_tags)
      ? (parsed.style_tags as unknown[]).slice(0, 6).map((t) => String(t).slice(0, 30))
      : [],
    aspect_ratio: ratio,
    zh_name: String(parsed.zh_name || '裂变风格').slice(0, 24),
    description: String(parsed.description || '').slice(0, 200),
  }
}
