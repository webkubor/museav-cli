#!/usr/bin/env node
/**
 * check-css-tokens —— 校验 CSS 里 var(--xxx) 引用的自定义属性是否真的存在。
 *
 * 背景（qa 2026-07-28）：billing.css 曾写 `color: var(--mg-text-0)`，--mg-text-0
 * 这个变量根本不存在（modelgo-design-tokens 只有 --mg-text-1~4）。stylelint 的
 * declaration-strict-value 规则只检查值是否以 var(...) 开头，不检查引用的变量
 * 是否真的被定义过——这类拼写错误会静默退回浏览器初始值（通常是近黑色），
 * 在深色主题下几乎不可见，但因为不报错、不崩溃，能一路滑到 test 环境才被人肉发现。
 *
 * 做法：默认只对「相对 base 新增的行」生效（沿用 stylelint-diff.mjs 的 diff-only 思路，
 * 存量不受影响），把新增行里所有 var(--xxx) 的变量名，与「modelgo-design-tokens
 * 包 + 本仓 src 下所有 CSS 里声明过的自定义属性」全集比对，引用了不存在的变量就报错。
 * `--radix-*` 是 Radix UI 运行时注入的变量，不是设计 token，直接排除。
 *
 * 2026-07-29 用 --full 模式一次性扫过全仓，抓到了 4 处存量遗留（--mg-bg-1-rgb、
 * --mg-border-2 各两处），说明这类拼写错误不是新代码才会出，值得偶尔跑一次全量扫。
 *
 * 2026-08-13 扩到 .ts/.tsx（原先 diff 模式只 filter '.css'）：Tailwind arbitrary value
 * 里的 var() 引用 —— z-[var(--mg-z-overlay)] / rounded-[var(--mg-dialog-radius)] —— 与
 * CSS 里的 var() 失效方式完全相同，却曾整类漏检，导致 191d2dd 那批把硬编码类机械换成
 * var(...) 但变量未建的改动一路进了 test。同时挂进 vite.config 的 git.precommit 硬拦。
 *
 * 2026-09-03 增加**裸字号检查**。起因：需求方对比 PRD 原型后指出模型发现页
 * 「字体都一样大，没有主次关系」，追下去发现该页 66 处字号里 57 处挤在 9/10/11/12px，
 * 而全局字阶最小档是 --mg-text-xs(12px)——整页正文都在体系之外。
 *
 * 再追一层：字阶 token 一直都有（--mg-text-hero/h1/h2/h3/body/sm/xs），但
 * modelgo-design-tokens 的硬编码门禁只有 7 条规则（danger-hex / overlay / global-z /
 * easing / transition-duration / radius-px / shadow），**没有一条管 font-size**。
 * 圆角阴影动效从来没出过问题因为有门禁，字号处处违规因为没有——规则只在能被机器
 * 执行的地方才真正存在。全仓存量 339 处（CSS 215 + Tailwind text-[..px] 124），
 * 故走 warn 而非 block：存量不阻断提交，但新增行当场点名。
 *
 * 用法：
 *   node scripts/check-css-tokens.mjs [baseRef]   # 默认：只查改动行（含 .css/.ts/.tsx）
 *   node scripts/check-css-tokens.mjs --full       # 扫全仓存量（较慢，手动跑）
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const cwd = process.cwd()

/** 裸字号：CSS 的 `font-size: 13px` 与 Tailwind 的 `text-[13px]`。字阶走 --mg-text-* 或页面级字阶变量。 */
const RAW_FONT_SIZE_RE = /(?:font-size:\s*([0-9.]+)px|text-\[([0-9.]+)px\])/g
/** CSS 里直接写字体族字符串。字体统一走 --font-sans / --font-mono，
    否则中文回退链、CJK webfont 体积、等宽数字这三件事各页各写一套（DESIGN.md · Typography）。 */
