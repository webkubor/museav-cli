import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

/**
 * 开发日志（log/ 目录，仅 dev、每次启动清空）。全项目共 3 类实时调试流，详见 log/README.md：
 *  1. api-calls.log —— 本插件写：全部 API（成功+失败）+ 路由跳转，带请求/响应体。查接口契约、定字段。
 *  2. dev-errors.log —— 本插件写：API 失败 + 前端运行时错误（uncaught/rejection/console.error）。只看"哪坏了"。
 *  3. proxy.log —— vite.config 代理 configure 写：代理层 header 真相（Cookie / Set-Cookie / status）。查 cookie/网络层。
 * 前端运行时错误来源：src/lib/dev-error-reporter.ts → POST /dev/log；本插件落盘。
 */
const LOG_DIR = path.resolve(process.cwd(), 'log')
const ERROR_LOG_PATH = path.join(LOG_DIR, 'dev-errors.log')
const API_LOG_PATH = path.join(LOG_DIR, 'api-calls.log')
const LOG_HEADER_SEPARATOR = '\n\n'

type DevLogPayload =
  | {
      kind: 'api'
      method: string
      path: string
      url: string
      ok: boolean
      duration_ms: number
      code?: number
      status?: number
      request_id?: string
      error?: string
      page_path?: string
      request?: unknown
      response?: unknown
    }
  | {
      kind: 'nav'
      from: string
      to: string
    }
  | {
      kind: 'error'
      line: string
    }

function pad(value: number, size = 2) {
  return String(value).padStart(size, '0')
}

function formatLocalTimestamp(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offset = `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`,
    offset,
  ].join(' ')
}

function writeNewest(file: string, block: string) {
  const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const splitAt = content.indexOf(LOG_HEADER_SEPARATOR)

  if (splitAt === -1) {
    fs.writeFileSync(file, `${block}\n${content}`)
    return
  }

  const header = content.slice(0, splitAt + LOG_HEADER_SEPARATOR.length)
  const rest = content.slice(splitAt + LOG_HEADER_SEPARATOR.length)
  fs.writeFileSync(file, `${header}${block}\n${rest}`)
}

function writeError(line: string) {
  writeNewest(ERROR_LOG_PATH, line)
}

function formatApiLog(payload: Extract<DevLogPayload, { kind: 'api' }>) {
  const status = payload.status ? ` http=${payload.status}` : ''
  const code = payload.code !== undefined ? ` code=${payload.code}` : ''
  const requestId = payload.request_id ? ` requestId=${payload.request_id}` : ''
  const page = payload.page_path ? ` page=${payload.page_path}` : ''
  const error = payload.error ? ` error="${payload.error}"` : ''
  const result = payload.ok ? 'ok' : 'failed'
  return `[api][${result}] ${payload.method.toUpperCase()} ${payload.path} ${payload.duration_ms}ms${status}${code}${requestId}${page}${error}`
}

function stableStringify(value: unknown) {
  if (value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function limitText(value: string, max = 4000) {
  return value.length > max ? `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]` : value
}

function formatBlock(label: string, value: unknown) {
  const text = stableStringify(value)
  if (!text) return ''
  return `  ${label}: ${limitText(text).replace(/\n/g, '\n  ')}`
}

function formatApiLogDetail(payload: Extract<DevLogPayload, { kind: 'api' }>) {
  return [
    formatApiLog(payload),
    formatBlock('提交', payload.request),
    formatBlock('返回', payload.response),
  ].filter(Boolean).join('\n')
}

function formatNavLog(payload: Extract<DevLogPayload, { kind: 'nav' }>) {
  return `[nav] ${payload.from || '(direct)'} → ${payload.to}`
}

function parsePayload(raw: string): DevLogPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DevLogPayload>
    if (parsed.kind === 'api' && parsed.method && parsed.path && parsed.url) {
      return parsed as DevLogPayload
    }
    if (parsed.kind === 'nav' && parsed.to) {
      return parsed as DevLogPayload
    }
    if (parsed.kind === 'error' && parsed.line) {
      return parsed as DevLogPayload
    }
  } catch {
    return null
  }
  return null
}

export function devLoggerPlugin(): Plugin {
  return {
    name: 'dev-logger',
    apply: 'serve',
    configureServer(server) {
      fs.mkdirSync(LOG_DIR, { recursive: true })

      const header = `# Dev Log — started ${formatLocalTimestamp()}\n\n`
      // 每次 dev server 启动清空日志，保证 AI 看到的是本次会话的记录
      fs.writeFileSync(ERROR_LOG_PATH, header)
      fs.writeFileSync(API_LOG_PATH, header)

      server.middlewares.use('/dev/log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          const ts = formatLocalTimestamp()
          const payload = parsePayload(body)

          if (payload?.kind === 'api') {
            const detail = `[${ts}] ${formatApiLogDetail(payload)}`
            writeNewest(API_LOG_PATH, detail)
            if (!payload.ok) writeError(detail)
          } else if (payload?.kind === 'nav') {
            writeNewest(API_LOG_PATH, `[${ts}] ${formatNavLog(payload)}`)
          } else if (payload?.kind === 'error') {
            writeError(`[${ts}] ${payload.line}`)
          } else {
            writeError(`[${ts}] ${body}`)
          }

          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}
