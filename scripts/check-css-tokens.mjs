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
 * 用法：
 *   node scripts/check-css-tokens.mjs [baseRef]   # 默认：只查改动行
 *   node scripts/check-css-tokens.mjs --full       # 扫全仓存量（较慢，手动跑）
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const cwd = process.cwd()
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const full = process.argv.includes('--full')

const tryDiffBase = () => {
  if (process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME) {
    return `origin/${process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME}`
  }
  return process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'origin/main'
}
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
  }
} else {
  // 默认：只查相对 base 新增的行（与 stylelint-diff.mjs 同一套逻辑）
  const files = sh(`git diff --name-only --diff-filter=ACMR ${diffBase} --`)
    .split('\n').filter((f) => f.endsWith('.css'))
  if (!files.length) {
    console.log('check-css-tokens: 无改动 CSS，跳过')
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
    for (const [lineNo, text] of added) {
      for (const m of text.matchAll(VAR_RE)) {
        const name = m[1]
        if (name.startsWith('--radix-')) continue
        if (!declared.has(name)) {
          failed++
          console.error(`✗ ${file}:${lineNo}  引用了未声明的变量 var(${name})`)
        }
      }
    }
  }
}

if (failed) {
  console.error(`\n❌ ${failed} 处${full ? '' : '新增代码'}引用了不存在的 CSS 自定义属性 —— 检查变量名是否拼错，或该 token 是否已在 modelgo-design-tokens / src/styles/tokens.css 中定义。`)
  process.exit(1)
}
console.log(`✅ check-css-tokens: ${full ? '全仓' : '改动行'}引用的 var(--xxx) 均已声明`)
