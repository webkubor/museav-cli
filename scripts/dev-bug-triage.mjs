#!/usr/bin/env node
/**
 * 开发错误半自动巡检
 *
 * 用途：扫 log/dev-errors.log，过滤预期噪声（如未登录 40101），按签名聚类，
 *       产出「待修清单 + 根因初判」。只发现、不自动修——修复仍由人把关。
 *
 * 用法：
 *   node scripts/dev-bug-triage.mjs            打印巡检报告到 stdout
 *   node scripts/dev-bug-triage.mjs --notify   报告同时经 cs notify 推送（仅在有真实问题时发）
 *   node scripts/dev-bug-triage.mjs --since 2026-06-12  只看该日期(含)之后的条目
 *   node scripts/dev-bug-triage.mjs --file <路径>       指定日志文件（默认 log/dev-errors.log）
 *
 * 设计：预期噪声规则集中在 EXPECTED_NOISE 数组，新增一类噪声只加一行。
 */

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

// cs 在交互式 shell 里是函数，execFileSync 不走 shell 会 ENOENT；
// 直接定位 CortexOS 真身二进制，cron 等非交互环境同样可用
const CS_BIN = (() => {
  const real = path.join(process.env.HOME || '', 'Documents/CortexOS/bin/cs')
  return existsSync(real) ? real : 'cs'
})()

// ── 预期噪声：命中即不计入待修清单（加一类噪声只加一行）────────────────────
const EXPECTED_NOISE = [
  { test: (e) => e.kind === 'api' && e.code === '40101', why: '未登录/会话过期 — ProtectedRoute 预期重定向，非 bug' },
]

// ── 行解析 ──────────────────────────────────────────────────────────────
// [api][failed]:    [<ts>] [api][failed] <METHOD> <path> <ms>ms code=<code> requestId=<id> page=<page> error="<msg>"
// [frontend][*]:    [<ts>] [frontend][uncaught|rejection|console] <message...>
const API_RE = /^\[(?<ts>[^\]]+)\]\s+\[api\]\[failed\]\s+(?<method>\S+)\s+(?<pathStr>\S+)\s+(?<ms>\d+)ms\s+code=(?<code>\S+).*?(?:error="(?<error>[^"]*)")?\s*$/
const FE_RE = /^\[(?<ts>[^\]]+)\]\s+\[frontend\]\[(?<sub>[a-z]+)\]\s+(?<msg>.*)$/

function parseLine(line) {
  const api = API_RE.exec(line)
  if (api) {
    const g = api.groups
    return { kind: 'api', ts: g.ts, method: g.method, pathStr: g.pathStr, code: g.code, error: g.error ?? '', raw: line }
  }
  const fe = FE_RE.exec(line)
  if (fe) {
    const g = fe.groups
    return { kind: 'frontend', ts: g.ts, sub: g.sub, msg: g.msg, raw: line }
  }
  return null
}

// 把消息里的易变片段（UUID / 长 id / 数字）抹平，让同类错误归并到一个签名
function normalize(s) {
  return (s || '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b[0-9a-z]{20,}\b/gi, '<id>')
    .replace(/\d+/g, 'N')
    .trim()
}

function signature(e) {
  if (e.kind === 'api') return `[api] ${e.method} ${normalize(e.pathStr)} code=${e.code}`
  return `[frontend][${e.sub}] ${normalize(e.msg)}`
}

// 根因初判：基于类型给一句方向性提示，不下结论
function hint(e) {
  if (e.kind === 'api') {
    const c = e.code
    if (/^4/.test(c)) return `4xx 客户端语义错误（鉴权/参数/资源），先看 ${e.pathStr} 的入参与权限`
    if (/^5/.test(c)) return `5xx 服务端错误，前端多为重试/降级缺失，需结合后端日志`
    return '业务码非 0，核对该接口的 code 约定'
  }
  if (e.sub === 'uncaught') return '未捕获异常，定位抛出栈，多为空值/类型假设'
  if (e.sub === 'rejection') return '未处理的 Promise 拒绝，补 catch 或 finally'
  return 'console 错误，按消息定位'
}

// ── 主流程 ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const doNotify = args.includes('--notify')
const sinceIdx = args.indexOf('--since')
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null
const fileIdx = args.indexOf('--file')
const LOG_PATH = path.resolve(fileIdx >= 0 ? args[fileIdx + 1] : 'log/dev-errors.log')

if (!existsSync(LOG_PATH)) {
  console.log(`无日志文件：${LOG_PATH}（本地未跑过 pnpm dev 或尚无错误落盘）`)
  process.exit(0)
}

const lines = readFileSync(LOG_PATH, 'utf-8').split('\n')
const all = []
for (const line of lines) {
  const e = parseLine(line.trimEnd())
  if (!e) continue
  if (since && e.ts.slice(0, 10) < since) continue
  all.push(e)
}

const noise = []
const real = []
for (const e of all) {
  const hit = EXPECTED_NOISE.find((r) => r.test(e))
  if (hit) noise.push({ e, why: hit.why })
  else real.push(e)
}

// 聚类
const groups = new Map()
for (const e of real) {
  const sig = signature(e)
  const g = groups.get(sig) ?? { sig, count: 0, first: e.ts, last: e.ts, sample: e }
  g.count += 1
  if (e.ts < g.first) g.first = e.ts
  if (e.ts > g.last) g.last = e.ts
  groups.set(sig, g)
}
const ranked = [...groups.values()].sort((a, b) => b.count - a.count)

// 噪声归并计数（仅汇总，不展开）
const noiseSummary = new Map()
for (const n of noise) {
  const key = n.why
  noiseSummary.set(key, (noiseSummary.get(key) ?? 0) + 1)
}

// ── 报告 ────────────────────────────────────────────────────────────────
const stamp = lines[0]?.startsWith('#') ? lines[0].replace(/^#\s*/, '') : ''
let report = `🔎 开发错误巡检 — modelgo-console-web\n`
if (stamp) report += `日志：${stamp}\n`
report += `条目：共 ${all.length}，噪声 ${noise.length}，待修 ${real.length}（${ranked.length} 类）\n`

if (ranked.length === 0) {
  report += `\n✅ 过滤预期噪声后无待修项。`
} else {
  report += `\n待修清单（按出现频次降序）：\n`
  ranked.forEach((g, i) => {
    report += `\n${i + 1}. ${g.sig}  ×${g.count}\n`
    report += `   首/末见：${g.first} → ${g.last}\n`
    report += `   初判：${hint(g.sample)}\n`
    if (g.sample.error) report += `   样本：${g.sample.error}\n`
  })
}

if (noiseSummary.size > 0) {
  report += `\n已过滤噪声：\n`
  for (const [why, n] of noiseSummary) report += `  · ${why}  ×${n}\n`
}

console.log(report)

// 仅在有真实待修项时才推送，避免无意义打扰
if (doNotify && ranked.length > 0) {
  const top = ranked.slice(0, 3).map((g) => `${g.sig}×${g.count}`).join('；')
  const msg = `🔎 巡检发现 ${real.length} 个待修错误（${ranked.length} 类）：${top}${ranked.length > 3 ? ' …' : ''}`
  try {
    execFileSync(CS_BIN, ['notify', msg, '--from', 'claude'], { stdio: 'inherit' })
  } catch (err) {
    console.error('cs notify 失败：', err.message)
    process.exit(1)
  }
} else if (doNotify) {
  console.log('\n（无待修项，跳过 cs notify）')
}
