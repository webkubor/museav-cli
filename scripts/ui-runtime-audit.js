/**
 * UI 运行时审计 —— 静态门禁抓不到的那一类问题，必须渲染后量。
 *
 * ui-guard / check-css-tokens 查的是源码文本，但下面这些只有在真实数据 + 真实容器宽度下
 * 才暴露，源码里一行违规都没有：
 *   · 横向滚动（收缩链断一环，整页左右滑）
 *   · 文本溢出却没有截断兜底（模型名 70 字符撑爆列）
 *   · 字号挤成一团（相邻档差 1px，肉眼分不出主次）
 *   · 浮层太透，底下的字读得出来
 *   · 同组条/柱肉眼等长（value/max 算法在窄值域下没有区分度）
 * 这几条都是 2026-09-03 模型发现页真实踩到的，不是假想。
 *
 * 用法（agent 侧）：读本文件内容，用浏览器工具在目标页执行，例如
 *   chrome-devtools 的 evaluate_script：`() => { <本文件内容>; return __uiAudit() }`
 *   或 playwright 的 browser_evaluate。
 * 页面要先加载完、数据要真实（空数据页测不出溢出）。
 *
 * 返回 { ok, issues[] }，issues 按严重度排序。ok=false 表示有 P0/P1。
 */
function __uiAudit() {
  const issues = []
  const add = (level, kind, detail, sample) => issues.push({ level, kind, detail, sample })

  /* 只统计「用户真能看见的页面文本」。首版没做这个过滤，结果 <script> / <title> /
     SVG 的 <title>（图标无障碍名）全被算进字号分布，一个 16px×47、16.2px×58 的
     假阳性差点让人去修不存在的问题（2026-09-03）。不可信的工具等于没有工具。
     SVG 内的 text/tspan 是图表刻度，自成一套尺度，也不与页面文本层级混算。 */
  const INVISIBLE_TAGS = new Set(['SCRIPT', 'STYLE', 'TITLE', 'META', 'LINK', 'HEAD', 'NOSCRIPT', 'TEMPLATE'])
  const isVisibleText = (el) => {
    if (INVISIBLE_TAGS.has(el.tagName.toUpperCase())) return false
    if (el.ownerSVGElement || el instanceof SVGElement) return false   // 图表/图标内文本另算
    if (el.closest('svg, head, [aria-hidden="true"]')) return false
    // 图标/头像/角标里的字符不是文本层级，是图形的一部分
    if (el.closest('[class*="logo"], [class*="icon"], [class*="avatar"], [class*="mark"]')) return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }

  /* ── 1. 横向滚动。收缩链（min-width:0）断一环就整页左右滑 ── */
  const de = document.documentElement
  const overflowX = de.scrollWidth - de.clientWidth
  if (overflowX > 1) {
    // 找出真正撑宽的元素：右边缘超出视口的最深层节点
    const vw = de.clientWidth
    const culprits = [...document.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > vw + 1 && !el.closest('[data-audit-ignore]')
      })
      .filter((el) => ![...el.children].some((c) => c.getBoundingClientRect().right > vw + 1))
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (right ${Math.round(el.getBoundingClientRect().right)} > ${vw})`)
    add('P0', '横向滚动', `页面横向溢出 ${overflowX}px —— 收缩链上有一环缺 min-width:0`, culprits)
  }

  /* ── 2. 文本溢出但无截断兜底 ── */
  const clipped = []
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length) continue
    if (!isVisibleText(el)) continue
    const text = (el.textContent || '').trim()
    if (text.length < 8) continue
    if (el.scrollWidth <= el.clientWidth + 1) continue
    const cs = getComputedStyle(el)
    const guarded = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none'
    const hasTitle = el.title || el.closest('[title]')
    if (!guarded && !hasTitle) clipped.push(text.slice(0, 40))
  }
  if (clipped.length) {
    add('P1', '文本溢出无兜底', `${clipped.length} 处文本超出容器，既没有截断也没有 title 悬浮`, clipped.slice(0, 6))
  }

  /* ── 3. 字号档位。相邻档差 1px 就分不出主次 ──
     **按容器分组判**：跨区域的 1px 差不构成混淆（顶栏导航 13px 与内容区 14px 各看各的），
     真正糊掉的是同一张卡片里两种只差 1px 的字号。首版全页混算，把「区块标题 16 /
     卡片标题 17」这种原型刻意的关系也报成了问题（2026-09-03）。 */
  const sizes = new Map()
  const byContainer = new Map()
  for (const el of document.querySelectorAll('*')) {
    const t = (el.textContent || '').trim()
    if (!t || el.children.length) continue
    if (!isVisibleText(el)) continue
    const fs = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10
    if (!fs) continue
    sizes.set(fs, (sizes.get(fs) || 0) + 1)
    const box = el.closest('.mg-tile, article, section, table, [class*="card"]')
    if (!box) continue
    if (!byContainer.has(box)) byContainer.set(box, new Map())
    const m = byContainer.get(box)
    m.set(fs, (m.get(fs) || 0) + 1)
  }
  const scale = [...sizes.entries()].sort((a, b) => a[0] - b[0])
  const crowdedIn = []
  for (const [box, m] of byContainer) {
    const local = [...m.entries()].sort((a, b) => a[0] - b[0])
    for (let i = 1; i < local.length; i++) {
      const [px, n] = local[i]
      const [prevPx, prevN] = local[i - 1]
      if (px - prevPx <= 1 && n >= 4 && prevN >= 4) {
        crowdedIn.push(`${prevPx}/${px}px 同处 ${box.tagName.toLowerCase()}.${String(box.className).split(' ')[0]}`)
      }
    }
  }
  if (crowdedIn.length) {
    add('P1', '字号挤档', `${crowdedIn.length} 处同一容器内出现只差 ≤1px 的两种字号 —— 肉眼分不出主次`,
      [...new Set(crowdedIn)].slice(0, 6))
  }

  /* ── 4. 浮层背景透读。玻璃/半透明浮层压不住底下的字 ── */
  const floats = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false
    const r = el.getBoundingClientRect()
    if (r.width < 80 || r.height < 40) return false
    return /popover|dropdown|menu|dialog|modal|sheet|tooltip|float/i.test(el.className + ' ' + (el.getAttribute('role') || ''))
  })
  for (const el of floats.slice(0, 8)) {
    const cs = getComputedStyle(el)
    const bg = cs.backgroundColor
    const alpha = bg.startsWith('rgba') ? parseFloat(bg.split(',')[3]) : 1
    const blur = /blur\((\d+(?:\.\d+)?)px\)/.exec(cs.backdropFilter || '')
    const blurPx = blur ? parseFloat(blur[1]) : 0
    // 经验阈值：不透明度 <0.85 且模糊 <16px 时，13px 中文的字形结构会残留
    if (alpha < 0.85 && blurPx < 16) {
      add('P1', '浮层透读', `浮层背景不透明度 ${alpha}、模糊 ${blurPx}px —— 底下的文字会透出来`,
        [String(el.className).slice(0, 60)])
    }
  }

  /* ── 5. 同组条/柱肉眼等长。窄值域下 value/max 算法的典型症状 ── */
  const groups = new Map()
  for (const el of document.querySelectorAll('[style*="width"]')) {
    const parentKey = el.parentElement?.parentElement?.className
    if (!parentKey || typeof parentKey !== 'string') continue
    const r = el.getBoundingClientRect()
    if (r.height > 14 || r.width < 20) continue
    if (!groups.has(parentKey)) groups.set(parentKey, [])
    groups.get(parentKey).push(r.width)
  }
  for (const [key, widths] of groups) {
    if (widths.length < 3) continue
    const span = Math.max(...widths) - Math.min(...widths)
    const ratio = span / Math.max(...widths)
    if (ratio < 0.12) {
      add('P2', '条长无区分度', `一组 ${widths.length} 根条首尾只差 ${Math.round(span)}px（${Math.round(ratio * 100)}%）—— 大概率用了 value/max 而非 min-max 归一化`,
        [String(key).slice(0, 50)])
    }
  }

  const order = { P0: 0, P1: 1, P2: 2 }
  issues.sort((a, b) => order[a.level] - order[b.level])
  return {
    ok: !issues.some((i) => i.level === 'P0' || i.level === 'P1'),
    viewport: `${de.clientWidth}x${de.clientHeight}`,
    fontScale: scale.map(([px, n]) => `${px}px×${n}`).join(' '),
    issues,
  }
}

// 供 Node 侧读取后注入；浏览器里直接调用 __uiAudit()
if (typeof module !== 'undefined') module.exports = { source: String(__uiAudit) }