const RAW_FONT_FAMILY_RE = /font-family:\s*(?!var\()[^;]+/g
/** 内容面用毛玻璃。DESIGN.md 定的分工：内容（卡片/面板/列表/表格）实心，
    backdrop-filter 只给浮层 chrome（顶栏/下拉/Modal/Sheet）。判据是同一条选择器块内
    既出现 .mg-tile / card / panel / table 这类内容面命名，又出现 backdrop-filter。 */
const CONTENT_GLASS_RE = /backdrop-filter/
const CONTENT_SURFACE_RE = /(mg-tile|-card\b|-panel\b|-table\b|-row\b|-list\b)/
/**
 * 简写属性重置：`font: inherit` / `all: unset` 这类。
 *
 * 危害是**静默的**：简写会把该组下所有长属性一起重置（`font:` 连带 font-size /
 * font-weight / line-height），而页面 CSS 的选择器权重（`.page-scope element`，两级）
 * 通常高于组件自带的单类（`.mg-text-body`），于是组件样式被无声击穿 —— 页面看着"就是
 * 大了一号"，但没人知道是哪来的。
 *
 * 2026-09-03 实测：模型发现页一条 `.model-discovery-page button, select, input
 * { font: inherit }` 把本页 44 个控件里 12 个的字号从 14px 击穿成继承来的 16px，
 * 需求方在「完整指标榜单」的筛选条上看出来才被发现。
 *
 * 正确写法：只重置真正需要的那个长属性 —— 原生控件不继承页面字体，写
 * `font-family: inherit`（需要的话再加 `letter-spacing: inherit`）就够，字号交给组件类。
 *
 * 确有必要时在同一行加 `/* allow-shorthand-reset *\/` 豁免，但要在注释里写清为什么。
 */
const SHORTHAND_RESET_RE = /(?:^\s*|[;{]\s*)(font|all)\s*:\s*(inherit|initial|unset|revert(?:-layer)?)\b/g
/** 豁免标记：同一行出现即跳过该行的简写检查 */
const SHORTHAND_ALLOW = 'allow-shorthand-reset'

/** 全局字阶档位，用于在提示里给出最接近的一档 */
const TEXT_SCALE = [
  ['--mg-text-xs', 12], ['--mg-text-sm', 14], ['--mg-text-body', 16],
  ['--mg-text-h3', 20], ['--mg-text-h2', 28], ['--mg-text-h1', 44],
]
const nearestScale = (px) => TEXT_SCALE.reduce((best, cur) =>
  Math.abs(cur[1] - px) < Math.abs(best[1] - px) ? cur : best)
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
/**
 * 裸色值（2026-09-18 · 1.0.7 主题色 100% token 化，owner 口径）：
 * hex / rgb() / hsl() 只许出现在——
 *   ① 自定义属性定义行（token 层 / 页面 palette 层，如 --mx-canvas-a: #EDF5FF）
 *   ② var(--x, <fallback>) 与 cssColor('--x', '<fallback>') 的 fallback 参数
 * 使用行一律 var(--xxx)。写死色值 = 明暗 × 市场（四象限）任一维度切不动；
 * AuthLayout 曾手写 isDomestic ? indigo : emerald 分支，色值还停在旧 brand——
 * 硬编码不只是「不跟随」，而是主动跟 token 漂移。
 * 豁免：数据色文件（厂商 logo 色 / 日志级别色是内容不是主题）；行内写
 * allow-raw-color 可显式豁免并需写清理由（canvas 绘制等 CSS 够不着的场景）。
 */
const RAW_HEX_RE = /#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F](?:[0-9a-fA-F]{3})?\b/g
const RAW_FUNC_COLOR_RE = /\b(?:rgba?|hsla?)\(/g
const RAW_COLOR_EXEMPT_PATH =
  /(?:\.test\.tsx?$|^src\/(?:types|services|config)\/|brand-colors\.ts$|model-format\.ts$|^src\/index\.css$|^src\/styles\/(?:tokens|brand|components|effects|auth)\.css$)/
/** 定义行（CSS 的 `--x:` 与 JS 对象键 `'--x':`，如 theme.ts 的 buildBrandPalette）：
 *  token/palette 层写色值是本职，不是违规。 */
const PROP_DEF_RE = /^\s*['"]?--[a-zA-Z0-9-]+['"]?\s*:/

/**
 * 把一个文件解析成 Map<行号, 可检查代码>：剥块注释/行注释（状态机跨行），
 * 剥 url(...) 内容（内联 SVG data URI 里的 fill="#fff" 不是主题色），
 * 剥 var()/cssColor() 的 fallback 参数（括号平衡，嵌套安全），
 * 自定义属性定义行不进 map（定义层写色值是本职）。
 */
function rawColorCheckable(file) {
  const map = new Map()
  let text = ''
  try { text = readFileSync(`${cwd}/${file}`, 'utf8') } catch { return map }
  const isCss = /\.css$/.test(file)
  let inBlock = false
  for (let i = 0; i < text.split('\n').length; i++) {
    const raw = text.split('\n')[i]
    if (raw.includes('allow-raw-color')) continue // 行级豁免（须附理由）
    if (PROP_DEF_RE.test(raw)) continue // 定义行：色值住这里
    // —— 注释剥离（状态机）——
    let code = ''
    let rest = raw
    while (rest.length) {
      if (inBlock) {
        const end = rest.indexOf('*/')
        if (end === -1) { rest = ''; break }
        rest = rest.slice(end + 2); inBlock = false
      } else {
        const blockStart = rest.indexOf('/*')
        const lineStart = isCss ? -1 : rest.indexOf('//')
        if (lineStart !== -1 && (blockStart === -1 || lineStart < blockStart)) {
          code += rest.slice(0, lineStart); break
        }
        if (blockStart === -1) { code += rest; break }
        code += rest.slice(0, blockStart)
        rest = rest.slice(blockStart + 2); inBlock = true
      }
    }
    // —— url(...) 剥离 ——
    code = code.replace(/url\([^)]*\)/g, 'url()')
    // —— 首参是 var() 的色函数不算硬编码：rgba(var(--brand-base-rgb), .55)
    //    是体系内标准模式（tokens.css 的 -rgb 分量 token 惯例）——
    code = code.replace(/\b(?:rgba?|hsla?)\(var\([^)]*\)[^)]*\)/g, 'FUNC(var)')
    // —— 首参是模板插值的不算字面值：canvas 从 token 解析出的 r/g/b 组装色值
    //    （ParticleLinesBackground 的 rgba(${r},${g},${b},1) 色源是 --brand-base）——
    code = code.replace(/\b(?:rgba?|hsla?)\(\s*\$\{[^)]*\)/g, 'FUNC(tpl)')
    // —— var()/cssColor() fallback 剥离（括号平衡）——
    let stripped = ''
    let pos = 0
    for (const m of code.matchAll(/\b(?:var|cssColor)\(/g)) {
      let depth = 1
      let k = m.index + m[0].length
      let lastComma = -1
      let d = 1
      let j = k
      while (j < code.length && d > 0) {
        if (code[j] === '(') d++
        else if (code[j] === ')') { d--; if (d === 0) break }
        else if (code[j] === ',' && d === 1 && lastComma === -1) lastComma = j
        j++
      }
      if (d !== 0) break // 未闭合（跨行 fallback 罕见），保守放弃该函数的剥离
      stripped += code.slice(pos, lastComma === -1 ? j : lastComma) + (lastComma === -1 ? '' : ')')
      pos = j
    }
    stripped += code.slice(pos)
    if (stripped.trim()) map.set(i + 1, stripped)
  }
  return map
}

const full = process.argv.includes('--full')

const tryDiffBase = () => {
  if (process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME) {
    return `origin/${process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME}`
  }
  return process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'origin/main'
}
/** 裸字号只警告不阻断：全仓 339 处存量，硬拦会瘫痪日常提交 */
const fontWarns = []
/** 其余 DESIGN.md 约束的警告（字体族、内容面毛玻璃） */
const designWarns = []
/** 简写重置是阻断级：它会静默击穿组件样式，且替代写法就在旁边，没有留存量的理由 */
const shorthandBlocks = []
/** 裸色值是阻断级（2026-09-18 起）：1.0.7 存量已清零，只拦新增。
 *  替代写法就是收进 token/palette 定义行再 var() 引用，一行的事。 */
const colorBlocks = []
let diffBase = 'HEAD'
if (!full) {
  const base = tryDiffBase()
  try { diffBase = sh(`git merge-base ${base} HEAD`).trim() } catch { /* 用 HEAD */ }
}

// 1. 收集已知自定义属性全集：modelgo-design-tokens 包 + 本仓 src 下所有 CSS 文件 +
//    TSX/TS 里通过内联 style={{ '--xxx': ... }} 动态设置的自定义属性（合法模式，
//    例如 CatalogFeatured.tsx 的 --slide-offset，不在任何 CSS 文件里声明）
const CSS_DECL_RE = /(--[a-zA-Z0-9-]+)\s*:/g
// 宽松匹配：TS/TSX 里任何被引号包住的 --xxx 字符串几乎总是内联 style 自定义属性
// 的 key（如 `['--slide-offset' as string]:`），不苛求后面立刻跟冒号
const JS_STYLE_DECL_RE = /['"](--[a-zA-Z0-9-]+)['"]/g
function collectDeclared(cssPaths, jsPaths) {
  const set = new Set()
  for (const p of cssPaths) {
    let text = ''
    try { text = readFileSync(p, 'utf8') } catch { continue }
    for (const m of text.matchAll(CSS_DECL_RE)) set.add(m[1])
  }
  for (const p of jsPaths) {
    let text = ''
    try { text = readFileSync(p, 'utf8') } catch { continue }
    for (const m of text.matchAll(JS_STYLE_DECL_RE)) set.add(m[1])
  }
  return set
}

let cssFiles = []
let jsFiles = []
try {
  cssFiles = sh(`git ls-files "src/**/*.css"`).split('\n').filter(Boolean)
  jsFiles = sh(`git ls-files "src/**/*.ts" "src/**/*.tsx"`).split('\n').filter(Boolean)
} catch { /* 忽略 */ }

const declared = collectDeclared(
  ['node_modules/modelgo-design-tokens/tokens.css', ...cssFiles],
  jsFiles,
)

if (declared.size === 0) {
  console.log('check-css-tokens: 未找到任何 token 声明文件，跳过（可能是首次拉包未完成）')
  process.exit(0)
}

const VAR_RE = /var\(\s*(--[a-zA-Z0-9-]+)/g
let failed = 0

if (full) {
  // --full：扫全仓 css + js/tsx 里所有 var(--xxx)，不分新旧
  for (const file of [...cssFiles, ...jsFiles]) {
    const text = readFileSync(file, 'utf8')
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(VAR_RE)) {
        const name = m[1]
        if (name.startsWith('--radix-')) continue
        if (!declared.has(name)) {
          failed++
          console.error(`✗ ${file}:${i + 1}  引用了未声明的变量 var(${name})`)
        }
      }
    })
    if (!RAW_COLOR_EXEMPT_PATH.test(file)) {
      for (const [lineNo, code] of rawColorCheckable(file)) {
        const hits = [...code.matchAll(RAW_HEX_RE)].length + [...code.matchAll(RAW_FUNC_COLOR_RE)].length
        if (hits) {
          colorBlocks.push(`✗ ${file}:${lineNo}  裸色值 ×${hits} —— 色值只许住在自定义属性定义行（token/palette 层）或 var()/cssColor() 的 fallback 里，使用行一律 var(--xxx)`)
        }
      }
    }
  }
} else {
  // 默认：只查相对 base 新增的行（与 stylelint-diff.mjs 同一套逻辑）
  // ⚠️ 必须同时覆盖 .ts/.tsx：token 引用不只写在 CSS 里，Tailwind 的 arbitrary value
  // （z-[var(--mg-z-overlay)]、rounded-[var(--mg-dialog-radius)]、gap-[var(--mg-dialog-gap)]）
  // 同样是 var() 引用，失效方式完全一样。2026-08-12 的线上事故就出在这个缺口上：
  // 191d2dd 在 24 个 .tsx 里把硬编码 Tailwind 类批量换成 var(...)，其中 7 个变量根本没建，
  // 而当时本函数只 filter('.css') → 门禁全程放行，缺陷直达 test（0e6cb10 事后补的变量）。
  const files = sh(`git diff --name-only --diff-filter=ACMR ${diffBase} --`)
    .split('\n')
    .filter((f) => /\.(css|tsx?)$/.test(f))
  if (!files.length) {
    console.log('check-css-tokens: 无改动 CSS/TS(X)，跳过')
    process.exit(0)
  }

  const addedLinesWithText = (file) => {
    const diff = sh(`git diff ${diffBase} -- "${file}"`)
    const map = new Map()
    let ln = 0
    for (const line of diff.split('\n')) {
      const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) { ln = parseInt(m[1], 10); continue }
      if (line.startsWith('+') && !line.startsWith('+++')) { map.set(ln, line.slice(1)); ln++ }
      else if (!line.startsWith('-') && !line.startsWith('---')) { ln++ }
    }
    return map
  }

  for (const file of files) {
    const added = addedLinesWithText(file)
    // 裸色值按行检查需要注释上下文（跨行块注释状态机），整文件预计算一次
    const rawColorLines = RAW_COLOR_EXEMPT_PATH.test(file) ? new Map() : rawColorCheckable(file)
    // 内容面毛玻璃要看「整个选择器块」，不能逐行判断：选择器和 backdrop-filter 分处两行。
    // 只在块内两者同时出现、且该块有改动行时才报。
    if (/\.css$/.test(file) && added.size) {
      for (const blk of readFileSync(`${cwd}/${file}`, 'utf8').split('}')) {
        const brace = blk.indexOf('{')
        if (brace < 0) continue
        const selector = blk.slice(0, brace)
        const body = blk.slice(brace)
        if (!CONTENT_GLASS_RE.test(body) || !CONTENT_SURFACE_RE.test(selector)) continue
        // 浮层命名（popover/dropdown/modal/sheet/tooltip/header）本就允许毛玻璃
        // 浮层命名本就允许玻璃；.mg-tile 是 DESIGN.md 写明的唯一内容面例外
        // （表面已并入玻璃系统，见 components.css 里那段注释）
        if (/(popover|dropdown|modal|dialog|sheet|tooltip|float|header|overlay)/i.test(selector)) continue
        if (/\.mg-tile\b/.test(selector)) continue
        designWarns.push(
          `⚠ ${file}  内容面 \`${selector.trim().split('\n').pop().slice(0, 48)}\` 用了 backdrop-filter —— ` +
          `内容（卡片/面板/列表/表格）实心，毛玻璃只给浮层 chrome（DESIGN.md · Don'ts）`
        )
      }
    }
    for (const [lineNo, text] of added) {
      for (const m of text.matchAll(VAR_RE)) {
        const name = m[1]
        if (name.startsWith('--radix-')) continue
        if (!declared.has(name)) {
          failed++
          console.error(`✗ ${file}:${lineNo}  引用了未声明的变量 var(${name})`)
        }
      }
      if (/\.(css)$/.test(file) && !text.includes(SHORTHAND_ALLOW)) {
        for (const m of text.matchAll(SHORTHAND_RESET_RE)) {
          shorthandBlocks.push(
            `✗ ${file}:${lineNo}  \`${m[1]}: ${m[2]}\` 是简写重置 —— 它会连带重置该组所有长属性` +
            `（\`font:\` 还会带走 font-size / font-weight / line-height），而页面选择器权重高于` +
            `组件自带的单类，会静默击穿组件样式。只重置需要的那一个长属性（如 font-family: inherit）。`
          )
        }
      }
      if (/\.(css)$/.test(file)) {
        for (const m of text.matchAll(RAW_FONT_FAMILY_RE)) {
          if (/inherit|initial|unset/.test(m[0])) continue
          designWarns.push(
            `⚠ ${file}:${lineNo}  直接写了字体族 —— 走 var(--font-sans) / var(--font-mono)，` +
            `否则中文回退链和等宽数字各页各写一套（DESIGN.md · Typography）`
          )
        }
      }
      for (const m of text.matchAll(RAW_FONT_SIZE_RE)) {
        const px = parseFloat(m[1] ?? m[2])
        const [token, tokenPx] = nearestScale(px)
        fontWarns.push(
          `⚠ ${file}:${lineNo}  裸字号 ${px}px —— 走字阶 token（最近的一档是 ${token} = ${tokenPx}px），` +
          `或页面级字阶变量。字号不成档位就没有主次关系。`
        )
      }
      const rc = rawColorLines.get(lineNo)
      if (rc) {
        const hits = [...rc.matchAll(RAW_HEX_RE)].length + [...rc.matchAll(RAW_FUNC_COLOR_RE)].length
        if (hits) {
          colorBlocks.push(
            `✗ ${file}:${lineNo}  裸色值 ×${hits} —— 色值收进自定义属性定义行（token/palette）再 var() 引用；` +
            `canvas 等 CSS 够不着的场景行内写 allow-raw-color 并注明理由`
          )
        }
      }
    }
  }
}

