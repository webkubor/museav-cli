#!/usr/bin/env node
/**
 * 生成 src/components/ui/COMPONENTS.md —— 「本仓有哪些现成组件」的清单。
 *
 * 为什么要有：CLAUDE.md 的组件铁律教的是**怎么用**（主操作走 Button、卡片走 .mg-tile…），
 * 但没有一份**有什么**的清单。结果 agent 反复手写已经存在的东西——2026-09-08 就是
 * 自己拿 <i> + scaleX 造了个进度条，而 ui/ProgressBar 早有 `flow` 流光；同一天还差点
 * 重写 tooltip 表面，而 .mg-float 早在。
 *
 * 为什么自动生成：手写清单会过时，过时的清单比没有更坏（照着它做反而错）。
 * 这里从源码提取，pre-commit 校验，改了组件不更新清单就会被拦。
 *
 * 提取三样：组件名 / 一行用途（组件上方 JSDoc 首句）/ 带注释的 props（那些通常
 * 就是"藏起来的能力"，比如 ProgressBar 的 flow、Table 的 align）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'

const UI_DIR = 'src/components/ui'
const OUT = join(UI_DIR, 'COMPONENTS.md')

/** 取 JSDoc 里的第一句人话（去掉标签行、@param 之类） */
function firstSentence(block) {
  if (!block) return ''
  const lines = block
    .split('\n')
    .map((l) => l.replace(/^\s*\/?\*+\/?/, '').trim())
    .filter((l) => l && !l.startsWith('@'))
  const text = lines.join(' ').trim()
  if (!text) return ''
  const m = text.match(/^(.{1,110}?)(?:[。.；;]|$)/)
  return (m ? m[1] : text.slice(0, 110)).trim()
}

/** 组件名 -> 上方紧邻的 JSDoc */
function exportedComponents(src) {
  const out = []
  const re = /(\/\*\*[\s\S]*?\*\/)?\s*export\s+(?:const|function)\s+([A-Z][A-Za-z0-9_]*)/g
  let m
  while ((m = re.exec(src))) out.push({ name: m[2], doc: firstSentence(m[1]) })
  return out
}

/** 带 JSDoc 的 props（藏起来的能力都在这里） */
function documentedProps(src) {
  const out = []
  const re = /\/\*\*\s*([^*]+?)\s*\*\/\s*\n\s*([a-zA-Z][A-Za-z0-9_]*)\??\s*[?:]/g
  let m
  while ((m = re.exec(src))) {
    const desc = m[1].replace(/\s+/g, ' ').trim()
    if (desc && m[2] && !out.some((p) => p.name === m[2])) out.push({ name: m[2], desc })
  }
  return out
}

/** 联合类型的可选值，如 variant?: "brand" | "rainbow" */
function unionProps(src) {
  const out = []
  const re = /^\s*(\w+)\??:\s*((?:"[^"]+"\s*\|\s*)+"[^"]+")/gm
  let m
  while ((m = re.exec(src))) {
    const values = m[2].match(/"[^"]+"/g).map((v) => v.replace(/"/g, ''))
    if (!out.some((p) => p.name === m[1])) out.push({ name: m[1], values })
  }
  return out
}

const files = readdirSync(UI_DIR)
  .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
  .sort()

const rows = []
for (const f of files) {
  const src = readFileSync(join(UI_DIR, f), 'utf8')
  const comps = exportedComponents(src)
  if (!comps.length) continue
  const main = comps.find((c) => c.name === basename(f, '.tsx')) ?? comps[0]
  const others = comps.filter((c) => c.name !== main.name).map((c) => c.name)
  rows.push({
    file: f,
    name: main.name,
    doc: main.doc || comps.map((c) => c.doc).find(Boolean) || '',
    others,
    props: documentedProps(src),
    unions: unionProps(src),
  })
}

const lines = [
  '<!-- 本文件由 scripts/gen-ui-inventory.mjs 生成，别手改：`node scripts/gen-ui-inventory.mjs` -->',
  '',
  '# 现成组件清单（src/components/ui）',
  '',
  '**写任何 UI 前先在这里搜一遍。** 手写一个已经存在的组件，比写得丑更糟：',
  '样式会分叉、主题会漏一套、无障碍会缺、下次改规范时改不到你这份。',
  '',
  '搜的时候用**能力词**而不是组件名 —— 你要的东西常常是某个组件的一个 prop：',
  '想要「进度条流光」搜 `流光`（是 `ProgressBar` 的 `flow`），想要「毛玻璃浮层」搜 `玻璃`。',
  '组件之外还有两类现成资产：CSS 工具类（`.mg-tile` 卡片 / `.mg-float` 浮层玻璃，见 `src/styles/components.css`）',
  '和设计 token（`modelgo-design-tokens` + `src/styles/tokens.css`）。',
  '',
  `共 ${rows.length} 个组件文件。`,
  '',
]

for (const r of rows) {
  lines.push(`## ${r.name}`)
  lines.push('')
  lines.push(`\`${UI_DIR}/${r.file}\``)
  if (r.doc) lines.push(`\n${r.doc}`)
  if (r.others.length) lines.push(`\n同文件还导出：${r.others.map((o) => `\`${o}\``).join(' · ')}`)
  if (r.unions.length) {
    lines.push('\n可选值：')
    for (const u of r.unions) lines.push(`- \`${u.name}\`: ${u.values.map((v) => `\`${v}\``).join(' | ')}`)
  }
  if (r.props.length) {
    lines.push('\n值得知道的 props：')
    for (const p of r.props) lines.push(`- \`${p.name}\` — ${p.desc}`)
  }
  lines.push('')
}

writeFileSync(OUT, lines.join('\n'))
console.log(`✅ ${OUT} — ${rows.length} 个组件`)
