/** museav slideshow —— 一组图 + 文案 + 配乐 → 竖版短视频。
 *  纯本地、免登录、不碰中台；stdout 只出产物路径，进度与统计打 stderr。
 *  排版走 sharp + SVG（中文用系统字体），合成走 ffmpeg，不引入需要编译的重依赖。 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, resolve } from 'node:path'
import { makeSlideshow, fileSize } from '../local-slideshow.js'

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

function fmtBytes(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : `${(n / 1024).toFixed(1)}KB`
}

/** 入参可以是若干张图，也可以是一个目录（目录内按文件名排序，所以图片建议带序号前缀） */
async function collectImages(paths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(p)
    let st
    try {
      st = await stat(abs)
    } catch {
      throw new Error(`路径不存在: ${p}`)
    }
    if (st.isDirectory()) {
      const names = (await readdir(abs))
        .filter((n) => !n.startsWith('.') && IMG_EXT.has(extname(n).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
      if (!names.length) throw new Error(`目录里没有图片: ${p}`)
      out.push(...names.map((n) => join(abs, n)))
    } else {
      out.push(abs)
    }
  }
  return out
}

export interface SlideshowCmdOpts {
  out?: string
  title?: string
  subtitle?: string
  footer?: string
  caption?: string[]
  captions?: string
  music?: string
  sec?: string
  size?: string
  art?: string
  theme?: string
  trim?: boolean
}

export async function slideshowCmd(paths: string[], opts: SlideshowCmdOpts): Promise<void> {
  const images = await collectImages(paths)

  let captions = opts.caption?.length ? [...opts.caption] : []
  if (opts.captions) {
    const text = await readFile(opts.captions, 'utf8').catch(() => {
      throw new Error(`文案文件读不到: ${opts.captions}`)
    })
    captions = text.split('\n').map((l) => l.trim()).filter(Boolean)
  }
  if (captions.length && captions.length < images.length) {
    process.stderr.write(`⚠️  文案 ${captions.length} 条少于图片 ${images.length} 张，后面几张不带文字\n`)
  }

  const sec = opts.sec ? Number(opts.sec) : 2.5
  if (!Number.isFinite(sec) || sec <= 0) throw new Error('--sec 必须是正数')

  let width = 1080
  let height = 1920
  if (opts.size) {
    const m = /^(\d+)[x×](\d+)$/i.exec(opts.size.trim())
    if (!m) throw new Error('--size 格式是 宽x高，如 1080x1920')
    width = Number(m[1])
    height = Number(m[2])
  }
  const artSize = opts.art ? Number(opts.art) : Math.round(width * 0.48)
  if (!Number.isFinite(artSize) || artSize < 16) throw new Error('--art 至少 16px')
  const theme = (opts.theme || 'light') as 'light' | 'dark'
  if (!['light', 'dark'].includes(theme)) throw new Error('--theme 只支持 light / dark')

  const out = opts.out ? resolve(opts.out) : resolve('slideshow.mp4')
  const total = images.length * sec
  process.stderr.write(
    `${images.length} 张 × ${sec}s ≈ ${total.toFixed(0)}s · ${width}×${height}` +
    (opts.title ? ` · 「${opts.title}」` : '') +
    (opts.music ? ' · 带配乐' : ' · 无配乐') + '\n',
  )

  const start = Date.now()
  const r = await makeSlideshow({
    images, out, width, height, artSize, seconds: sec, theme, trim: opts.trim,
    title: opts.title, subtitle: opts.subtitle, footer: opts.footer,
    captions: captions.length ? captions : undefined,
    music: opts.music ? resolve(opts.music) : undefined,
  })
  process.stderr.write(
    `✅ 视频生成完成（${r.pages} 页，${r.seconds.toFixed(1)}s，` +
    `${fmtBytes(await fileSize(out))}，用时 ${((Date.now() - start) / 1000).toFixed(1)}s）\n`,
  )
  console.log(out)
}
