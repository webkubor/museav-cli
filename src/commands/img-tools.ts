/** museav compress / remove-bg —— 本地图像工具箱。
 *  纯本地、免登录、不碰中台；stdout 只出产物路径，统计与进度打 stderr。
 *  代码零平台假设（路径全走 node:path/os，无 shell 展开、无 Unix-only 命令），macOS / Windows 通用。 */
import { stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { removeBackgroundLocal, BG_MODELS, type BgModelKey } from '../local-bg.js'

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

function fmtBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : `${(n / 1024).toFixed(1)}KB`
}

/** 默认输出路径：同目录 <名字>-<后缀>.<新扩展名>。绝不覆写输入文件 */
export function defaultOut(input: string, suffix: string, newExt?: string): string {
  const ext = newExt || extname(input).slice(1) || 'png'
  return join(dirname(input), `${basename(input, extname(input))}-${suffix}.${ext}`)
}

export interface CompressOpts {
  out?: string
  maxEdge?: string
  quality?: string
  format?: string
  overwrite?: boolean
}

export async function compressCmd(input: string, opts: CompressOpts): Promise<void> {
  if (!(await fileExists(input))) throw new Error(`文件不存在: ${input}`)

  let sharp: any
  try {
    const m = await import('sharp')
    sharp = (m as any).default ?? m
  } catch {
    throw new Error('sharp 不可用（压缩依赖它）。重装 CLI 即可补上：npm install -g museav-cli')
  }

  const format = (opts.format || '').toLowerCase()
  if (format && !['jpg', 'png', 'webp'].includes(format)) throw new Error('--format 只支持 jpg / png / webp')
  const quality = opts.quality ? Number(opts.quality) : 82
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) throw new Error('--quality 必须是 1-100')
  const maxEdge = opts.maxEdge ? Number(opts.maxEdge) : 0
  if (opts.maxEdge && (!Number.isFinite(maxEdge) || maxEdge < 16)) throw new Error('--max-edge 至少 16px')

  const meta = await sharp(input).metadata()
  // 不指定 --format 时保持原格式；不在三之列的（tiff/bmp/heic…）统一转 jpg
  const srcFormat = String(meta.format || '')
  const target = format || (srcFormat === 'png' ? 'png' : srcFormat === 'webp' ? 'webp' : 'jpg')

  let pipeline = sharp(input).rotate() // 尊重 EXIF 方向
  if (maxEdge) pipeline = pipeline.resize({ width: maxEdge, height: maxEdge, fit: 'inside' })
  if (target === 'jpg') pipeline = pipeline.jpeg({ quality, mozjpeg: true })
  else if (target === 'webp') pipeline = pipeline.webp({ quality })
  else pipeline = pipeline.png({ compressionLevel: 9 })

  const outPath = opts.out || defaultOut(input, 'min', target === 'jpg' && srcFormat === 'jpeg' ? 'jpg' : target)
  if ((await fileExists(outPath)) && !opts.overwrite) {
    throw new Error(`输出已存在（用 --overwrite 覆盖或 --out 换路径）: ${outPath}`)
  }
  const buf = await pipeline.toBuffer()
  await writeFile(outPath, buf)

  const before = (await stat(input)).size
  process.stderr.write(`✅ ${fmtBytes(before)} → ${fmtBytes(buf.length)}（省 ${Math.max(0, Math.round((1 - buf.length / before) * 100))}%，${target.toUpperCase()}）\n`)
  console.log(outPath)
}

export interface RemoveBgOpts {
  out?: string
  model?: string
  overwrite?: boolean
}

export async function removeBgCmd(input: string, opts: RemoveBgOpts): Promise<void> {
  if (!(await fileExists(input))) throw new Error(`文件不存在: ${input}`)
  const modelKey = (opts.model || 'isnet') as BgModelKey
  if (!(modelKey in BG_MODELS)) throw new Error(`--model 只支持 ${Object.keys(BG_MODELS).join(' / ')}`)

  const start = Date.now()
  const png = await removeBackgroundLocal(input, modelKey)
  const outPath = opts.out || defaultOut(input, 'nobg', 'png')
  if ((await fileExists(outPath)) && !opts.overwrite) {
    throw new Error(`输出已存在（用 --overwrite 覆盖或 --out 换路径）: ${outPath}`)
  }
  await writeFile(outPath, png)
  process.stderr.write(`✅ 抠图完成（${BG_MODELS[modelKey].label}，用时 ${((Date.now() - start) / 1000).toFixed(1)}s，${fmtBytes(png.length)}）\n`)
  console.log(outPath)
}
