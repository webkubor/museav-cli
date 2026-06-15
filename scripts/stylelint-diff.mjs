#!/usr/bin/env node
/**
 * stylelint-diff —— 只对「相对 base 新增/改动的行」上的裸值违规报错。
 * 存量（已有 133 处）永不挡路；谁新增裸 hex/字体/圆角，CI 即红。
 *
 * base 选择：MR → 目标分支；否则 argv[2] 或 origin/main。
 * 用法：node scripts/stylelint-diff.mjs [baseRef]
 */
import { execSync } from 'node:child_process'

const cwd = process.cwd()
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const tryDiffBase = () => {
  if (process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME) {
    return `origin/${process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME}`
  }
  return process.argv[2] || 'origin/main'
}
const base = tryDiffBase()
// 用 merge-base 比工作树：覆盖「已提交 + 暂存 + 未提交」自分支点以来的全部新增。
// base 不可达（本地无 origin/main）时退化为 HEAD。
let diffBase = 'HEAD'
try { diffBase = sh(`git merge-base ${base} HEAD`).trim() } catch { /* 用 HEAD */ }

// 1. 改动的 css 文件（.css 过滤放 JS，不依赖 git glob）
const files = sh(`git diff --name-only --diff-filter=ACMR ${diffBase} --`)
  .split('\n').filter((f) => f.endsWith('.css'))
if (!files.length) {
  console.log('stylelint-diff: 无改动 CSS，跳过')
  process.exit(0)
}

// 2. 每个文件的「新增行号」集合
const addedLines = (file) => {
  const diff = sh(`git diff ${diffBase} -- "${file}"`)
  const set = new Set()
  let ln = 0
  for (const line of diff.split('\n')) {
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (m) { ln = parseInt(m[1], 10); continue }
    if (line.startsWith('+') && !line.startsWith('+++')) { set.add(ln); ln++ }
    else if (!line.startsWith('-') && !line.startsWith('---')) { ln++ }
  }
  return set
}

// 3. 跑 stylelint，从混合输出里抽 JSON（stylelint 退出码非 0 时 json 可能在 stderr）
let raw = ''
try {
  raw = sh(`npx stylelint ${files.map((f) => `"${f}"`).join(' ')} -f json 2>&1`)
} catch (e) {
  raw = `${e.stdout || ''}${e.stderr || ''}`
}
const start = raw.indexOf('[')
let report = []
try { report = JSON.parse(raw.slice(start)) } catch { report = [] }

// 4. 只对新增行上的违规报错
let failed = 0
for (const f of report) {
  const rel = f.source.replace(`${cwd}/`, '')
  const added = addedLines(rel)
  for (const w of f.warnings || []) {
    if (added.has(w.line)) {
      failed++
      console.error(`✗ ${rel}:${w.line}:${w.column}  ${w.text}`)
    }
  }
}

if (failed) {
  console.error(`\n❌ ${failed} 处新增裸值违规 —— 请用设计 token（var(--mg-*/--brand-*/--radius-*/--font-*)，见 DESIGN.md）。存量不受影响。`)
  process.exit(1)
}
console.log('✅ stylelint-diff: 改动行无新增裸值违规')
