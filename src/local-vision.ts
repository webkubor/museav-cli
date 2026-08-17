/**
 * 本地视觉模型（Ollama + qwen3-vl）—— reverse 的主路。
 * 中台 API 逆向一次要十几秒到几十秒，本地 8b 量化模型在 Apple Silicon 上更快且零成本；
 * API 降级为回落路（commands/reverse.ts 负责切换与提示）。
 * 提示词与返回结构从中台 _reverse-core.js / reverse-template.js 移植，保证两条路产出同构。
 */
import { readFile } from 'node:fs/promises'
import { compressForVision } from './compress.js'
import type { ReverseResult } from './client.js'

/** 本地读图模型。换档位用 MUSEAV_LOCAL_VLM 环境变量，不用改代码 */
export const LOCAL_VLM_MODEL = process.env.MUSEAV_LOCAL_VLM || 'qwen3-vl:8b'

const ALLOWED_RATIOS = ['3:4', '9:16', '1:1', '4:3', '16:9']

// OLLAMA_HOST 生态里带不带 scheme、带不带尾斜杠的写法都有
function ollamaHost(): string {
  let host = process.env.OLLAMA_HOST || 'http://localhost:11434'
  if (!/^https?:\/\//.test(host)) host = `http://${host}`
  return host.replace(/\/+$/, '')
}

export interface LocalVlmStatus {
  running: boolean
  modelPresent: boolean
  host: string
  /** running=false 时的原因（给用户看的行动指引） */
  reason?: string
}

/** 探活 + 模型在位检查。3 秒探不通就是没起服务，不等推理超时才发现 */
export async function checkLocalVlm(): Promise<LocalVlmStatus> {
  const host = ollamaHost()
  try {
    const resp = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!resp.ok) {
      return { running: false, modelPresent: false, host, reason: `Ollama 探活返回 HTTP ${resp.status}` }
    }
    const tags = (await resp.json()) as { models?: Array<{ name?: string }> }
    const names = (tags.models || []).map((m) => m.name || '')
    if (!names.includes(LOCAL_VLM_MODEL)) {
      return { running: true, modelPresent: false, host, reason: `模型未拉取，执行: ollama pull ${LOCAL_VLM_MODEL}` }
    }
    return { running: true, modelPresent: true, host }
  } catch {
    return { running: false, modelPresent: false, host, reason: `Ollama 未运行（${host}），启动: ollama serve 或 brew services start ollama` }
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
  // 复用上传同款压缩：图小不仅传得快，本地 VLM 推理也快
  const { buffer, note } = await compressForVision(filePath)
  if (note) process.stderr.write(`  ${note}\n`)
  const bytes = buffer ?? (await readFile(filePath))
  const b64 = Buffer.from(bytes).toString('base64')

  const payload = {
    model: LOCAL_VLM_MODEL,
    messages: [
      { role: 'system', content: sculptSystemPrompt() },
      { role: 'user', content: '用 SCULPT 六要素分析这张图，逆推出图 prompt', images: [b64] },
    ],
    stream: false,
  }

  // 8b 视觉推理单张图几十秒量级，给足余量
  const resp = await fetch(`${ollamaHost()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  })
  if (!resp.ok) {
    throw new Error(`Ollama 返回 HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  }
  const out = (await resp.json()) as { message?: { content?: string } }
  const content = out.message?.content || ''
  if (!content.trim()) throw new Error('本地模型返回空内容')

  return normalizeSculpt(parseJsonLoose(content))
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
