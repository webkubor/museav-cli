/**
 * 本地去水印 —— remove-watermark 的核心实现。
 * 链路：纯像素启发式定位水印（零模型依赖，不占内存）→ LaMa 掩码修复 →
 * 输出干净图。也可 --mask 手工给掩码（白=要去除的区域），跳过自动定位。
 * 全本地、免登录、零成本；许可证均兼容（LaMa 模型 Apache-2.0，onnxruntime MIT）。
 */
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const LAMA_URLS = [
  'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
  // 国内网络拉不动 HF 时的镜像（同一文件；镜像没缓存会回落直链，所以放第二位）
  'https://hf-mirror.com/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
]
const LAMA_PATH = join(homedir(), '.museav-models', 'lama', 'lama_fp32.onnx')

async function ensureLamaModel(): Promise<string> {
  try {
    if ((await stat(LAMA_PATH)).size > 50_000_000) return LAMA_PATH
  } catch { /* 未下载 */ }
  await mkdir(join(homedir(), '.museav-models', 'lama'), { recursive: true })
  process.stderr.write('↓ 首次使用，下载 LaMa 修复模型（~200MB，一次性，缓存到 ~/.museav-models/lama）...\n')
  let lastErr: unknown = null
  for (const url of LAMA_URLS) {
    try {
      const resp = await fetch(url, { redirect: 'follow' })
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)
      const total = Number(resp.headers.get('content-length') || 0)
      const chunks: Buffer[] = []
      let got = 0
      const reader = resp.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(Buffer.from(value))
        got += value.length
        if (total) process.stderr.write(`  ${(got / 1048576).toFixed(0)}/${(total / 1048576).toFixed(0)}MB\r`)
      }
      process.stderr.write('\n')
      const buf = Buffer.concat(chunks)
      if (buf.length < 50_000_000) throw new Error('下载不完整')
      await writeFile(LAMA_PATH, buf)
      return LAMA_PATH
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`LaMa 模型下载失败（${lastErr instanceof Error ? lastErr.message : lastErr}），也可手动放到 ${LAMA_PATH}`)
}

/** LaMa 要求边长被 8 整除：右/下边缘复制填充，修完再裁回 */
const pad8 = (n: number) => Math.ceil(n / 8) * 8

export interface Bbox {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * 纯像素启发式水印定位（零模型依赖）。
 * 原理：半透明水印（角标/文字）是「低对比、高频、铺在大片区域的细碎纹理」，
 * 把四角区域做中值模糊后与原图差分，叠字区会出现稳定的高差值像素团。
 * 判定保守：角区差分像素占比在 [0.3%, 8%] 才算水印（太少=没叠字，
 * 太多=画面本身纹理复杂，不硬修）；坐标 0-1000 归一化输出。
 * 误检最坏是 LaMa 重绘一块（轻微损伤），另有 --mask 手工精确兜底。
 */
export async function detectWatermarkBoxes(imagePath: string): Promise<Bbox[]> {
  const sharpMod = await import('sharp')
  const sharp = (sharpMod as any).default ?? sharpMod
  const meta = await sharp(imagePath).rotate().metadata()
  const W = meta.width || 0
  const H = meta.height || 0
  if (!W || !H) throw new Error('读不到图片尺寸')

  const corners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ]
  const cw = Math.round(W * 0.35)
  const ch = Math.round(H * 0.35)
  const boxes: Bbox[] = []

  for (const { x, y } of corners) {
    const left = x ? W - cw : 0
    const top = y ? H - ch : 0
    const { data: orig } = await sharp(imagePath).rotate()
      .extract({ left, top, width: cw, height: ch }).raw().toBuffer({ resolveWithObject: true })
    const { data: blurred } = await sharp(imagePath).rotate()
      .extract({ left, top, width: cw, height: ch })
      .median(7)
      .raw().toBuffer({ resolveWithObject: true })

    // 差分 + 阈值；记录超阈值像素的 bbox
    let cnt = 0
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
    for (let i = 0; i < cw * ch; i++) {
      const dr = Math.abs(orig[i * 3] - blurred[i * 3])
      const dg = Math.abs(orig[i * 3 + 1] - blurred[i * 3 + 1])
      const db = Math.abs(orig[i * 3 + 2] - blurred[i * 3 + 2])
      if (dr + dg + db > 90) { // 每通道均值 >30
        cnt++
        const px = i % cw
        const py = Math.floor(i / cw)
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (py < minY) minY = py
        if (py > maxY) maxY = py
      }
    }
    const ratio = cnt / (cw * ch)
    if (ratio >= 0.003 && ratio <= 0.08 && maxX >= 0) {
      // 像素 → 0-1000 归一化（带 2% 外扩）
      const pad = 0.02
      const box = {
        x1: Math.max(0, ((left + minX) / W) * 1000 - pad * 1000),
        y1: Math.max(0, ((top + minY) / H) * 1000 - pad * 1000),
        x2: Math.min(1000, ((left + maxX) / W) * 1000 + pad * 1000),
        y2: Math.min(1000, ((top + maxY) / H) * 1000 + pad * 1000),
      }
      // 贴角锚定：水印通常贴着所在角的边沿（5% 容差）。背景装饰/纹理也常被差分命中，
      // 但它们离角远——角标类水印的判据就是「贴角」，否则宁可不修。
      const anchored =
        (x === 0 && y === 0 && box.x1 <= 50 && box.y1 <= 50) ||
        (x === 1 && y === 0 && box.x2 >= 950 && box.y1 <= 50) ||
        (x === 0 && y === 1 && box.x1 <= 50 && box.y2 >= 950) ||
        (x === 1 && y === 1 && box.x2 >= 950 && box.y2 >= 950)
      if (anchored) boxes.push(box)
    }
  }
  return boxes
}

