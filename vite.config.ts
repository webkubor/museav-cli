import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { agentEyes, agentProxy, agentVersion } from 'vite-plugin-agent-eyes'
import { devRequirementsPlugin } from './scripts/dev-requirements-plugin'
import { uiAuditPlugin } from './scripts/ui-audit-plugin'
import { renderLlms } from './scripts/build-llms.mjs'
import { renderSitemap, type SitemapMarket } from './scripts/build-sitemap.mjs'

// 当前分支名。CI 优先用注入的环境变量（Jenkins 的 GIT_BRANCH / GitLab CI 的 CI_COMMIT_REF_NAME），
// 因为流水线 checkout 后处于 detached HEAD，`rev-parse --abbrev-ref HEAD` 只会返回字面量 HEAD。
function resolveBranch(): string {
  const fromEnv = process.env.GIT_BRANCH || process.env.CI_COMMIT_REF_NAME
  if (fromEnv) return fromEnv.replace(/^origin\//, '')
  try {
    const head = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
    return head === 'HEAD' ? '' : head
  } catch { return '' }
}

// 发版版本号的真源是**发版分支名**（班车制的 `release/vX.Y.Z`），不是 package.json。
// package.json 的 version 靠人手 bump，实测跨三个版本只同步过一次（854f1486「版本同步
// V1.0.3」），到 1.0.6 时仍停在 1.0.4——从它取值，version.json 就会对外报错版本。
// 分支名则由发版流程本身决定，不需要任何人记得改。
//
// 非发版分支（test / hotfix/* / feature/*）拿不到版本号，回落 package.json：那些产物
// 不用于对外声明版本，所以回落值不准也无妨，**不必为此手动维护 package.json**。
function releaseVersion(branch: string): string {
  const matched = /^release\/v?(\d+\.\d+\.\d+)/.exec(branch)
  if (matched) return matched[1]
  // 是发版分支却取不出版本号 ⇒ 分支名不合班车制命名，就地拦住。
  // 与下面 REQUIRED_URL_ENV 同一个原则：宁可不让过，也不产出一个错的版本号悄悄上线。
  if (branch.startsWith('release/')) {
    throw new Error(
      `[emit-version-json] 发版分支 "${branch}" 取不出版本号，期望 release/vX.Y.Z（班车制命名）`,
    )
  }
  return ''
}

// 构建时产出 /version.json：记录这次部署到底是哪个版本、哪个 commit、什么时候构建的。
// 目前前端没有代码读它（注释里曾提到的「强制更新弹窗」并未落地），它的实际用途是
// **人和 agent 核对某个环境上跑的是什么**——构建绿灯只说明打包成功，这份文件才证明
// 产物真的上了那台机器。
function emitVersionJson(): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      let commit = ''
      try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* 无 git 环境时留空 */ }
      let pkgVersion = ''
      try { pkgVersion = JSON.parse(readFileSync('package.json', 'utf-8')).version } catch { /* ignore */ }
      const branch = resolveBranch()
      const version = releaseVersion(branch) || pkgVersion
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version, commit, branch, time: new Date().toISOString() }),
      })
    },
  }
}

/**
 * llms.txt：给 AI 检索爬虫的「控制台公开页入口清单」（owner 2026-09-04 加）。
 *
 * 为什么必须有真文件：nginx 的 SPA 兜底（try_files $uri /index.html）对不存在的
 * 路径统一回 index.html。此前 /llms.txt 就是被它接住的 —— 返回 200 + text/html，
 * 爬虫拿到的是首页壳，等于没有 llms.txt。落一个真 .txt 文件后，文件存在即绕过
 * 兜底（robots.txt 一直按这个机制生效）。
 *
 * 为什么走 generateBundle + emitFile 而不是 build 完再写文件：emitFile 把产物纳入
 * 打包清单，谁调 vite build 都会生成（npm script / Jenkins / 手敲 vite 都一样），
 * 不存在「某个构建入口漏了这一步」。emitVersionJson 用的是同一套路。
 *
 * 默认 both（英+中合一份）：控制台两个域 console.modelgo.com / console.modelgo.ai
 * 目前同一份产物，合一份即可双市场覆盖，不用改部署。真要按域分语言打包时，构建时
 * 设 LLMS_MARKET=china|global 即可（模板见 scripts/llms-templates/）。
 */
