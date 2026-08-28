/** museav slideshow —— 一组图 + 文案 + 配乐 → 竖版短视频。
 *  纯本地渲染、不上传任何图片；stdout 只出产物路径，进度与统计打 stderr。
 *
 *  版面来自排版模板：不给 --layout 用内置的（**完全免登录、不碰网络**），
 *  给了就去中台 slideshow_layouts 拉。免登录这条路必须一直留着——
 *  秒级出片、零成本是这个命令的立身之本，不能因为接了模板库就没了。 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, resolve } from 'node:path'
import { makeSlideshow, fileSize, type Layout } from '../local-slideshow.js'
import { PRESETS, PRESET_LIGHT, PRESET_DARK } from '../slideshow-presets.js'
import { loadConfig } from '../config.js'
import { StudioClient } from '../client.js'

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

/** 按需建 client：只有真要拉中台模板时才需要凭证，没有 --layout 就一路不碰网络 */
function studioClient(): StudioClient {
  const cfg = loadConfig()
  if (!cfg.token && !cfg.apiKey) {
    throw new Error('拉中台排版模板需要登录：museav login（或配 apiKey）。\n不想登录就别传 --layout，内置版式免登录可用')
  }
  return new StudioClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, token: cfg.token })
}

async function loadLayout(opts: SlideshowCmdOpts): Promise<{ layout: Layout; label: string; client?: StudioClient }> {
  if (opts.layoutFile) {
    const raw = await readFile(opts.layoutFile, 'utf8').catch(() => {
      throw new Error(`排版模板文件读不到: ${opts.layoutFile}`)
    })
    try {
      return { layout: JSON.parse(raw) as Layout, label: `文件 ${opts.layoutFile}` }
    } catch (e) {
      throw new Error(`排版模板不是合法 JSON: ${(e as Error).message}`)
    }
  }

  if (opts.layout) {
    // 内置的同名模板优先命中，省一次网络往返；不在内置里才去中台拉
    const builtin = PRESETS[opts.layout]
    if (builtin) return { layout: builtin, label: `内置 ${opts.layout}` }
    const client = studioClient()
    const row = await client.slideshowLayout(opts.layout)
    if (!row?.layout) throw new Error(`模板 ${opts.layout} 没有 layout 内容`)
    return { layout: row.layout as Layout, label: `中台 ${row.name}（${row.slug}）`, client }
  }

  const dark = (opts.theme || 'light') === 'dark'
  return { layout: dark ? PRESET_DARK : PRESET_LIGHT, label: dark ? '内置深色' : '内置默认' }
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
  theme?: string
  layout?: string
  layoutFile?: string
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

  const { layout, label, client } = await loadLayout(opts)

  const sec = opts.sec ? Number(opts.sec) : undefined
  if (opts.sec && (!Number.isFinite(sec) || (sec as number) <= 0)) throw new Error('--sec 必须是正数')

  let width: number | undefined
  let height: number | undefined
  if (opts.size) {
    const m = /^(\d+)[x×](\d+)$/i.exec(opts.size.trim())
    if (!m) throw new Error('--size 格式是 宽x高，如 1080x1920')
    width = Number(m[1])
    height = Number(m[2])
  }

  const out = opts.out ? resolve(opts.out) : resolve('slideshow.mp4')
  const effSec = sec ?? layout.seconds ?? 2.5
  const w = width ?? layout.canvas.w
  const h = height ?? layout.canvas.h
  process.stderr.write(
    `${images.length} 张 × ${effSec}s ≈ ${(images.length * effSec).toFixed(0)}s · ${w}×${h} · 版式：${label}` +
    (opts.title ? ` · 「${opts.title}」` : '') +
    (opts.music ? ' · 带配乐' : ' · 无配乐') + '\n',
  )

  // 贴图只在模板真的引用了 sticker:// 时才去拉，且整轮只拉一次清单
  let stickerUrls: Map<string, string> | null = null
  const resolveSticker = async (id: string): Promise<string | null> => {
    if (!stickerUrls) {
      const c = client ?? studioClient()
      const rows = await c.stickers().catch(() => [])
      stickerUrls = new Map(rows.filter((r: any) => r?.id && r?.url).map((r: any) => [r.id, r.url]))
    }
    return stickerUrls.get(id) ?? null
  }

  const start = Date.now()
  const r = await makeSlideshow({
    images, out, layout, width, height, seconds: sec,
    title: opts.title, subtitle: opts.subtitle, footer: opts.footer,
    captions: captions.length ? captions : undefined,
    music: opts.music ? resolve(opts.music) : undefined,
    resolveSticker,
    onWarn: (m) => process.stderr.write(`⚠️  ${m}\n`),
  })
  process.stderr.write(
    `✅ 视频生成完成（${r.pages} 页，${r.seconds.toFixed(1)}s，` +
    `${fmtBytes(await fileSize(out))}，用时 ${((Date.now() - start) / 1000).toFixed(1)}s）\n`,
  )
  console.log(out)
}

