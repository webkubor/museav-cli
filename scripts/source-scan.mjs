#!/usr/bin/env node
/**
 * 每日单文件扫描 — 选文件 + 维护进度指针
 *
 * 用途：每天从 src/ 按优先级挑 1 个源文件，输出一段 hermes 任务描述到 stdout，
 *       把审查工作交给 cs hermes run。本脚本只选文件、不做审查。
 *
 * 用法：
 *   node scripts/source-scan.mjs            推进一位，stdout 输出 hermes 任务描述
 *   node scripts/source-scan.mjs --peek     只看下一个要扫的文件，不推进指针
 *   node scripts/source-scan.mjs --reset    cursor 归 0（换轮/换策略时用）
 *
 * 配套：
 *   - 进度指针落 log/source-scan-state.json（仿 log/instances.json，.gitignore 已忽略 /log/）
 *   - crontab 10:30 调用，stdout 喂给 cs hermes run，stderr + hermes 输出落 log/source-scan.log
 *
 * 设计：每次现扫 src/ 构建有序清单，新增文件自然入队；cursor 用 % total 兜底不越界。
 *       优先级按 hooks/store/services/features/lib/components/pages/... 高价值先扫。
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const STATE_PATH = path.join(ROOT, 'log', 'source-scan-state.json')

// ── 扫描优先级（高价值先扫），每项是相对 src/ 的目录 ──────────────────────
// 依据：hooks/store/services 改动影响面最大，pages/components 量大放后面逐个磨
const PRIORITY_DIRS = [
  'hooks', 'store', 'services', 'features', 'lib',
  'components', 'pages', 'interfaces', 'types',
  'config', 'constants', 'utils',
]
const SOURCE_EXT = /\.(ts|tsx|js|jsx)$/

// ── 构建有序文件清单 ────────────────────────────────────────────────────
// 优先级目录按 PRIORITY_DIRS 顺序，每个目录内递归 + 文件名稳定排序；
// 不在优先级列表里的目录（如新增目录）按字母序追加到末尾，确保不漏。
function buildFileList() {
  const result = []
  const seen = new Set()

  for (const dir of PRIORITY_DIRS) {
    const abs = path.join(SRC, dir)
    if (!existsSync(abs)) continue
    seen.add(dir)
    collect(abs, SRC, result)
  }

  // 兜底：扫 src/ 下其它未列入的子目录
  for (const name of readdirSync(SRC).sort()) {
    const abs = path.join(SRC, name)
    if (!statSync(abs).isDirectory() || seen.has(name) || name.startsWith('.')) continue
    collect(abs, SRC, result)
  }

  return result
}

// 递归收集文件，relBase 为 src/，返回相对路径如 src/hooks/useAuth.ts
function collect(absDir, relBase, out) {
  let entries
  try {
    entries = readdirSync(absDir).sort()
  } catch {
    return
  }
  for (const name of entries) {
    const abs = path.join(absDir, name)
    let st
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      collect(abs, relBase, out)
    } else if (SOURCE_EXT.test(name)) {
      out.push(path.relative(relBase, abs))
    }
  }
}

// ── 进度指针读写 ────────────────────────────────────────────────────────
function loadState(totalFiles) {
  if (!existsSync(STATE_PATH)) {
    return { version: 1, totalFiles, cursor: 0, lastScanned: null, lastScannedAt: null, round: 1, skipped: [], updatedAt: null }
  }
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf-8'))
    s.totalFiles = totalFiles
    s.skipped = Array.isArray(s.skipped) ? s.skipped : []
    return s
  } catch {
    return { version: 1, totalFiles, cursor: 0, lastScanned: null, lastScannedAt: null, round: 1, skipped: [], updatedAt: null }
  }
}

function saveState(s) {
  s.updatedAt = new Date().toISOString()
  // 确保 log/ 目录存在（recursive 兜底，已存在不报错）
  const logDir = path.dirname(STATE_PATH)
  mkdirSync(logDir, { recursive: true })
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + '\n')
}

// ── 参数 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const peek = args.includes('--peek')
const reset = args.includes('--reset')

// ── 主流程 ──────────────────────────────────────────────────────────────
if (!existsSync(SRC)) {
  console.error(`找不到 src 目录：${SRC}（请在 modelgo-console-web 根目录下运行）`)
  process.exit(1)
}

const list = buildFileList()
const total = list.length
if (total === 0) {
  console.error('src/ 下没有可扫描的源文件')
  process.exit(1)
}

const state = loadState(total)
if (reset) {
  state.cursor = 0
  state.round = (state.round ?? 1) + 1
  state.skipped = []
  saveState(state)
  console.error(`已重置 cursor=0（第 ${state.round} 轮）`)
  process.exit(0)
}

// cursor 兜底，文件数变化也不越界
let cursor = Number.isInteger(state.cursor) ? state.cursor % total : 0

// 跳过不存在 / 已删的文件，连续跳过直到命中或回到起点
const skippedThisRun = []
let safety = total
while (safety-- > 0) {
  const rel = list[cursor]
  if (existsSync(path.join(SRC, rel))) break
  skippedThisRun.push(rel)
  cursor = (cursor + 1) % total
}

const target = list[cursor]
const targetAbs = path.join(SRC, target)
const remaining = total - cursor - 1

// 进度诊断走 stderr（落日志，不污染 stdout）
console.error(
  `[进度] 第 ${state.round} 轮 · ${cursor + 1}/${total} · 当前：${target} · 剩余 ${remaining}` +
  (skippedThisRun.length ? ` · 跳过已删 ${skippedThisRun.length} 个：${skippedThisRun.join(', ')}` : '')
)

if (peek) {
  console.error(`[peek] 下一个将扫描：${target}（未推进指针）`)
  console.log(target) // stdout 仅给文件相对路径，方便人工核对
  process.exit(0)
}

// ── hermes 任务描述（stdout） ───────────────────────────────────────────
// 固定模板，行为可复现。hermes 自己读文件、审、推飞书。
const task = [
  `审查 modelgo-console-web 的 ${target}。`,
  `依据：cs rule coding_conventions + cs rule engineering_baseline。`,
  `任务：`,
  `1. 读取文件 ${targetAbs}`,
  `2. 给 3-5 条可执行改进建议，每条标 [高/中/低] 严重度 + 具体代码位置（行号或函数名）`,
  `3. 用 cs notify 把 top3 摘要推送到 modelgo 群：cs notify "<摘要>" --from hermes --project modelgo`,
  `4. 详细建议通过 stdout 输出即可（cron 已重定向到 log/source-scan.log），无需额外写文件`,
].join('\n')

console.log(task)

// ── 推进指针 ────────────────────────────────────────────────────────────
const prevCursor = state.cursor
state.cursor = (cursor + 1) % total
state.lastScanned = target
state.lastScannedAt = new Date().toISOString()
if (state.cursor === 0) state.round = (state.round ?? 1) + 1
if (skippedThisRun.length) state.skipped = [...(state.skipped ?? []), ...skippedThisRun]
saveState(state)

console.error(`[推进] cursor ${prevCursor} → ${state.cursor}（已写入 ${path.relative(ROOT, STATE_PATH)}）`)
