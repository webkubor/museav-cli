#!/usr/bin/env node
/**
 * eslint-style-diff —— 只对「相对 base 新增/改动的行」上的 inline style 裸 hex 报错。
 * 用独立配置 eslint.style-guard.config.js（不污染共享 eslint）。存量永不挡，新增即拦。
 *
 * 用法：node scripts/eslint-style-diff.mjs [baseRef]
 */
import { execSync } from 'node:child_process'

const cwd = process.cwd()
const sh = (cmd) => execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const base = process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME
  ? `origin/${process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME}`
  : process.argv[2] || 'origin/main'

let diffBase = 'HEAD'
try { diffBase = sh(`git merge-base ${base} HEAD`).trim() } catch { /* 用 HEAD */ }

// 1. 改动的 tsx 文件
const files = sh(`git diff --name-only --diff-filter=ACMR ${diffBase} --`)
  .split('\n').filter((f) => f.endsWith('.tsx'))
if (!files.length) {
  console.log('eslint-style-diff: 无改动 TSX，跳过')
  process.exit(0)
}

// 2. 每个文件的「新增行号」
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

// 3. 用独立配置跑 eslint，抽 JSON
let raw = ''
try {
  raw = sh(
    `npx eslint --no-config-lookup -c eslint.style-guard.config.js -f json ${files.map((f) => `"${f}"`).join(' ')} 2>&1`,
  )
} catch (e) {
  raw = `${e.stdout || ''}${e.stderr || ''}`
}
const start = raw.indexOf('[')
let report = []
try { report = JSON.parse(raw.slice(start)) } catch { report = [] }

// 4. 只对新增行上的违规报错
let failed = 0
for (const f of report) {
  const rel = (f.filePath || '').replace(`${cwd}/`, '')
  if (!(f.messages || []).length) continue
  const added = addedLines(rel)
  for (const msg of f.messages) {
    if (added.has(msg.line)) {
      failed++
      console.error(`✗ ${rel}:${msg.line}:${msg.column}  ${msg.message}`)
    }
  }
}

if (failed) {
  console.error(`\n❌ ${failed} 处新增 inline style 裸 hex —— 请用设计 token（见 DESIGN.md）。存量不受影响。`)
  process.exit(1)
}
console.log('✅ eslint-style-diff: 改动行无新增 inline style 裸 hex')