function emitLlmsTxt(): Plugin {
  const market = () => {
    const m = process.env.LLMS_MARKET
    if (m && !['both', 'china', 'global'].includes(m)) {
      throw new Error(`LLMS_MARKET 必须是 both|china|global，当前: ${m}`)
    }
    return (m as 'both' | 'china' | 'global') || 'both'
  }
  return {
    name: 'emit-llms-txt',
    configureServer(server) {
      // dev 也提供 /llms.txt：文件本来只在 build 产物里，而 Vite 对未知路径走
      // SPA 兜底回 index.html——本地跑 scripts/check-crawl-files.mjs 会误报
      // 「llms 被 SPA 兜底」，明明是正常的 dev 行为。这里直接吐文本，本地可验。
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/llms.txt') return next()
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(renderLlms(market()))
      })
    },
    generateBundle() {
      const m = process.env.LLMS_MARKET
      if (m && !['both', 'china', 'global'].includes(m)) {
        this.error(`LLMS_MARKET 必须是 both|china|global，当前: ${m}`)
      }
      this.emitFile({
        type: 'asset',
        fileName: 'llms.txt',
        source: renderLlms((m as 'both' | 'china' | 'global') || 'both'),
      })
    },
  }
}

function emitSitemap(env: Record<string, string>, mode: string): Plugin {
  const configuredMarket = process.env.SITEMAP_MARKET
  const market = configuredMarket || (mode === 'production' ? '' : 'china')
  if (market && !['china', 'global'].includes(market)) {
    throw new Error(`SITEMAP_MARKET must be china|global, received: ${market}`)
  }

  return {
    name: 'emit-market-sitemap',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/sitemap.xml') return next()
        if (!market) {
          res.statusCode = 500
          res.end('Set SITEMAP_MARKET=china|global to preview sitemap.xml')
          return
        }
        try {
          res.setHeader('Content-Type', 'application/xml; charset=utf-8')
          res.end(renderSitemap(market as SitemapMarket, env))
        } catch (error) {
          res.statusCode = 500
          res.end(error instanceof Error ? error.message : String(error))
        }
      })
    },
    generateBundle() {
      if (!market) this.error('Production builds must set SITEMAP_MARKET=china|global')
      try {
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: renderSitemap(market as SitemapMarket, env),
        })
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error))
      }
    },
  }
}

// 跳转地址（官网/控制台/文档）每个环境都必须按市场配齐——缺一个就中断构建，
// 不允许带着空配置/硬编码兜底上线（兜底的真正含义：配置缺失就不让过）。
const REQUIRED_URL_ENV = [
  'VITE_DOMESTIC_SITE', 'VITE_DOMESTIC_CONSOLE', 'VITE_DOMESTIC_DOCS',
  'VITE_GLOBAL_SITE', 'VITE_GLOBAL_CONSOLE', 'VITE_GLOBAL_DOCS',
] as const

