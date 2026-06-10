/**
 * 前端运行时错误上报（仅 DEV）。
 *
 * 背景：dev-logger-plugin 的 /dev/log 只记录前端主动 POST 的日志。
 * API 失败由 request.ts 上报（[api][failed]），但未捕获异常、未处理的
 * Promise rejection、console.error 等运行时错误无人上报，因此不会出现在
 * log/dev-errors.log 里。本模块补齐这块，统一前缀 [frontend][...] 以便和
 * 后端 [api][failed] 一眼区分。
 *
 * 设计约束：
 *   - 仅 import.meta.env.DEV 生效，生产环境完全不挂载，零副作用。
 *   - 去重 + 节流：同一条错误 1s 内只上报一次，避免渲染死循环 / SW 重试
 *     把日志撑爆（参考此前 MSW × PWA 冲突刷出 1.4 万条的事故）。
 */

const THROTTLE_MS = 1000
const recent = new Map<string, number>()

function postErrorLine(line: string) {
  if (typeof navigator === 'undefined') return

  const now = Date.now()
  const last = recent.get(line)
  if (last && now - last < THROTTLE_MS) return
  recent.set(line, now)
  // 防止 Map 无限增长：超过 200 条时清掉过期项
  if (recent.size > 200) {
    for (const [key, ts] of recent) {
      if (now - ts >= THROTTLE_MS) recent.delete(key)
    }
  }

  const payload = JSON.stringify({ kind: 'error', line })
  const blob = new Blob([payload], { type: 'application/json' })
  if (navigator.sendBeacon?.('/dev/log', blob)) return

  fetch('/dev/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).catch(() => {})
}

function describeError(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ? `${value.name}: ${value.message}\n${value.stack}` : `${value.name}: ${value.message}`
  }
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 在应用入口调用一次，注册全局前端错误监听（仅 DEV）。 */
export function installDevErrorReporter() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    const detail = event.error ? describeError(event.error) : event.message
    const where = event.filename ? ` @ ${event.filename}:${event.lineno}:${event.colno}` : ''
    postErrorLine(`[frontend][uncaught] ${detail}${where}`)
  })

  window.addEventListener('unhandledrejection', (event) => {
    postErrorLine(`[frontend][rejection] ${describeError(event.reason)}`)
  })

  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const line = args.map(describeError).join(' ')
    // 过滤 SW 噪音：mockServiceWorker / storage 冲突产生的高频错误不污染控制台
    const isSWNoise = /mockServiceWorker|Failed to access storage|service.worker/i.test(line)
    if (!isSWNoise) originalConsoleError(...args)
    postErrorLine(`[frontend][console] ${line}`)
  }
}
