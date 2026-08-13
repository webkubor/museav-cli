/**
 * 动态 import 失败（chunk 加载错误）的自动恢复守卫（需求方#233、#591）。
 *
 * 背景：部署窗口期 index.html 已是新版而 assets 未上齐，或停留旧页面时旧 hash chunk
 * 已被清除；服务器 SPA fallback 会把缺失的 /assets/*.js 以 200 + text/html 返回，
 * 浏览器报 MIME 错误，Vite 对 import()/modulepreload 失败统一派发 `vite:preloadError`。
 *
 * 旧实现只在 10s 窗口内刷新一次——部署窗口往往长于一次刷新的间隔，刷完仍失败就
 * 永远停在 ErrorBoundary 错误页（#591 的现象）。本守卫改为：
 * - 最多重试 MAX_RETRIES 次，间隔按 RETRY_DELAYS_MS 退避，覆盖十余秒的部署窗口；
 * - 刷新 URL 带 mg_chunk_retry 参数 cache-bust，绕过启发式缓存的旧 index.html；
 * - 距上次失败超过 RESET_WINDOW_MS 视为新一轮故障，计数重置；
 * - 重试耗尽后不再刷新，让 ErrorBoundary 的降级 UI 接住，避免无限刷新循环。
 */

const COUNT_KEY = 'mg:preload-reload-count'
const TS_KEY = 'mg:preload-reload-ts'
const MAX_RETRIES = 3
const RESET_WINDOW_MS = 120_000
const RETRY_DELAYS_MS = [0, 3_000, 8_000]

interface GuardOptions {
  /** 执行整页跳转，默认 location.replace；测试注入 */
  navigate?: (url: string) => void
  /** 时钟，默认 Date.now；测试注入 */
  now?: () => number
}

export function installChunkReloadGuard(options: GuardOptions = {}) {
  const navigate = options.navigate ?? ((url: string) => window.location.replace(url))
  const now = options.now ?? Date.now

  const onPreloadError = (event: Event) => {
    const lastTs = Number(sessionStorage.getItem(TS_KEY) || '0')
    let count = Number(sessionStorage.getItem(COUNT_KEY) || '0')
    if (now() - lastTs > RESET_WINDOW_MS) count = 0
    if (count >= MAX_RETRIES) return

    sessionStorage.setItem(COUNT_KEY, String(count + 1))
    sessionStorage.setItem(TS_KEY, String(now()))
    event.preventDefault()

    const url = new URL(window.location.href)
    url.searchParams.set('mg_chunk_retry', String(count + 1))
    const delay = RETRY_DELAYS_MS[count] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
    setTimeout(() => navigate(url.toString()), delay)
  }

  window.addEventListener('vite:preloadError', onPreloadError)
  return () => window.removeEventListener('vite:preloadError', onPreloadError)
}