// 模型调用网关域名（api.*）：只有生产按市场分两个域名，dev/test 统一走 api.test.modelgo.com
// （见 config/market.ts 的 isTestOrDev 分支，那里根本不读这两个变量，所以只在生产校验）。
// 生产必须配齐——两个生产站共用同一份 .env.production，少一个就会把另一市场的网关地址
// 发给用户（shared/modelgo_prd#376）。
const REQUIRED_PROD_ENV = [
  'VITE_DOMESTIC_GATEWAY_DOMAIN', 'VITE_GLOBAL_GATEWAY_DOMAIN',
] as const

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const required = [...REQUIRED_URL_ENV, ...(mode === 'production' ? REQUIRED_PROD_ENV : [])]
  const missing = required.filter((k) => !env[k]?.trim())
  if (missing.length) {
    throw new Error(
      `[vite] 缺少必需的跳转地址环境变量（mode=${mode}）：${missing.join(', ')}。` +
      `请在 .env.${mode} 按市场配齐，禁止留空或依赖硬编码兜底。`,
    )
  }
  return {
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'test' ? 'development' : 'production'),
    // 当前分支：开发工具栏用来核对「跑的是哪个分支的产物」。
    // Jenkins 上 checkout 后是 detached HEAD，rev-parse 只会得到 HEAD，所以优先读它注入的
    // GIT_BRANCH（形如 origin/test）。dev server 只在启动时求值一次——本地切分支要重启才更新。
    __BUILD_BRANCH__: JSON.stringify(resolveBranch()),
  },
  plugins: [
    tailwindcss(),
    react(),
    // 构建戳记：__APP_VERSION__/__BUILD_TAG__(最新 make-tag)/__BUILD_COMMIT__/__BUILD_TIME__ + dev GET /__version
    agentVersion(),
    emitVersionJson(),
    // 给 AI 检索爬虫的公开页清单（scripts/build-llms.mjs，默认英+中一份）
    emitLlmsTxt(),
    // Sitemap protocol requires one host per file; prod/prod-global must build separately.
    emitSitemap(env, mode),
    // 一站式入口（0.13）：遥测 + 客户端自动埋点 + 项目体检 + dev 超长文件实时警告(sizeWatch)
    // + 提交 guard 默认全开；本仓的提交门禁仍走自定义 git.precommit 透传。
    ...agentEyes({
      // fileLength block 阈值抬到 4000：locales/*.json（2300+ 行数据文件）和代码生成物
      // 天然超默认 800 行，会把相关提交全部卡死；warn 档保持 400 渐进治理。
      // ⚠️ 单项设 'warn' 在超 block 阈值时不生效（插件按全局 level 判），别改回那种写法；
      // 插件也暂无按路径排除 fileLength 的配置，有了再收紧。
      guard: { checks: { fileLength: { warn: 400, block: 4000 } } },
      // sizeWatch 降噪：第三方 vendor / 代码生成物 / 测试文件不是拆分对象。
      // dot 开头目录（.claude/.worktrees/.codex 等）已由插件默认忽略且自定义 exclude 自动并入。
      sizeWatch: { warn: 500, exclude: /node_modules|[\\/]dist[\\/]|\.git[\\/]|public\/vendor\/|generated-api-types|\.test\.tsx?$/ },
      git: {
        // 提交前门禁：清单真源在 scripts/pre-commit-all.sh（类型+规范快检 / UI 门禁 /
        // token 存在性门禁），这里只调那一个入口。
        // ⚠️ 别把清单展开抄回这里（2026-08-13）：agent-eyes 只在**启动过 vite** 时才把
        // 这份清单写进 .git/hooks/pre-commit，只跑 `pnpm install` 的人拿不到；
        // install-hooks.sh 需要装同一套门禁，清单抄两处必然漂移，故收口到单一脚本。
        precommit: ['bash scripts/pre-commit-all.sh'],
        force: true,
      },
    }),
    devRequirementsPlugin(),
    // UI 运行时审计：dev 期自动跑 scripts/ui-runtime-audit.js 并把问题回传终端。
    // 它查的五项静态门禁一条都抓不到（只在真实数据 + 真实容器宽度下暴露），
    // 而原本只能手动注入执行——等于"写了靠自觉"，正是要治的病。不阻断，只让问题被看见。
    uiAuditPlugin(),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('/recharts/') ||
            id.includes('/d3-shape/') ||
            id.includes('/d3-scale/') ||
            id.includes('/d3-array/') ||
            id.includes('/d3-color/') ||
            id.includes('/d3-format/') ||
            id.includes('/d3-interpolate/') ||
            id.includes('/d3-path/') ||
            id.includes('/d3-time/') ||
            id.includes('/d3-time-format/') ||
            id.includes('/victory-vendor/')
          ) return 'recharts'
          if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('@tanstack/react-query')) return 'vendor-query'
          if (id.includes('i18next')) return 'vendor-i18n'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // 固定控制台自己的 dev 端口 5175（与 CLAUDE.md 及下方 Origin 改写注释一致），
    // 避免默认 5173 与其它 Vite 项目抢端口；strictPort 不开，5175 被占仍自动顺延；PORT 可覆盖。
    port: process.env.PORT ? parseInt(process.env.PORT) : 5175,
    // 多 agent 并行的 git worktree 嵌在仓库根下（.worktrees/ / .claude/worktrees/）:
    // 不忽略的话,别的 agent 在 worktree 里改 tsconfig/文件会触发主树 dev server
    // 清缓存强制全量 reload,打断正在开发的 HMR(README「已踩过的雷」)。
    watch: { ignored: ['**/.worktrees/**', '**/.claude/**'] },
    proxy: {
      // 真 API 网关是 modelgo-web-api.test.modelgo.com（test.modelgo.com 网关白名单已收紧会返回 invalid domain）。
      // agentProxy 自带：proxy.log（header 真相）+ 本地 cookie 修复（去 Domain/剥 Secure/SameSite=None→Lax）。
      // proxyReq 钩子：把浏览器发出的 Origin: http://localhost:5175 改写为后端允许的白名单 Origin，
      // 避免 CORS 策略在 POST /auth/login 等写请求上返回 403（GET 请求不带 Origin，不受影响）。
      // 前缀必须带尾斜杠：vite proxy 是**前缀匹配**，写 '/api' 会把 `/api-keys`
      // 这类以 api 开头的 SPA 路由一并代理到后端（前端拿到的是后端 40401 JSON 而
      // 不是页面）。真实接口一律是 `/api/v1/...`，带斜杠不影响任何请求。
      // 线上 nginx 走的是 `/api/` 精确前缀，本地此前与线上行为不一致。
      '/api/': (() => {
        const p = agentProxy('https://modelgo-web-api.test.modelgo.com')
        const orig = p.configure
        p.configure = (proxy, opts) => {
          orig?.(proxy, opts)
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'https://console.test.modelgo.com')
          })
        }
        return p
      })(),
    },
  },
  }
})

