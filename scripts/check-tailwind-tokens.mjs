#!/usr/bin/env node
/**
 * 拦「Tailwind 主题类名不存在」这一类静默失效。
 *
 * 为什么需要它：写 `text-mg-brand`、`text-mg-text-0` 这种不存在的类名，
 * **Tailwind 不报错、构建不报错、类型检查不报错** —— 只是那条声明生成不出来，
 * 颜色静默继承父级。跑起来看着"差不多对"，改动一多就再也回想不起哪里错了。
 *
 * 2026-08-25 一天内踩两次：
 *   · text-mg-brand / bg-mg-brand（正确是 brand-base）—— 22 处
 *   · text-mg-text-0（index.css 只注册了 --mg-text-1..4）—— 17 处
 * 第一次是 check-css-tokens 从 var(--mg-brand) 那一侧偶然捞到的；
 * 第二次纯靠人工比对 index.css 才发现。没有门禁就得靠运气。
 *
 * 判据：从 src/index.css 的 @theme 块抓出已注册的 --color-* 名字，
 * 反推出合法的颜色类名集合，再扫 tsx/ts 里用到的 mg-* / brand-* 颜色类。
 * 只查颜色类（text-/bg-/border-/ring-/fill-/stroke-/from-/to-/via-），
 * 尺寸间距那些走 Tailwind 内置刻度，不在此列。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = process.cwd()
const THEME_FILE = join(ROOT, 'src/index.css')
const SCAN_DIRS = ['src']
const COLOR_PREFIXES = ['text', 'bg', 'border', 'ring', 'fill', 'stroke', 'from', 'to', 'via', 'divide', 'outline', 'shadow', 'accent', 'caret', 'decoration']

/** @theme 里注册的 --color-<name> → 合法类名后缀 <name> */
function readRegisteredColors() {
  const css = readFileSync(THEME_FILE, 'utf8')
  const names = new Set()
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) names.add(m[1])
  return names
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (['.ts', '.tsx'].includes(extname(entry)) && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const registered = readRegisteredColors()
if (registered.size === 0) {
  console.error('✗ 没能从 src/index.css 的 @theme 读出任何 --color-*，判据失效，先修脚本再提交')
  process.exit(1)
}

// 只关心项目自有命名空间（mg-* / brand-*），Tailwind 内置色不管
const SELF_NS = /^(mg-|brand-)/
// 量词必须贪婪：懒惰的 `+?` 会把 text-mg-text-1 只匹成 mg-text，
// 于是全仓合法类名都被报成未注册（第一版就是这么产生 1349 处误报的）。
// 字符类不含 `/`，所以贪婪不会把 `/40` 透明度后缀吃进来。
const classRe = new RegExp(
  `\\b(?:${COLOR_PREFIXES.join('|')})-((?:mg|brand)-[a-z0-9-]+)(?:\\/\\d+)?\\b`,
  'g',
)

const problems = []
for (const file of walk(join(ROOT, SCAN_DIRS[0]))) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    // 跳过注释行，避免注释里举反例被当成违规
    const t = line.trim()
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return
    for (const m of line.matchAll(classRe)) {
      const name = m[1]
      if (!SELF_NS.test(name)) continue
      if (registered.has(name)) continue
      // 带透明度后缀的 mg-brand/40 之类，name 已去掉 /40
      problems.push({ file: file.replace(ROOT + '/', ''), line: i + 1, cls: m[0], name })
    }
  })
}

if (problems.length === 0) {
  console.log(`✅ check-tailwind-tokens: 颜色类名均已在 @theme 注册（${registered.size} 个可用）`)
  process.exit(0)
}

console.error(`\n✗ ${problems.length} 处用了未注册的 Tailwind 颜色类 —— 这类错误不报错、只是颜色静默失效：\n`)
for (const p of problems.slice(0, 40)) {
  console.error(`  ${p.file}:${p.line}  ${p.cls}`)
}
if (problems.length > 40) console.error(`  …还有 ${problems.length - 40} 处`)

const missing = [...new Set(problems.map((p) => p.name))]
console.error(`\n未注册的名字：${missing.join(', ')}`)
console.error(`\n修法：改成 @theme 里已有的名字，或在 src/index.css 的 @theme 里注册 --color-<name>。`)
console.error(`可用的自有颜色名（部分）：${[...registered].filter((n) => SELF_NS.test(n)).slice(0, 20).join(', ')}\n`)
process.exit(1)
