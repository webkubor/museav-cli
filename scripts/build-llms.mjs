#!/usr/bin/env node
/**
 * 生成 dist/llms.txt —— 让 AI 检索爬虫读到「控制台有哪些公开页」的入口清单。
 *
 * 背景（2026-09-04 owner 加）：控制台此前没有 llms.txt，而 nginx 的 SPA 兜底
 * （try_files $uri /index.html）让 /llms.txt 返回 200 + text/html —— 爬虫拿到的
 * 是 index.html 的壳，等于「写了也读不到」。本脚本在 build 后落一个真 .txt 文件，
 * 文件存在即绕过 SPA 兜底（robots.txt 一直是这么生效的）。
 *
 * 两种模式：
 *   both（默认）—— 英文 + 中文两份清单拼成一个文件。控制台两个域
 *                  （console.modelgo.com / console.modelgo.ai）目前同一份产物，
 *                  合成一份可以同时覆盖两个市场，不需要改部署。
 *   china/global —— 只出单语。给「按域分别打包」的部署用（同一份代码、两次构建，
 *                  各自把 llms.txt 拷到对应站点根）。
 *
 * 模板在 scripts/llms-templates/（**刻意不放 public/**：那是构建输入不是公开静态资源，
 * 放 public 会被原样拷进 dist/llms-zh.txt，把模板当成品发出去）。
 *
 * 用法：
 *   node scripts/build-llms.mjs                      # both，输出 dist/llms.txt
 *   node scripts/build-llms.mjs --market china       # 只出中文
 *   node scripts/build-llms.mjs --out /tmp/x         # 指定输出目录
 *
 * 一般不用手跑：vite.config.ts 里挂了同名插件，任何 vite build 都会自动生成。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

/** 读 .env.production，取域名占位对应的实际值。 */
function loadEnv() {
  const envFile = resolve(ROOT, '.env.production')
  if (!existsSync(envFile)) throw new Error(`找不到 ${envFile}`)
  const env = {}
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

/** 按市场取模板 + 占位值。 */
function renderMarket(market, env) {
  const isCn = market === 'china'
  const prefix = isCn ? 'VITE_DOMESTIC' : 'VITE_GLOBAL'
  const vars = {
    site: env[`${prefix}_CONSOLE`],
    site_web: env[`${prefix}_SITE`],
    docs: env[`${prefix}_DOCS`],
    gateway: env[`${prefix}_GATEWAY_DOMAIN`] ? `https://${env[`${prefix}_GATEWAY_DOMAIN`]}` : '',
    gateway_china: env.VITE_DOMESTIC_GATEWAY_DOMAIN ? `https://${env.VITE_DOMESTIC_GATEWAY_DOMAIN}` : '',
    gateway_global: env.VITE_GLOBAL_GATEWAY_DOMAIN ? `https://${env.VITE_GLOBAL_GATEWAY_DOMAIN}` : '',
  }
  const missing = ['site', 'site_web', 'docs', 'gateway'].filter((k) => !vars[k])
  if (missing.length) {
    throw new Error(`.env.production 缺 ${prefix}_ 前缀的域名（${missing.join(', ')}）`)
  }

  const tplName = isCn ? 'llms-zh.txt' : 'llms-en.txt'
  const tplPath = resolve(__dirname, 'llms-templates', tplName)
  if (!existsSync(tplPath)) throw new Error(`模板不存在: scripts/llms-templates/${tplName}`)

  const out = readFileSync(tplPath, 'utf8').replace(
    /\{(site|site_web|docs|gateway|gateway_china|gateway_global)\}/g,
    (_, key) => {
      const v = vars[key]
      if (!v) throw new Error(`模板 ${tplName} 里有未定义的占位 {${key}}`)
      return v
    }
  )
  return out
}

/**
 * 生成 llms.txt 内容。
 * @param {'both'|'china'|'global'} market
 */
export function renderLlms(market = 'both') {
  return renderLlmsWithEnv(market, loadEnv())
}

/**
 * 使用显式构建环境渲染清单；单独导出以覆盖市场路由与缺失配置的 fail-closed 行为。
 * @param {'both'|'china'|'global'} market
 * @param {Record<string, string>} env
 */
export function renderLlmsWithEnv(market, env) {
  if (market === 'china' || market === 'global') return renderMarket(market, env)
  // both：英文在前（llms.txt 事实标准是英文），中文在后，中间加分隔标题
  const en = renderMarket('global', env).trim()
  const zh = renderMarket('china', env).trim()
  return `${en}\n\n---\n\n${zh}\n`
}

/**
 * 写 llms.txt 到目标目录。
 * @param {{ market?: 'both'|'china'|'global', outDir?: string }} opts
 */
export function writeLlms(opts = {}) {
  const market = opts.market || 'both'
  const outDir = opts.outDir || resolve(ROOT, 'dist')
  const content = renderLlms(market)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'llms.txt')
  writeFileSync(outPath, content, 'utf8')
  return { outPath, market, bytes: Buffer.byteLength(content, 'utf8') }
}

// ── CLI ────────────────────────────────────────────────────────────────
const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isCli) {
  const args = process.argv.slice(2)
  let market = 'both'
  let outDir = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--market') market = args[++i]
    else if (args[i] === '--out') outDir = args[++i]
    else if (args[i] === '-h' || args[i] === '--help') {
      console.log('用法: node scripts/build-llms.mjs [--market both|china|global] [--out <dir>]')
      process.exit(0)
    }
  }
  if (!['both', 'china', 'global'].includes(market)) {
    console.error(`✗ --market 必须是 both|china|global，当前: ${market}`)
    process.exit(1)
  }
  try {
    const r = writeLlms(outDir ? { market, outDir } : { market })
    console.log(`✓ llms.txt 已生成（${r.market}，${r.bytes} 字节）→ ${r.outPath}`)
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exit(1)
  }
}
