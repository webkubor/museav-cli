#!/usr/bin/env node
/**
 * 双域 robots.txt / llms.txt 体检脚本（owner 2026-09-04 加）。
 *
 * 检查 console.modelgo.com / console.modelgo.ai 两个域：
 *   · robots.txt 是否存在、是否返回 text/plain（不是 HTML/SPA 兜底）
 *   · llms.txt 同上
 *   · robots.txt 是否给 AI 训练型爬虫(GPTBot/anthropic-ai/Google-Extended/CCBot/Meta-ExternalAgent)加 Disallow
 *   · robots.txt 是否留了公开页（至少 /models 应在白名单里）
 *   · llms.txt 是否是 Markdown 文本（以 # 开头、含 [..](...) 链接）
 *
 * 命中 P0（404 或 SPA 兜底）退 1；P1（缺关键 UA 屏蔽）退 1；warning 不阻断。
 *
 * 借用 scorecard 的解析思路（allow 优先 / 单 UA 段不再继承 * 段），但不做 GitHub 仓库级
 * 评分——这里只测自己家域名。
 *
 * 用法：
 *   node scripts/check-crawl-files.mjs                       # 双域（默认 console.modelgo.com + console.modelgo.ai）
 *   node scripts/check-crawl-files.mjs --site china           # 单域
 *   node scripts/check-crawl-files.mjs --json                # JSON 输出，给 CI 用
 *   node scripts/check-crawl-files.mjs --base http://localhost:5176  # 自定义基址（dev 环境）
 */

import { argv, env, exit, stdout } from 'node:process'

const args = argv.slice(2)
let onlySite = null
let jsonOut = false
let baseOverride = null
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--site') onlySite = args[++i]
  else if (args[i] === '--json') jsonOut = true
  else if (args[i] === '--base') baseOverride = args[++i]
  else if (args[i] === '-h' || args[i] === '--help') {
    stdout.write('用法见脚本头注释\n')
    exit(0)
  }
}

// 从 .env.production 取实际生产域名
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const envFile = resolve(ROOT, '.env.production')
if (!existsSync(envFile)) {
  stderr(`✗ 找不到 ${envFile}`)
  exit(1)
}
const envLines = readFileSync(envFile, 'utf8').split(/\r?\n/)
const envMap = {}
for (const line of envLines) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) envMap[m[1]] = m[2]
}

const sites = {
  china: baseOverride || envMap.VITE_DOMESTIC_CONSOLE || 'https://console.modelgo.com',
  global: baseOverride || envMap.VITE_GLOBAL_CONSOLE || 'https://console.modelgo.ai',
}

// 关键 AI 训练型爬虫（参考 scorecard/server/audit.js 的 AI_CRAWLER_UAS，但更全）
const TRAINING_BOTS = [
  'gptbot', 'chatgpt-user', 'anthropic-ai', 'claudebot', 'claude-web',
  'google-extended', 'ccbot', 'meta-externalagent', 'perplexitybot',
]
// 检索型爬虫（应当放行）
const RETRIEVAL_BOTS = ['oai-searchbot', 'chatgpt-user', 'perplexitybot', 'claude-searchbot']

function stderr(s) {
  if (!jsonOut) process.stderr.write(s + '\n')
}

async function fetchText(url, timeoutMs = 10000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'modelgo-crawl-check/1.0' } })
    const ct = res.headers.get('content-type') || ''
    const body = await res.text()
    return { status: res.status, contentType: ct, body }
  } catch (e) {
    return { status: 0, contentType: '', body: '', error: String(e.message || e) }
  } finally {
    clearTimeout(t)
  }
}

// 解析 robots.txt，按 User-agent 分组（与 scorecard/server/audit.js 的逻辑同源）
function parseRobots(text) {
  const groups = new Map() // ua(lowercase) -> [{key, val}]
  let current = null
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(/^\s*(user-agent|disallow|allow|sitemap)\s*:\s*(.*?)\s*$/i)
    if (!m) continue
    const [, key, val] = m
    const k = key.toLowerCase()
    if (k === 'user-agent') {
      current = val.toLowerCase()
      if (!groups.has(current)) groups.set(current, [])
      // 注：连续 UA 行（不带规则）会合并到同一组，常见于声明「同规则覆盖多 bot」
    } else if (current) {
      groups.get(current).push({ key: k, val: val.trim() })
    }
  }
  return groups
}

function isBlocked(groups, bot) {
  const own = groups.get(bot)
  const rules = (own && own.length) ? own : (groups.get('*') || [])
  // Allow: / 是最宽的放行，压过任何 Disallow
  if (rules.some(r => r.key === 'allow' && r.val === '/')) return false
  // 有任何非空 Disallow 即视为屏蔽
  return rules.some(r => r.key === 'disallow' && r.val !== '')
}