if (designWarns.length) {
  console.warn(`\n⚠️  ${designWarns.length} 处新增代码与 DESIGN.md 约束不符：`)
  for (const w of designWarns.slice(0, 15)) console.warn('   ' + w)
  if (designWarns.length > 15) console.warn(`   …… 另 ${designWarns.length - 15} 处`)
}

if (fontWarns.length) {
  console.warn(`\n⚠️  ${fontWarns.length} 处新增裸字号（不阻断提交，但请收进字阶）：`)
  for (const w of fontWarns.slice(0, 20)) console.warn('   ' + w)
  if (fontWarns.length > 20) console.warn(`   …… 另 ${fontWarns.length - 20} 处`)
}

if (shorthandBlocks.length) {
  console.error(`\n❌ ${shorthandBlocks.length} 处简写属性重置 —— 会静默击穿组件样式，必须改掉：`)
  for (const b of shorthandBlocks) console.error('   ' + b)
  console.error('   确有必要时在同一行加 /* allow-shorthand-reset */ 豁免，并写清为什么。')
  process.exit(1)
}

if (colorBlocks.length) {
  console.error(`\n❌ ${colorBlocks.length} 处裸色值 —— 色值只许住在定义行（token/palette 层）或 fallback 里，使用行一律 var(--xxx)：`)
  for (const b of colorBlocks.slice(0, 400)) console.error('   ' + b)
  if (colorBlocks.length > 400) console.error(`   …… 另 ${colorBlocks.length - 400} 处`)
  process.exit(1)
}

if (failed) {
  console.error(`\n❌ ${failed} 处${full ? '' : '新增代码'}引用了不存在的 CSS 自定义属性 —— 检查变量名是否拼错，或该 token 是否已在 modelgo-design-tokens / src/styles/tokens.css 中定义。`)
  process.exit(1)
}
console.log(`✅ check-css-tokens: ${full ? '全仓' : '改动行'}引用的 var(--xxx) 均已声明`)
