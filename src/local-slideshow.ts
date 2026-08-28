/**
 * 本地图集转竖版短视频 —— slideshow 的核心实现。
 * 一组图 + 每张的文字说明 + 配乐 → mp4，适合发朋友圈 / 视频号 / 小红书。
 *
 * 版面由**排版模板（图层 DSL）**描述，不再写死在代码里。内置一套默认模板（免登录可用），
 * `--layout <slug>` 可以拉中台 `slideshow_layouts` 里的模板 —— 模板结构的真源在中台的
 * `shared/slideshow-layout.js`。
 *
 * ## 这里刻意不校验模板
 *
 * 校验只在中台写入时做。本模块是消费方：遇到不认识的层类型**跳过该层并提示升级 CLI**，
 * 而不是报错中断。老版本 CLI 碰上新层类型应该少画一个图层，不是彻底出不了片。
 * 两侧都校验的话，老 CLI 会把新写的合法模板判为非法，那才是真坏掉。
 *
 * 渲染走 sharp 渲染 SVG（中文靠系统字体），合成走 ffmpeg 的 concat demuxer ——
 * 不引入 canvas 那种要编译的重依赖。
 *
 * 三个实测踩出来的点，写在这里免得下次重踩：
 *
 * 1. 图片必须显式放大。小图（如 240×240 的表情）直接贴到 1080 宽的画布上只占两成宽，
 *    画面空得离谱。要按目标尺寸等比 resize，而不是「不超过某上限」那种只缩不放的逻辑。
 *    贴纸类素材还要先裁掉四周透明留白（slot 层的 trim），否则放大的是留白、主体照样小。
 * 2. 配乐不能直接 -shortest。配乐通常比视频长几倍，硬切会在中途断掉。
 *    要 atrim 裁到视频时长 + 首尾 afade。
 * 3. concat demuxer 的最后一张要再列一次，否则它的 duration 被忽略，末页一闪而过。
 */
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

/** 图层类型。与中台 shared/slideshow-layout.js 的 LAYER_TYPES 对应。 */
export type LayerType = 'rect' | 'ellipse' | 'text' | 'slot' | 'image'

export interface Layer {
  type: LayerType | string
  fill?: string
  opacity?: number
  // rect / slot / image
  box?: [number, number, number, number]
  radius?: number
  fit?: 'contain' | 'cover'
  trim?: boolean
  src?: string
  // ellipse
  cx?: number; cy?: number; rx?: number; ry?: number
  // text
  bind?: string | null
  text?: string
  x?: number; y?: number
  size?: number
  weight?: number
  align?: 'left' | 'center' | 'right'
  maxWidth?: number
  minSize?: number
}

export interface Layout {
  version?: number
  canvas: { w: number; h: number; bg?: string }
  seconds?: number
  layers: Layer[]
}

/** 渲染时填进模板的内容。caption / image 逐页变化，其余全局固定。 */
export interface PageContent {
  title?: string
  subtitle?: string
  caption?: string
  footer?: string
  image: string
}

export interface SlideshowOpts {
  images: string[]
  out: string
  layout: Layout
  captions?: string[]
  title?: string
  subtitle?: string
  footer?: string
  music?: string
  seconds?: number
  /** 目标尺寸。与模板 canvas 不同时整个版面按比例缩放 */
  width?: number
  height?: number
  /** 解析 sticker://<id> → 图片 URL/本地路径。不传则跳过这类图层 */
  resolveSticker?: (id: string) => Promise<string | null>
  onWarn?: (msg: string) => void
}

const FONT = 'Hiragino Sans GB, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** 中文按全宽算、ASCII 按半宽算，估出一行文字的像素宽，用来收敛字号 */
function textWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) w += /[一-鿿　-〿＀-￯]/.test(ch) ? size : size * 0.55
  return w
}

function fitSize(text: string, max: number, start: number, min: number): number {
  let size = start
  while (size > min && textWidth(text, size) > max) size -= 2
  return size
}

/** 取 text 层这一页该显示的文字：有 bind 就取绑定值，否则用固定 text */
function resolveText(layer: Layer, content: PageContent): string {
  if (!layer.bind) return layer.text ?? ''
  const v = (content as unknown as Record<string, unknown>)[layer.bind]
  return typeof v === 'string' ? v : ''
}

