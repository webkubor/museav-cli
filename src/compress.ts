/**
 * 参考图压缩 —— 上传前把图缩到视觉模型够用的尺寸。
 *
 * 参考图的用途是「让模型看懂画面」，不是留档，不需要原始分辨率。实测 4.1MB 的海报
 * 直接传上去，中台那次图生模板任务卡在「解析图片」再没回来（后台任务被 Cloudflare
 * 掐掉，任务永远 pending）。50MB 的图更不用说。
 *
 * sharp 是 optionalDependency：原生模块在个别平台会装不上，装不上也不能让整个 CLI
 * 用不了。取不到就原样上传并提示——压缩是优化，不是前置条件。
 */
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'

/** 长边上限：主流视觉模型的有效输入分辨率都在 1.5k 上下，再大只是浪费带宽和解析时间 */
const MAX_EDGE = 1568
/** 小于这个体积且尺寸不超标就原样传，不折腾 */
const SKIP_BELOW_BYTES = 900 * 1024
/** 压完仍超过它就再降一档质量 */
const TARGET_BYTES = 1.5 * 1024 * 1024

export interface CompressResult {
  /** 要上传的数据；未压缩时为 null，表示用原文件 */
  buffer: Buffer | null
  /** 上传时用的文件名（转了格式要换扩展名） */
  filename: string
  /** 给人看的一行说明，未压缩时为空 */
  note: string
}

async function loadSharp(): Promise<any | null> {
  try {
    const m = await import('sharp')
    return (m as any).default ?? m
  } catch {
    return null
  }
}

/**
 * @param filePath 本地图片路径
 * @returns 压缩结果；非图片、体积已达标、或 sharp 不可用时 buffer 为 null
 */
export async function compressForVision(filePath: string): Promise<CompressResult> {
  const name = basename(filePath)
  const orig = (await stat(filePath)).size

  const sharp = await loadSharp()
  if (!sharp) {
    return {
      buffer: null,
      filename: name,
      note: orig > SKIP_BELOW_BYTES
        ? `未安装 sharp，${(orig / 1024 / 1024).toFixed(1)}MB 原图直传（大图可能导致解析超时）`
        : '',
    }
  }

  let meta
  try {
    meta = await sharp(filePath).metadata()
  } catch {
    return { buffer: null, filename: name, note: '' }   // 不是 sharp 认识的图（视频/音频）→ 原样传
  }

  const longEdge = Math.max(meta.width || 0, meta.height || 0)
  if (orig <= SKIP_BELOW_BYTES && longEdge <= MAX_EDGE) {
    return { buffer: null, filename: name, note: '' }
  }

  // 有 alpha 的保持 PNG（贴图类素材的透明通道不能丢），其余一律转 JPEG——
  // 同样画质下 JPEG 比 PNG 小一个数量级，而参考图不需要无损。
  //
  // 只看 meta.hasAlpha 不够：截图工具产出的 PNG 普遍带一条**全不透明**的 alpha 通道，
  // 照着它走 PNG 分支等于白白多存几倍体积（实测 4.1MB 海报按 PNG 只压到 1.16MB，
  // 按 JPEG 是 0.2MB）。用 stats().isOpaque 判断透明通道有没有被真正用到。
  let hasAlpha = !!meta.hasAlpha
  if (hasAlpha) {
    try {
      const st = await sharp(filePath).stats()
      if (st.isOpaque) hasAlpha = false
    } catch { /* 统计失败就按有 alpha 保守处理 */ }
  }
  const pipeline = sharp(filePath).rotate()   // rotate() 不带参数=按 EXIF 摆正，否则手机竖拍图会躺着
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })

  let out: Buffer
  let ext: string
  if (hasAlpha) {
    out = await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
    ext = 'png'
  } else {
    out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    ext = 'jpg'
    if (out.byteLength > TARGET_BYTES) {
      out = await sharp(filePath).rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 68, mozjpeg: true }).toBuffer()
    }
  }

  // 压完反而更大（本来就是小图/高压缩率的 WebP 之类）就别换了
  if (out.byteLength >= orig) return { buffer: null, filename: name, note: '' }

  const pct = Math.round((1 - out.byteLength / orig) * 100)
  return {
    buffer: out,
    filename: name.replace(/\.[^.]+$/, '') + '.' + ext,
    note: `已压缩 ${(orig / 1024 / 1024).toFixed(1)}MB → ${(out.byteLength / 1024 / 1024).toFixed(2)}MB（-${pct}%，长边 ≤ ${MAX_EDGE}px）`,
  }
}