/** museav slideshow-layouts —— 列出可用排版模板（内置 + 中台） */
export async function slideshowLayoutsCmd(): Promise<void> {
  process.stderr.write('内置版式（免登录可用）:\n')
  for (const slug of Object.keys(PRESETS)) {
    process.stderr.write(`  ${slug.padEnd(28)} ${PRESETS[slug].canvas.w}×${PRESETS[slug].canvas.h}\n`)
  }

  let rows: any[] = []
  try {
    rows = await studioClient().slideshowLayouts()
  } catch (e) {
    // 没登录不算错：内置版式已经列出来了，这条命令仍然有用
    process.stderr.write(`\n（中台模板未列出：${(e as Error).message.split('\n')[0]}）\n`)
    console.log(Object.keys(PRESETS).join('\n'))
    return
  }

  if (rows.length) {
    process.stderr.write(`\n中台模板（${rows.length} 个）:\n`)
    for (const r of rows) {
      const src = r.source === 'platform' ? '[平台]' : r.source === 'mine' ? '[租户]' : '[私有]'
      const size = r.layout?.canvas ? `${r.layout.canvas.w}×${r.layout.canvas.h}` : ''
      process.stderr.write(`  ${String(r.slug).padEnd(28)} ${String(r.name).padEnd(20)} ${size.padEnd(10)} ${src}\n`)
    }
  } else {
    process.stderr.write('\n中台还没有模板。用 museav slideshow-layouts create 建一个。\n')
  }
  process.stderr.write('\n出片: museav slideshow ./图片目录 --layout <slug>\n')
  console.log([...Object.keys(PRESETS), ...rows.map((r) => r.slug)].join('\n'))
}

/** museav slideshow-layouts create —— 从 JSON 文件建一个排版模板 */
export async function createSlideshowLayoutCmd(file: string, opts: { name: string; slug: string; description?: string; category?: string }): Promise<void> {
  const raw = await readFile(file, 'utf8').catch(() => {
    throw new Error(`读不到文件: ${file}`)
  })
  let layout: unknown
  try {
    layout = JSON.parse(raw)
  } catch (e) {
    throw new Error(`不是合法 JSON: ${(e as Error).message}`)
  }

  const row = await studioClient().createSlideshowLayout({
    name: opts.name, slug: opts.slug, layout,
    description: opts.description, category: opts.category,
  })
  process.stderr.write(`✅ 排版模板已建：${row.name}（${row.slug}）\n`)
  process.stderr.write(`归属：${row.visibility === 'private' ? '仅本人可见' : row.tenant_id ? '本租户共享' : '平台共享'}\n`)
  process.stderr.write(`\n出片: museav slideshow ./图片目录 --layout ${row.slug}\n`)
  console.log(row.id)
}