/**
 * 把一页渲染成 SVG（不含图片 —— 图片走 sharp composite，SVG 里嵌 base64 会让文件爆大）。
 * 返回 SVG 字符串 + 需要 composite 的图片层。
 */
function buildPage(layout: Layout, content: PageContent, scale: number, onWarn?: (m: string) => void) {
  const W = Math.round(layout.canvas.w * scale)
  const H = Math.round(layout.canvas.h * scale)
  const s = (n: number) => n * scale
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="${layout.canvas.bg ?? '#ffffff'}"/>`]
  const images: { layer: Layer; box: [number, number, number, number] }[] = []
  const unknown = new Set<string>()

  for (const layer of layout.layers) {
    const op = layer.opacity !== undefined ? ` opacity="${layer.opacity}"` : ''

    if (layer.type === 'rect' && layer.box) {
      const [x, y, w, h] = layer.box
      const r = layer.radius ? ` rx="${s(layer.radius)}"` : ''
      parts.push(`<rect x="${s(x)}" y="${s(y)}" width="${s(w)}" height="${s(h)}"${r} fill="${layer.fill ?? '#000000'}"${op}/>`)
    } else if (layer.type === 'ellipse') {
      parts.push(`<ellipse cx="${s(layer.cx ?? 0)}" cy="${s(layer.cy ?? 0)}" rx="${s(layer.rx ?? 0)}" ry="${s(layer.ry ?? 0)}" fill="${layer.fill ?? '#000000'}"${op}/>`)
    } else if (layer.type === 'text') {
      const txt = resolveText(layer, content)
      // 绑定值为空就整层不画（比如没给 --subtitle），而不是画一行空白占位
      if (!txt) continue
      const base = s(layer.size ?? 40)
      const min = s(layer.minSize ?? Math.max(12, (layer.size ?? 40) * 0.5))
      const max = (layer.maxWidth ?? 0.86) * W
      const size = fitSize(txt, max, base, min)
      const anchor = layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle'
      const weight = layer.weight ? ` font-weight="${layer.weight}"` : ''
      parts.push(
        `<text x="${s(layer.x ?? 0)}" y="${s(layer.y ?? 0)}" font-family="${FONT}" font-size="${size}"${weight} fill="${layer.fill ?? '#000000'}" text-anchor="${anchor}"${op}>${esc(txt)}</text>`,
      )
    } else if ((layer.type === 'slot' || layer.type === 'image') && layer.box) {
      const [x, y, w, h] = layer.box
      images.push({ layer, box: [s(x), s(y), s(w), s(h)] })
    } else {
      // 不认识的层类型：跳过，不中断。老 CLI 碰上新层类型该少画一层，不是出不了片。
      unknown.add(String(layer.type))
    }
  }

  if (unknown.size && onWarn) {
    onWarn(`模板里有本版本不认识的图层类型（${[...unknown].join(', ')}），已跳过。升级试试：npm i -g museav-cli`)
  }
  return { svg: `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`, W, H, images }
}

function run(cmd: string, args: string[]): Promise<{ code: number; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args)
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', (e) => resolve({ code: 1, err: String(e) }))
    p.on('close', (code) => resolve({ code: code ?? 1, err }))
  })
}

async function hasFfmpeg(): Promise<boolean> {
  const { code } = await run('ffmpeg', ['-version'])
  return code === 0
}

export async function makeSlideshow(opts: SlideshowOpts): Promise<{ out: string; pages: number; seconds: number }> {
  if (!opts.images.length) throw new Error('没有输入图片')
  if (!(await hasFfmpeg())) throw new Error('需要 ffmpeg（brew install ffmpeg）')

  const sharpMod = await import('sharp').catch(() => null)
  if (!sharpMod) throw new Error('sharp 不可用。重装 CLI 即可补上：npm install -g museav-cli')
  const sharp = (sharpMod as any).default ?? sharpMod

  const layout = opts.layout
  // 目标尺寸与模板 canvas 不同就整体等比缩放。取较小的比例，保证画面不被裁掉。
  const targetW = opts.width ?? layout.canvas.w
  const targetH = opts.height ?? layout.canvas.h
  const scale = Math.min(targetW / layout.canvas.w, targetH / layout.canvas.h)
  const sec = opts.seconds ?? layout.seconds ?? 2.5
  const work = await mkdtemp(join(tmpdir(), 'museav-slideshow-'))

  // sticker:// 引用逐个解析一次就够，同一个贴图在每页都用得上
  const stickerCache = new Map<string, string | null>()
  let warned = false
  const warn = (m: string) => { if (!warned) { warned = true; opts.onWarn?.(m) } }

  try {
    const pages: string[] = []
    for (let i = 0; i < opts.images.length; i++) {
      const content: PageContent = {
        title: opts.title,
        subtitle: opts.subtitle,
        caption: opts.captions?.[i],
        footer: opts.footer,
        image: opts.images[i],
      }
      const { svg, images } = buildPage(layout, content, scale, warn)
      const composites: { input: Buffer; top: number; left: number }[] = []

      for (const { layer, box } of images) {
        const [bx, by, bw, bh] = box
        let src: string | null = null

        if (layer.type === 'slot') {
          src = content.image
        } else if (layer.src?.startsWith('sticker://')) {
          const id = layer.src.slice('sticker://'.length)
          if (!stickerCache.has(id)) stickerCache.set(id, opts.resolveSticker ? await opts.resolveSticker(id) : null)
          src = stickerCache.get(id) ?? null
          if (!src) { warn(`模板引用的贴图 ${id} 取不到，已跳过该图层`); continue }
        } else {
          src = layer.src ?? null
        }
        if (!src) continue

        let pipe = sharp(src.startsWith('http') ? Buffer.from(await (await fetch(src)).arrayBuffer()) : src)
        // 贴纸类素材四周常有大片透明留白，直接放大等于把留白也放大、主体显小。
        // 只对带 alpha 的图做 —— 对不透明照片 trim 会去裁纯色边框，那不是这里想要的。
        if (layer.trim && (await pipe.metadata()).hasAlpha) {
          const buf = await pipe.toBuffer()
          pipe = sharp(buf).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
        }
        // 显式放大：fit inside + withoutEnlargement:false，小图必须撑满槽位。
        //
        // 注意 box 的语义是**矩形框 + contain**（同 CSS object-fit），不是「正方形边长」。
        // 2.9.0 那版把主图区当成正方形（resize(ART, ART)），对高瘦的图会受高度限制而偏小：
        // 219×229 的图在 518×701 的框里，旧算法出 495×518，新算法出 518×542（大 4.6%）。
        // 换成框语义是刻意的——框多大图就能占多大，这才符合直觉，也是主图偏小那个老问题的根治。
        const art = await pipe
          .resize(Math.round(bw), Math.round(bh), {
            fit: layer.fit === 'cover' ? 'cover' : 'inside',
            withoutEnlargement: false,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer({ resolveWithObject: true })
        // 在槽位内居中
        composites.push({
          input: art.data,
          top: Math.max(0, Math.round(by + (bh - art.info.height) / 2)),
          left: Math.max(0, Math.round(bx + (bw - art.info.width) / 2)),
        })
      }

      const page = join(work, `p${String(i).padStart(3, '0')}.png`)
      await sharp(Buffer.from(svg)).composite(composites).png().toFile(page)
      pages.push(page)
    }

    // concat demuxer：末页要重复列一次，否则它的 duration 会被忽略
    const listLines: string[] = []
    for (const p of pages) listLines.push(`file '${p}'`, `duration ${sec}`)
    listLines.push(`file '${pages[pages.length - 1]}'`)
    const listFile = join(work, 'list.txt')
    await writeFile(listFile, listLines.join('\n') + '\n', 'utf8')

    const total = pages.length * sec
    const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile]
    if (opts.music) args.push('-i', opts.music)
    args.push('-c:v', 'libx264', '-r', '30', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '22')
    if (opts.music) {
      const fadeOut = Math.max(0, total - 1.5)
      args.push('-af', `atrim=0:${total},afade=t=in:st=0:d=1,afade=t=out:st=${fadeOut}:d=1.5`,
        '-c:a', 'aac', '-b:a', '128k', '-shortest')
    }
    args.push(opts.out)

    const { code, err } = await run('ffmpeg', args)
    if (code !== 0) throw new Error(`ffmpeg 失败：${err.trim().slice(0, 400)}`)
    return { out: opts.out, pages: pages.length, seconds: total }
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

export async function fileSize(p: string): Promise<number> {
  try {
    return (await stat(p)).size
  } catch {
    return 0
  }
}
