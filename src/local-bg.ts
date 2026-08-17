/**
 * 本地抠图（去背景）—— remove-bg 的核心实现。
 * 模型走 ONNX（ISNet / U2Net，均 Apache-2.0），推理走 onnxruntime-node（MIT），
 * 前后处理走 sharp —— 整条链路许可证干净（imgly 那个 npm 包是 AGPL，不进依赖），
 * 且三个依赖在 macOS / Windows / Linux 都有预编译，无平台特化代码。
 * 模型文件首次使用时下载到 ~/.museav-models/ 缓存（一次性 ~170MB）。
 */
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const BG_MODELS = {
  isnet: {
    file: 'isnet-general-use.onnx',
    // rembg 官方 release 托管的同一份模型（Apache-2.0，源自 xuebinqin/DIS）
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx',
    label: 'ISNet（通用，质量优先）',
  },
  u2net: {
    file: 'u2net.onnx',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx',
    label: 'U2Net（经典通用）',
  },
} as const

export type BgModelKey = keyof typeof BG_MODELS

const MODEL_DIR = join(homedir(), '.museav-models')
const INPUT_EDGE = 1024

function modelPath(key: BgModelKey): string {
  return join(MODEL_DIR, BG_MODELS[key].file)
}

/** 模型在位返回路径；不在则下载（流式，进度打 stderr）。下载失败抛 Error */
export async function ensureBgModel(key: BgModelKey): Promise<string> {
  const dest = modelPath(key)
  try {
    const s = await stat(dest)
    if (s.size > 10_000_000) return dest // 正常模型都是百 MB 级；太小的文件视为残缺重下
  } catch {
    // 不存在，走下载
  }
  await mkdir(MODEL_DIR, { recursive: true })
  const def = BG_MODELS[key]
  process.stderr.write(`↓ 首次使用，下载 ${def.label}（~170MB，一次性，缓存到 ${MODEL_DIR}）...\n`)
  const resp = await fetch(def.url)
  if (!resp.ok || !resp.body) throw new Error(`模型下载失败 HTTP ${resp.status}：${def.url}`)
  const total = Number(resp.headers.get('content-length') || 0)
  const chunks: Buffer[] = []
  let got = 0
  const reader = resp.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    got += value.length
    if (total) process.stderr.write(`  ${((got / total) * 100).toFixed(0)}%\r`)
  }
  process.stderr.write('\n')
  const buf = Buffer.concat(chunks)
  if (buf.length < 10_000_000) throw new Error('模型下载不完整，请重试')
  await writeFile(dest, buf)
  return dest
}

/** 抠图主流程：输入图片路径 → 输出带 alpha 的 PNG Buffer */
export async function removeBackgroundLocal(inputPath: string, modelKey: BgModelKey): Promise<Buffer> {
  // 动态加载：onnxruntime-node 是 optionalDependency，缺失时给安装指引而不是崩
  let ort: typeof import('onnxruntime-node')
  try {
    ort = await import('onnxruntime-node')
  } catch {
    throw new Error('onnxruntime-node 不可用。重装 CLI 即可补上：npm install -g museav-cli')
  }
  const sharp = await loadSharpOrThrow()
  const modelFile = await ensureBgModel(modelKey)
  const session = await ort.InferenceSession.create(modelFile)

  // ── 预处理：EXIF 转正、去 alpha、RGB raw ──
  const { data: rgb, info } = await sharp(inputPath).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 3) throw new Error(`预处理得到 ${info.channels} 通道（预期 3）`)

  // ── 模型输入：拉伸到 1024×1024，(x/255 - 0.5)/0.5 归一化，HWC → CHW ──
  const small = await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
    .resize(INPUT_EDGE, INPUT_EDGE, { fit: 'fill' })
    .raw()
    .toBuffer()
  const f32 = new Float32Array(3 * INPUT_EDGE * INPUT_EDGE)
  const N = INPUT_EDGE * INPUT_EDGE
  for (let i = 0; i < N; i++) {
    f32[i] = (small[i * 3] / 255 - 0.5) / 0.5
    f32[N + i] = (small[i * 3 + 1] / 255 - 0.5) / 0.5
    f32[2 * N + i] = (small[i * 3 + 2] / 255 - 0.5) / 0.5
  }
  const feeds: Record<string, import('onnxruntime-node').Tensor> = {}
  feeds[session.inputNames[0]] = new ort.Tensor('float32', f32, [1, 3, INPUT_EDGE, INPUT_EDGE])
  const results = await session.run(feeds)
  const out = results[session.outputNames[0]]
  const maskFlat = out.data as Float32Array
  if (maskFlat.length < N) throw new Error(`模型输出尺寸异常（${maskFlat.length}）`)

  // ── 后处理：min-max 归一化到 0-255，再缩回原图尺寸 ──
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < N; i++) {
    const v = maskFlat[i]
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const range = hi - lo || 1
  const mask8 = Buffer.alloc(N)
  for (let i = 0; i < N; i++) mask8[i] = Math.round(((maskFlat[i] - lo) / range) * 255)
  const maskFull = await sharp(mask8, { raw: { width: INPUT_EDGE, height: INPUT_EDGE, channels: 1 } })
    .resize(info.width, info.height, { fit: 'fill' })
    .raw()
    .toBuffer()

  // ── alpha 合成：直接构造 RGBA（alpha = mask），不依赖 composite 的混合语义 ──
  const w = info.width
  const h = info.height
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[i * 3]
    rgba[i * 4 + 1] = rgb[i * 3 + 1]
    rgba[i * 4 + 2] = rgb[i * 3 + 2]
    rgba[i * 4 + 3] = maskFull[i]
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

async function loadSharpOrThrow(): Promise<any> {
  try {
    const m = await import('sharp')
    const sharp = (m as any).default ?? m
    // 造 1px 图跑通全链路：native binding 坏了在第一次真用时才炸，这里提前暴露
    await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).raw().toBuffer()
    return sharp
  } catch {
    throw new Error('sharp 不可用。重装 CLI 即可补上：npm install -g museav-cli')
  }
}
