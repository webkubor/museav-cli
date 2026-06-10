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

const THROTTLE_MS = 5000
const MAX_BROWSER_REPEATS = 3

const recent = new Map<string, number>()
const browserCount = new Map<string, number>()

// 去掉 HMR 时间戳参数（?t=\d+），避免同一错误因版本戳不同绕过去重
function normalizeKey(line: string): string {
  return line.replace(/\?t=\d+/g, '').slice(0, 300)
}

function postErrorLine(line: string) {
  if (typeof navigator === 'undefined') return

  const key = normalizeKey(line)
  const now = Date.now()
  const last = recent.get(key)
  if (last && now - last < THROTTLE_MS) return
  recent.set(key, now)

  if (recent.size > 200) {
    for (const [k, ts] of recent) {
      if (now - ts >= THROTTLE_MS) recent.delete(k)
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

// 同一错误在浏览器控制台最多显示 MAX_BROWSER_REPEATS 次，之后静默抑制
function shouldPrintToBrowser(key: string): boolean {
  const count = (browserCount.get(key) ?? 0) + 1
  browserCount.set(key, count)
  if (count === MAX_BROWSER_REPEATS + 1) {
    console.warn(`[dev-reporter] 重复错误已抑制（后续不再显示）: ${key.slice(0, 120)}`)
  }
  return count <= MAX_BROWSER_REPEATS
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
    const isSWNoise = /mockServiceWorker|Failed to access storage|service.worker/i.test(line)
    if (!isSWNoise && shouldPrintToBrowser(normalizeKey(line))) {
      originalConsoleError(...args)
    }
    postErrorLine(`[frontend][console] ${line}`)
  }
}
