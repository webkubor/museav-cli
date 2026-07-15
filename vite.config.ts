import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { agentDebugger, agentProxy, agentGit, agentVersion } from 'vite-plugin-agent-eyes'
import { devRequirementsPlugin } from './scripts/dev-requirements-plugin'

// 跳转地址（官网/控制台/文档）每个环境都必须按市场配齐——缺一个就中断构建，
// 不允许带着空配置/硬编码兜底上线（兜底的真正含义：配置缺失就不让过）。
const REQUIRED_URL_ENV = [
  'VITE_DOMESTIC_SITE', 'VITE_DOMESTIC_CONSOLE', 'VITE_DOMESTIC_DOCS',
  'VITE_GLOBAL_SITE', 'VITE_GLOBAL_CONSOLE', 'VITE_GLOBAL_DOCS',
] as const

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const missing = REQUIRED_URL_ENV.filter((k) => !env[k]?.trim())
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
    agentDebugger(),
    // 提交前门禁（dev 启动时幂等安装 pre-commit 钩子）
    agentGit({
      // 提交前门禁：cs check test（类型/规范/构建）+ UI 门禁（DESIGN.md 约定，见 scripts/ui-guard.sh）
      // 任一非零退出即阻断。force 接管既有手写 pre-commit —— cs check test 已并入下面 precommit，不丢。
      precommit: ['cs check test', 'bash scripts/ui-guard.sh'],
      force: true,
    }),
    devRequirementsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
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
            src: '/brand/modelgo-app-icon-dark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/brand/modelgo-app-icon-light.svg',
            sizes: 'any',
            type: 'image/svg+xml',
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
  optimizeDeps: {
    include: ['lottie-react'],
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
      '/api': (() => {
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


