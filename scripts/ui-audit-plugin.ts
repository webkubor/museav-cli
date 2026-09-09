import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

/**
 * UI 运行时审计的 dev 注入插件。
 *
 * 为什么要有它：`scripts/ui-runtime-audit.js` 查的五项（横向滚动、文本溢出无兜底、
 * 字号挤档 / 尺度过多、浮层背景透读、同组条长无区分度）**静态门禁一条都抓不到**——
 * 它们只在真实数据 + 真实容器宽度下暴露。但审计脚本原本只能手动注入执行，等于
 * "写在文档里靠自觉"，而这正是 2026-09-03 那一整天在治的病：
 * **没有强制力的规则等于不存在**。ui-guard 和 check-css-tokens 挂在 pre-commit 上
 * 所以从没被绕过；审计脚本没挂任何地方，所以只有想起来的时候才跑。
 *
 * 做法：dev 模式下把审计脚本注入页面，路由稳定后自动跑一次，有问题打到浏览器控制台
 * **并回传 dev server 终端**（agent 看得到终端，不一定看得到浏览器控制台）。
 *
 * 刻意不阻断：审计有阈值、有误判空间，卡住 dev 只会让人关掉它。它的作用是让问题
 * **在写的时候就被看见**，而不是等验收时被需求方指出来。
 */

const AUDIT_SCRIPT = path.resolve(process.cwd(), 'scripts/ui-runtime-audit.js')
const VIRTUAL_ID = 'virtual:ui-runtime-audit'
const RESOLVED_ID = '\0' + VIRTUAL_ID
/** 上报端点：浏览器把结果 POST 回来，插件打到终端 */
const REPORT_ENDPOINT = '/__ui_audit_report'

/** 同一页面同一批问题只在终端打一次，避免 HMR 频繁刷屏 */
const reported = new Set<string>()

export function uiAuditPlugin(): Plugin {
  return {
    name: 'modelgo-ui-audit',
    apply: 'serve',

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },

    load(id) {
      if (id !== RESOLVED_ID) return
      let audit: string
      try {
        audit = fs.readFileSync(AUDIT_SCRIPT, 'utf8').replace(/if \(typeof module[\s\S]*$/, '')
      } catch {
        return 'export default null' // 审计脚本不在就静默跳过，不拖垮 dev
      }
      return `${audit}
let lastPath = ''
let timer = null

function run() {
  let result
  try { result = __uiAudit() } catch { return }
  if (!result || result.ok) return
  // 浏览器控制台：分组打出，便于点开看具体元素
  console.groupCollapsed('%c[ui-audit] ' + result.issues.length + ' 项 —— ' + location.pathname,
    'color:#b4342b;font-weight:600')
  for (const i of result.issues) console.warn(\`\${i.level} \${i.kind}: \${i.detail}\`, i.sample ?? '')
  console.info('判据与阈值见 scripts/ui-runtime-audit.js')
  console.groupEnd()
  // 回传终端：agent 通常只看得到终端输出
  fetch('${REPORT_ENDPOINT}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: location.pathname, issues: result.issues, fontScale: result.fontScale }),
  }).catch(() => {})
}

/** 路由变化或 DOM 稳定后跑一次：太早跑会在骨架屏上量出假问题 */
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (location.pathname === lastPath) return
    lastPath = location.pathname
    run()
  }, 1500)
}

if (typeof window !== 'undefined') {
  window.__uiAudit = __uiAudit          // 手动复跑：控制台敲 __uiAudit()
  window.addEventListener('load', schedule)
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true })
}
export default __uiAudit
`
    },

    transformIndexHtml() {
      return [{ tag: 'script', attrs: { type: 'module', src: `/@id/${VIRTUAL_ID}` }, injectTo: 'body' }]
    },

    configureServer(server) {
      server.middlewares.use(REPORT_ENDPOINT, (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        let raw = ''
        req.on('data', (c) => { raw += c })
        req.on('end', () => {
          try {
            const { path: p, issues, fontScale } = JSON.parse(raw)
            const key = p + '|' + issues.map((i: { kind: string }) => i.kind).join(',')
            if (!reported.has(key)) {
              reported.add(key)
              const c = (s: string, code: string) => `[${code}m${s}[0m`
              console.log('')
              console.log(c(`  [ui-audit] ${p} —— ${issues.length} 项`, '1;33'))
              for (const i of issues) {
                const color = i.level === 'P0' ? '31' : i.level === 'P1' ? '33' : '36'
                console.log(`    ${c(i.level, color)} ${i.kind}: ${i.detail}`)
                if (i.sample?.length) console.log(c(`        ${i.sample.slice(0, 2).join(' / ')}`, '2'))
              }
              if (fontScale) console.log(c(`    字号分布 ${fontScale}`, '2'))
              console.log(c('    判据见 scripts/ui-runtime-audit.js；浏览器控制台敲 __uiAudit() 可复跑', '2'))
              console.log('')
            }
          } catch { /* 上报格式不对就忽略，不影响 dev */ }
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}