function isAllowed(groups, path) {
  // 检查 path 是否被任何组显式 Allow: <path> 放行（最简：通配 /models 时 Allow: /models 命中）
  const all = [...groups.values()].flat()
  const allows = all.filter(r => r.key === 'allow').map(r => r.val)
  return allows.some(p => path === p || path.startsWith(p + '/') || p === '/')
}

async function checkSite(market, base) {
  const findings = []
  const robotsUrl = `${base.replace(/\/$/, '')}/robots.txt`
  const llmsUrl = `${base.replace(/\/$/, '')}/llms.txt`
  const sitemapUrl = `${base.replace(/\/$/, '')}/sitemap.xml`

  // ── robots.txt ──
  const r = await fetchText(robotsUrl)
  if (r.status !== 200) {
    findings.push({ level: 'P0', kind: 'robots 缺失', detail: `${robotsUrl} 返回 HTTP ${r.status}`, sample: r.error || '' })
  } else if (/text\/html/i.test(r.contentType)) {
    findings.push({ level: 'P0', kind: 'robots 被 SPA 兜底', detail: `${robotsUrl} 返回了 HTML（content-type: ${r.contentType}）—— 站点所有路径被前端 SPA 接管，没放过任何路径`, sample: r.body.slice(0, 80) })
  } else if (!/^user-agent\s*:/im.test(r.body)) {
    findings.push({ level: 'P1', kind: 'robots 不规范', detail: `${robotsUrl} 不是有效的 robots.txt（找不到 User-agent 行）`, sample: r.body.slice(0, 80) })
  } else {
    const groups = parseRobots(r.body)
    // 1) AI 训练型爬虫必须 Disallow
    const missing = TRAINING_BOTS.filter(b => !isBlocked(groups, b))
    if (missing.length) {
      findings.push({ level: 'P1', kind: 'AI 训练爬虫未屏蔽', detail: `robots.txt 没屏蔽这些 AI 训练型爬虫: ${missing.join(', ')}`, sample: '' })
    }
    // 2) 至少放行 /models（控制台对外公开的入口）
    if (!isAllowed(groups, '/models')) {
      findings.push({ level: 'P1', kind: '缺 /models 白名单', detail: `robots.txt 没显式 Allow: /models——模型广场是公开页，应放行`, sample: '' })
    }
    // 3) /api/ 应被抓不到。两种写法都算数：
    //    ① 白名单式（Disallow: / 打底 + Allow 例外）—— 默认全禁，/api/ 自然在内；
    //    ② 逐条式：显式 Disallow: /api/。
    //    第一版只认 ②，把本仓白名单式 robots.txt 误报成「未屏蔽」（2026-09-04 修）。
    const starRules = groups.get('*') || []
    const whitelistStyle = starRules.some(r => r.key === 'disallow' && r.val === '/')
    const apiExplicit = [...groups.values()].flat().some(r => r.key === 'disallow' && r.val.startsWith('/api'))
    if (!whitelistStyle && !apiExplicit) {
      findings.push({ level: 'WARN', kind: '/api/ 未屏蔽', detail: `robots.txt 既没有 Disallow: / 打底，也没显式 Disallow /api/——后端接口可能被公开抓取`, sample: '' })
    }
  }

  const sitemapDirectives = [...r.body.matchAll(/^\s*Sitemap\s*:\s*(\S+)\s*$/gim)].map((match) => match[1])
  if (sitemapDirectives.length === 0) {
    findings.push({ level: 'P1', kind: 'robots 缺 Sitemap 指令', detail: `${robotsUrl} 未声明 sitemap.xml`, sample: '' })
  } else if (!baseOverride) {
    const expectedHost = new URL(base).host
    const pointsToThisSite = sitemapDirectives.some((directive) => {
      try {
        const url = new URL(directive)
        return url.host === expectedHost && url.pathname === '/sitemap.xml'
      } catch {
        return false
      }
    })
    if (!pointsToThisSite) {
      findings.push({ level: 'P1', kind: 'robots Sitemap 指向错误', detail: `${robotsUrl} 没有指向当前 host 的 /sitemap.xml`, sample: sitemapDirectives.join(', ') })
    }
  }

  // ── llms.txt ──
  const l = await fetchText(llmsUrl)
  if (l.status !== 200) {
    findings.push({ level: 'P0', kind: 'llms 缺失', detail: `${llmsUrl} 返回 HTTP ${l.status}——AI 检索爬虫读不到入口清单`, sample: l.error || '' })
  } else if (/text\/html/i.test(l.contentType)) {
    findings.push({ level: 'P0', kind: 'llms 被 SPA 兜底', detail: `${llmsUrl} 返回了 HTML（content-type: ${l.contentType}）—— 站点所有路径被前端 SPA 接管`, sample: l.body.slice(0, 80) })
  } else if (!/^#/m.test(l.body)) {
    findings.push({ level: 'P1', kind: 'llms 不规范', detail: `${llmsUrl} 不是 llms.txt（找不到 # 开头的标题行）`, sample: l.body.slice(0, 80) })
  } else {
    const linkCount = (l.body.match(/\[[^\]]+\]\([^)]+\)/g) || []).length
    if (linkCount < 5) {
      findings.push({ level: 'P1', kind: 'llms 链接过少', detail: `${llmsUrl} 只有 ${linkCount} 个链接——llms.txt 应覆盖公开页+文档+主站核心`, sample: '' })
    }
    if (Buffer.byteLength(l.body, 'utf8') > 15000) {
      findings.push({ level: 'WARN', kind: 'llms 偏大', detail: `${llmsUrl} 大小 ${Buffer.byteLength(l.body, 'utf8')} 字节——爬虫读全文，越大越容易裁剪`, sample: '' })
    }
  }

  // ── sitemap.xml ──
  const s = await fetchText(sitemapUrl)
  if (s.status !== 200) {
    findings.push({ level: 'P0', kind: 'sitemap 缺失', detail: `${sitemapUrl} 返回 HTTP ${s.status}`, sample: s.error || '' })
  } else if (!/(application|text)\/(xml|.*\+xml)/i.test(s.contentType)) {
    findings.push({ level: 'P0', kind: 'sitemap Content-Type 错误', detail: `${sitemapUrl} 返回 ${s.contentType || '无 Content-Type'}，应为 XML`, sample: s.body.slice(0, 80) })
  } else if (!/^\s*<\?xml\b/i.test(s.body) || !/<urlset\b/i.test(s.body) || !/<\/urlset>\s*$/i.test(s.body)) {
    findings.push({ level: 'P0', kind: 'sitemap XML 无效', detail: `${sitemapUrl} 不是完整的 urlset XML`, sample: s.body.slice(0, 80) })
  } else {
    const locations = [...s.body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim())
    const expectedHost = baseOverride ? null : new URL(base).host
    const hosts = new Set()
    let invalidUrl = false
    for (const location of locations) {
      try {
        const url = new URL(location)
        if (!['http:', 'https:'].includes(url.protocol)) invalidUrl = true
        hosts.add(url.host)
      } catch {
        invalidUrl = true
      }
    }
    if (locations.length === 0 || invalidUrl) {
      findings.push({ level: 'P0', kind: 'sitemap URL 无效', detail: `${sitemapUrl} 缺少有效的绝对 <loc> URL`, sample: '' })
    } else if (hosts.size !== 1 || (expectedHost && !hosts.has(expectedHost))) {
      findings.push({ level: 'P0', kind: 'sitemap host 不一致', detail: `${sitemapUrl} 的 <loc> host=${[...hosts].join(', ') || '无'}；期望仅 ${expectedHost || '一个 host'}`, sample: '' })
    }
  }

  return {
    market,
    base,
    robots: { url: robotsUrl, status: r.status, contentType: r.contentType, size: Buffer.byteLength(r.body, 'utf8') },
    llms: { url: llmsUrl, status: l.status, contentType: l.contentType, size: Buffer.byteLength(l.body, 'utf8') },
    sitemap: { url: sitemapUrl, status: s.status, contentType: s.contentType, size: Buffer.byteLength(s.body, 'utf8') },
    findings,
  }
}

