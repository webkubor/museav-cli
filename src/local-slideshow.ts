/**
 * 本地图集转竖版短视频 —— slideshow 的核心实现。
 * 一组图 + 每张的文字说明 + 配乐 → 1080×1920 的 mp4，适合发朋友圈 / 视频号 / 小红书。
 *
 * 排版走 sharp 渲染 SVG（中文靠系统字体，macOS/Win/主流 Linux 都有中文字体），
 * 合成走 ffmpeg 的 concat demuxer —— 不引入 canvas 那种要编译的重依赖。
 *
 * 三个实测踩出来的点，写在这里免得下次重踩：
 *
 * 1. 图片必须显式放大。小图（如 240×240 的表情）直接贴到 1080 宽的画布上只占两成宽，
 *    画面空得离谱。要按目标尺寸等比 resize，而不是「不超过某上限」那种只缩不放的逻辑。
 * 2. 配乐不能直接 -shortest。配乐通常比视频长几倍，硬切会在中途断掉。
 *    要 atrim 裁到视频时长 + 首尾 afade。
 * 3. concat demuxer 的最后一张要再列一次，否则它的 duration 被忽略，末页一闪而过。
 */
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

export interface SlideshowOpts {
  images: string[]
  out: string
  title?: string
  subtitle?: string
  captions?: string[]
  footer?: string
  music?: string
  seconds?: number
  width?: number
  height?: number
  /** 主图渲染尺寸（正方形边长）。默认 520，约占 1080 宽的 48% */
  artSize?: number
  theme?: 'light' | 'dark'
  /** 放大前先裁掉主图四周的透明留白，默认开（仅对带 alpha 的图生效） */
  trim?: boolean
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

function fitSize(text: string, max: number, start: number, min = 24): number {
  let size = start
  while (size > min && textWidth(text, size) > max) size -= 2
  return size
}

function pageSvg(o: Required<Pick<SlideshowOpts, 'width' | 'height'>> & {
  title?: string; subtitle?: string; caption?: string; footer?: string; theme: 'light' | 'dark'
}): string {
  const { width: W, height: H, theme } = o
  const dark = theme === 'dark'
  const bg = dark ? '#16181c' : '#ffffff'
  const ink = dark ? '#e9ebef' : '#2b2d31'
  const muted = dark ? '#8b929c' : '#8c929b'
  const pink = dark ? '#3a2b33' : '#ffd6e2'
  const mint = dark ? '#22383a' : '#baebe2'

  const parts = [
    `<rect width="${W}" height="${H}" fill="${bg}"/>`,
    // 左上 / 右下两块装饰弧，位置固定，整套看起来是同一个模板
    `<ellipse cx="${W * 0.176}" cy="${-H * 0.068}" rx="${W * 0.472}" ry="${H * 0.224}" fill="${pink}"/>`,
    `<ellipse cx="${W * 1.028}" cy="${H * 0.99}" rx="${W * 0.269}" ry="${H * 0.146}" fill="${mint}"/>`,
  ]
  if (o.title) {
    const s = fitSize(o.title, W * 0.86, Math.round(W * 0.078), 36)
    parts.push(`<text x="${W / 2}" y="${H * 0.205}" font-family="${FONT}" font-size="${s}" font-weight="600" fill="${ink}" text-anchor="middle">${esc(o.title)}</text>`)
  }
  if (o.subtitle) {
    const s = Math.round(W * 0.041)
    parts.push(`<text x="${W / 2}" y="${H * 0.258}" font-family="${FONT}" font-size="${s}" fill="${muted}" text-anchor="middle">${esc(o.subtitle)}</text>`)
  }
  if (o.caption) {
    const s = fitSize(o.caption, W * 0.86, Math.round(W * 0.067), 28)
    parts.push(`<text x="${W / 2}" y="${H * 0.822}" font-family="${FONT}" font-size="${s}" font-weight="600" fill="${ink}" text-anchor="middle">${esc(o.caption)}</text>`)
  }
  if (o.footer) {
    const s = Math.round(W * 0.031)
    parts.push(`<text x="${W / 2}" y="${H * 0.925}" font-family="${FONT}" font-size="${s}" fill="${muted}" text-anchor="middle">${esc(o.footer)}</text>`)
  }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
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

  const W = opts.width ?? 1080
  const H = opts.height ?? 1920
  const ART = opts.artSize ?? 520
  const sec = opts.seconds ?? 2.5
  const theme = opts.theme ?? 'light'
  const work = await mkdtemp(join(tmpdir(), 'museav-slideshow-'))

  try {
    const pages: string[] = []
    for (let i = 0; i < opts.images.length; i++) {
      const bg = Buffer.from(pageSvg({
        width: W, height: H, theme,
        title: opts.title, subtitle: opts.subtitle,
        caption: opts.captions?.[i], footer: opts.footer,
      }))
      // 贴纸类图片四周常有大片透明留白，直接放大等于把留白也放大、主体显小。
      // 先裁到主体外接框再放大，画面才撑得住。只对带 alpha 的图做——
      // 对不透明照片 trim 会去裁纯色边框，那不是这里想要的。
      let pipe = sharp(opts.images[i])
      if (opts.trim !== false && (await pipe.metadata()).hasAlpha) {
        pipe = sharp(opts.images[i]).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
      }
      // 显式等比 resize 到 ART：小图必须放大，否则在竖屏里小得可怜
      const art = await pipe
        .resize(ART, ART, { fit: 'inside', withoutEnlargement: false, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer({ resolveWithObject: true })
      const top = Math.round(H * 0.344 + (H * 0.365 - art.info.height) / 2)
      const left = Math.round((W - art.info.width) / 2)
      const page = join(work, `p${String(i).padStart(3, '0')}.png`)
      await sharp(bg).composite([{ input: art.data, top: Math.max(0, top), left: Math.max(0, left) }]).png().toFile(page)
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
