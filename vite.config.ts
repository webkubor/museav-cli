import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { devLoggerPlugin } from './scripts/dev-logger-plugin'
import { devRequirementsPlugin } from './scripts/dev-requirements-plugin'
import { version } from './package.json'
import { execSync } from 'node:child_process'
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs'

// 构建时注入：git 短 hash + 构建时间，每次部署都会变，用于判断线上是否走了缓存
const buildHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
})()
const buildTime = new Date().toISOString()


export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_HASH__: JSON.stringify(buildHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
    'process.env.NODE_ENV': JSON.stringify(mode === 'test' ? 'development' : 'production'),
  },
  plugins: [
    tailwindcss(),
    react(),
    devLoggerPlugin(),
    devRequirementsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'brand/**'],
      manifest: {
        name: 'ModelGo Console',
        short_name: 'ModelGo',
        description: 'ModelGo AI Platform Console',
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
    proxy: {
      '/api': {
        // test.modelgo.com 网关已收紧域名白名单，对该域一律返回 {"message":"invalid domain"}；
        // 真 API 网关是 modelgo-web-api.test.modelgo.com（与 .env.test 的 VITE_API_URL 一致）
        target: 'https://modelgo-web-api.test.modelgo.com',
        changeOrigin: true,
        secure: true,
        // 上游 cookie 实为 Domain=test.modelgo.com（父域）+ Secure + SameSite=None，
        // 在 http://localhost 上域不匹配且 Secure 被丢弃 → 存不住 → 登录成功却 401。
        // 故在 proxyRes 里：去掉 Domain（变 localhost host-only）、剥 Secure、SameSite=None→Lax。
        configure: (proxy) => {
          // log/proxy.log —— 代理层 header 真相（前端 fetch 看不到 Cookie/Set-Cookie）。
          // 每次启动清空；cookie 值脱敏，只留名字 + 属性（Domain/Secure/SameSite/HttpOnly）。
          mkdirSync('log', { recursive: true })
          writeFileSync('log/proxy.log', `# Proxy Log — started ${new Date().toISOString()}\n\n`)
          const log = (msg: string) => {
            try { appendFileSync('log/proxy.log', `[${new Date().toISOString()}] ${msg}\n`) } catch { /* ignore */ }
          }
          proxy.on('proxyRes', (proxyRes, req) => {
            const reqCookie = req.headers?.cookie
            const reqNames = reqCookie ? reqCookie.split(';').map((s) => s.split('=')[0].trim()).join(',') : '无'
            const setCookie = proxyRes.headers['set-cookie']
            const scSummary = setCookie
              ? setCookie.map((c) => c.replace(/^([^=]+)=[^;]*/, '$1=<redacted>')).join(' || ')
              : '无'
            log(`${req.method} ${req.url} → ${proxyRes.statusCode} | Cookie(req): ${reqNames} | Set-Cookie: ${scSummary}`)

            // 修复：上游 cookie 是父域 Domain=test.modelgo.com + Secure + SameSite=None，
            // 在 http://localhost 上域不匹配且 Secure 被丢弃 → 存不住 → 登录成功却 401。
            // 开发态：去 Domain（变 localhost host-only）、剥 Secure、SameSite=None→Lax。
            if (setCookie) {
              proxyRes.headers['set-cookie'] = setCookie.map((c) =>
                c
                  .replace(/;\s*Domain=[^;]+/gi, '')
                  .replace(/;\s*Secure/gi, '')
                  .replace(/;\s*SameSite=None/gi, '; SameSite=Lax'),
              )
            }
          })
        },
      },
    },
  },
}))