/** 掩码修复主流程：mask 白色=要去除（Buffer 或文件路径）；输出 PNG Buffer。
 *  模型是固定 512×512 输入——整图缩进去会毁分辨率，所以按掩码连通域逐块处理：
 *  裁出带边距的局部 → letterbox 进 512 修复 → 只把掩码内的像素贴回原图。 */
export async function inpaintLocal(imagePath: string, mask: Buffer | string): Promise<Buffer> {
  const ort = await import('onnxruntime-node')
  const sharpMod = await import('sharp')
  const sharp = (sharpMod as any).default ?? sharpMod
  const modelFile = await ensureLamaModel()
  const session = await ort.InferenceSession.create(modelFile)
  const S = 512

  const { data: rgb, info } = await sharp(imagePath).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const maskRaw = await sharp(mask).rotate().resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer()

  // 连通域（在 1/4 采样上 BFS，够用）：返回像素坐标 bbox 列表
  const boxes = connectedBoxes(maskRaw, W, H)

  // 工作底图：逐块修复后叠回去
  let out = rgb

  for (const box of boxes) {
    // 边距：给修复模型一点上下文
    const margin = Math.round(Math.max(box.w, box.h) * 0.35) + 16
    const x0 = Math.max(0, box.x - margin)
    const y0 = Math.max(0, box.y - margin)
    const x1 = Math.min(W, box.x + box.w + margin)
    const y1 = Math.min(H, box.y + box.h + margin)
    const cw = x1 - x0
    const ch = y1 - y0

    // letterbox 进 512×512（等比缩放居中，四周留黑）
    const scale = Math.min(S / cw, S / ch)
    const iw = Math.max(8, Math.round(cw * scale))
    const ih = Math.max(8, Math.round(ch * scale))
    const ox = Math.floor((S - iw) / 2)
    const oy = Math.floor((S - ih) / 2)

    const cropImg = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
      .extract({ left: x0, top: y0, width: cw, height: ch })
      .resize(iw, ih, { fit: 'fill' })
      .raw().toBuffer()
    // ⚠ sharp 的坑：raw 1 通道经 extract→resize 会悄悄变 3 通道（长度×3），
    // 后面按 1 通道读全是错位数据。掩码管线一律 toColourspace('b-w') 强制单通道。
    const cropMask = await sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } })
      .extract({ left: x0, top: y0, width: cw, height: ch })
      .resize(iw, ih, { fit: 'fill' })
      .toColourspace('b-w')
      .raw().toBuffer()

    const imgC = Buffer.alloc(S * S * 3, 0)
    const maskC = Buffer.alloc(S * S, 0)
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const si = (y * iw + x) * 3
        const di = ((oy + y) * S + (ox + x)) * 3
        imgC[di] = cropImg[si]
        imgC[di + 1] = cropImg[si + 1]
        imgC[di + 2] = cropImg[si + 2]
        maskC[(oy + y) * S + (ox + x)] = cropMask[y * iw + x] > 127 ? 1 : 0
      }
    }

    const N = S * S
    const imgF = new Float32Array(3 * N)
    for (let i = 0; i < N; i++) {
      imgF[i] = imgC[i * 3] / 255
      imgF[N + i] = imgC[i * 3 + 1] / 255
      imgF[2 * N + i] = imgC[i * 3 + 2] / 255
    }
    const results = await session.run({
      image: new ort.Tensor('float32', imgF, [1, 3, S, S]),
      mask: new ort.Tensor('float32', new Float32Array(maskC), [1, 1, S, S]),
    })
    const o = results[session.outputNames[0]].data as Float32Array

    // 取回中心区域，缩回原尺寸
    const back = Buffer.alloc(iw * ih * 3)
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        const so = ((oy + y) * S + (ox + x))
        const di = (y * iw + x) * 3
        back[di] = clamp255(o[so])
        back[di + 1] = clamp255(o[N + so])
        back[di + 2] = clamp255(o[2 * N + so])
      }
    }
    const restoredFull = await sharp(back, { raw: { width: iw, height: ih, channels: 3 } })
      .resize(cw, ch, { fit: 'fill' }).raw().toBuffer()
    const maskFull = await sharp(cropMask, { raw: { width: iw, height: ih, channels: 1 } })
      .resize(cw, ch, { fit: 'fill' })
      .toColourspace('b-w')
      .raw().toBuffer()

    // 只把掩码内的像素贴回，其余保持原图（缩放往返会损伤未掩码区，不能整块覆盖）
    const next = Buffer.from(out)
    for (let i = 0; i < cw * ch; i++) {
      if (maskFull[i] > 127) {
        next[((y0 + Math.floor(i / cw)) * W + (x0 + (i % cw))) * 3] = restoredFull[i * 3]
        next[(((y0 + Math.floor(i / cw)) * W + (x0 + (i % cw))) * 3) + 1] = restoredFull[i * 3 + 1]
        next[(((y0 + Math.floor(i / cw)) * W + (x0 + (i % cw))) * 3) + 2] = restoredFull[i * 3 + 2]
      }
    }
    out = next
    process.stderr.write(`  修复块 ${cw}x${ch} @(${x0},${y0}) 完成\n`)
  }

  return sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
}

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