async function main() {
  const targets = onlySite
    ? [onlySite].filter(k => k in sites)
    : Object.keys(sites)
  if (!targets.length) {
    stderr(`✗ --site 必须是 china|global`)
    exit(2)
  }

  const results = []
  for (const m of targets) {
    results.push(await checkSite(m, sites[m]))
  }

  if (jsonOut) {
    stdout.write(JSON.stringify({ ok: results.every(r => !r.findings.some(f => f.level === 'P0' || f.level === 'P1')), results }, null, 2) + '\n')
  } else {
    for (const r of results) {
      stdout.write(`\n=== ${r.market} (${r.base}) ===\n`)
      stdout.write(`  robots.txt  HTTP ${r.robots.status}  ${r.robots.size}B  ${r.robots.contentType}\n`)
      stdout.write(`  llms.txt    HTTP ${r.llms.status}    ${r.llms.size}B  ${r.llms.contentType}\n`)
      stdout.write(`  sitemap.xml HTTP ${r.sitemap.status}  ${r.sitemap.size}B  ${r.sitemap.contentType}\n`)
      if (r.findings.length === 0) {
        stdout.write(`  ✓ 无问题\n`)
      } else {
        for (const f of r.findings) {
          const icon = f.level === 'P0' ? '✗' : f.level === 'P1' ? '✗' : '⚠'
          stdout.write(`  ${icon} [${f.level}] ${f.kind} — ${f.detail}\n`)
          if (f.sample) stdout.write(`      ${f.sample.replace(/\n/g, ' ').slice(0, 80)}\n`)
        }
      }
    }
    stdout.write('\n')
  }

  const fail = results.some(r => r.findings.some(f => f.level === 'P0' || f.level === 'P1'))
  exit(fail ? 1 : 0)
}

main().catch(e => {
  stderr(`✗ 检查脚本异常: ${e.stack || e.message || e}`)
  exit(1)
})
