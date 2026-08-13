import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { agentEyes, agentProxy, agentVersion } from 'vite-plugin-agent-eyes'
import { devRequirementsPlugin } from './scripts/dev-requirements-plugin'

// 构建时产出 /version.json：供「新版本强制更新弹窗」拉取最新部署的版本号做「当前→最新」对比。
// package version 很少 bump，真正区分每次部署的是 commit + 构建时间，故三者都带上。
function emitVersionJson(): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      let commit = ''
      try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* 无 git 环境时留空 */ }
      let version = ''
      try { version = JSON.parse(readFileSync('package.json', 'utf-8')).version } catch { /* ignore */ }
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version, commit, time: new Date().toISOString() }),
      })
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
  },
  plugins: [
    tailwindcss(),
    react(),
    // 构建戳记：__APP_VERSION__/__BUILD_TAG__(最新 make-tag)/__BUILD_COMMIT__/__BUILD_TIME__ + dev GET /__version
    agentVersion(),
    emitVersionJson(),
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
        // 提交前门禁：类型+规范快检（全量构建挪 pre-push/CI）+ UI 门禁（DESIGN.md
        // 约定，见 scripts/ui-guard.sh）+ token 存在性门禁。任一非零退出即阻断。
        // ⚠️ 不直接写 cs 命令——cs 是个人工具链，团队成员没有会导致谁都无法提交；
        // pre-commit-check.sh 内部做「有 cs 用 cs、无则降级 tsc+eslint」的等效检查。
        // check-css-tokens 必须在这里硬拦（2026-08-13）：它早就存在于 package.json，
        // 但从未挂进提交期，纯靠人自觉记得跑 —— 有工具而不强制等于没有。8-12 那批把
        // 硬编码类批量换成 var(...) 却没建变量的改动（Dialog/Sheet/Select/DropdownMenu/
        // InfoTip 全局组件失效）就是这么直推进 test 的。var() 引空值会让整条声明静默
        // 失效：tsc/eslint/vite build 全部照过，只有真人点到那个组件才暴露。
        precommit: [
          'sh scripts/pre-commit-check.sh',
          'bash scripts/ui-guard.sh',
          'node scripts/check-css-tokens.mjs',
        ],
        force: true,
      },
    }),
    devRequirementsPlugin(),
    VitePWA({
      // prompt 模式：新版本就绪时触发 onNeedRefresh，由 <AppUpdatePrompt/> 弹强制更新窗，
      // 而非 autoUpdate 静默替换（静默模式下页面仍跑旧代码，导航易撞旧 chunk 白屏，需求方#233）。
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'brand/**'],
      // 国内版 manifest(默认);国际站(.ai)由 index.html 域名前置脚本切到
      // public/manifest-global.webmanifest(qa#481)——单一构建产物,安装图标/名称随市场。
      manifest: {
        name: 'ModelGo 控制台',
        short_name: 'ModelGo',
        description: 'ModelGo AI 平台控制台',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/brand/modelgo-pwa-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/brand/modelgo-pwa-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
            },
          },
        ],
      },
    }),
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