/** 掩码连通域 → 像素 bbox 列表。在 1/4 采样上网格 BFS，快且够准 */
function connectedBoxes(mask: Buffer, W: number, H: number): Array<{ x: number; y: number; w: number; h: number }> {
  const step = 4
  const gw = Math.ceil(W / step)
  const gh = Math.ceil(H / step)
  const grid = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let hit = false
      for (let dy = 0; dy < step && !hit; dy++) {
        for (let dx = 0; dx < step && !hit; dx++) {
          const x = gx * step + dx
          const y = gy * step + dy
          if (x < W && y < H && mask[y * W + x] > 127) hit = true
        }
      }
      grid[gy * gw + gx] = hit ? 1 : 0
    }
  }
  const seen = new Uint8Array(gw * gh)
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = []
  const q: number[] = []
  for (let g = 0; g < grid.length; g++) {
    if (!grid[g] || seen[g]) continue
    q.length = 0
    q.push(g)
    seen[g] = 1
    let minx = gw, miny = gh, maxx = -1, maxy = -1
    while (q.length) {
      const cur = q.pop()!
      const cx = cur % gw
      const cy = Math.floor(cur / gw)
      minx = Math.min(minx, cx); maxx = Math.max(maxx, cx)
      miny = Math.min(miny, cy); maxy = Math.max(maxy, cy)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        const ni = ny * gw + nx
        if (grid[ni] && !seen[ni]) { seen[ni] = 1; q.push(ni) }
      }
    }
    boxes.push({ x: minx * step, y: miny * step, w: (maxx - minx + 1) * step, h: (maxy - miny + 1) * step })
  }
  return boxes
}

/** 从检测框生成掩码 Buffer（框外扩 2%，白=去除区） */
export async function maskFromBoxes(imagePath: string, boxes: Bbox[]): Promise<Buffer> {
  const sharpMod = await import('sharp')
  const sharp = (sharpMod as any).default ?? sharpMod
  const meta = await sharp(imagePath).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (!w || !h) throw new Error('读不到图片尺寸')
  // 坐标体系一次判清：全部 ≤1.5 视为 0-1 归一化，否则按 qwen 惯例的 0-1000
  const all = boxes.flatMap((b) => [b.x1, b.y1, b.x2, b.y2])
  const denom = Math.max(...all) <= 1.5 ? 1 : 1000
  const svg = boxes
    .map((b) => {
      const pad = 0.02
      const x1 = Math.max(0, (b.x1 / denom) * w - w * pad)
      const y1 = Math.max(0, (b.y1 / denom) * h - h * pad)
      const x2 = Math.min(w, (b.x2 / denom) * w + w * pad)
      const y2 = Math.min(h, (b.y2 / denom) * h + h * pad)
      return `<rect x="${x1}" y="${y1}" width="${Math.max(1, x2 - x1)}" height="${Math.max(1, y2 - y1)}" fill="#fff"/>`
    })
    .join('')
  const maskSvg = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000"/>${svg}</svg>`)
  return sharp(maskSvg).png().toBuffer()
}
