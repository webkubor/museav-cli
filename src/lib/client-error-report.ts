/**
 * 前端自身 bug（非接口 5xx）的埋点上报，与 error-diagnostics.ts 的 server_error:5xx 同规范：
 * 复用 envBase() 环境字段（page/tenant_id/version/build/time），事件 key 沿用 `xxx:yyy` 冒号约定。
 *
 * 覆盖两类此前没人接的缺口：
 * - client_error:render    ErrorBoundary 兜到的 React 渲染期报错（之前只有 console.error，无上报）
 * - client_error:uncaught  / client_error:rejection  全局未捕获异常与未处理 rejection
 *   （DEV 环境已有 vite-plugin-agent-eyes 的 installAgentErrorReporter 做本地调试用的
 *   控制台+DOM 快照采集，那是给开发者本地排障用的、不落库；这里是生产可查的埋点事件，
 *   两者目的不同，可以共存，不冲突）。
 */
import { trackEvent } from '@/lib/track'
import { envBase } from '@/lib/error-diagnostics'

/** 埋点 data 字段只接受标量且落库有长度限制，堆栈/消息统一截断，避免单条事件过大。 */
const MAX_MESSAGE_LEN = 500
const MAX_STACK_LEN = 1000

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value
}

function baseData(): Record<string, string | number | boolean> {
  const env = envBase()
  const data: Record<string, string | number | boolean> = {
    version: env.version,
    time: env.time,
  }
  if (env.page) data.page = env.page
  if (env.tenantId) data.tenant_id = env.tenantId
  if (env.build) data.build = env.build
  return data
}

/** ErrorBoundary.componentDidCatch 调用：上报 React 渲染期被兜住的报错。 */
export function reportClientRenderError(error: Error, componentStack?: string): void {
  const data = baseData()
  data.message = truncate(error.message || String(error), MAX_MESSAGE_LEN)
  if (error.stack) data.stack = truncate(error.stack, MAX_STACK_LEN)
  if (componentStack) data.component_stack = truncate(componentStack, MAX_STACK_LEN)
  trackEvent('client_error:render', data, { result: 'fail' })
}

function reportUncaught(event: ErrorEvent): void {
  // 跨域脚本的裸 "Script error."：无 message/stack/位置信息，上报了也无法排查，纯噪音，丢弃。
  if (event.message === 'Script error.' && !event.filename) return
  const data = baseData()
  data.message = truncate(event.message || 'unknown error', MAX_MESSAGE_LEN)
  const stack = event.error instanceof Error ? event.error.stack : undefined
  if (stack) data.stack = truncate(stack, MAX_STACK_LEN)
  if (event.filename) data.source = event.filename
  if (event.lineno) data.line = event.lineno
  if (event.colno) data.col = event.colno
  trackEvent('client_error:uncaught', data, { result: 'fail' })
}

function reportRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason
  const data = baseData()
  if (reason instanceof Error) {
    data.message = truncate(reason.message || String(reason), MAX_MESSAGE_LEN)
    if (reason.stack) data.stack = truncate(reason.stack, MAX_STACK_LEN)
  } else {
    data.message = truncate(String(reason), MAX_MESSAGE_LEN)
  }
  trackEvent('client_error:rejection', data, { result: 'fail' })
}

let installed = false

/**
 * 挂全局兜底：未被 ErrorBoundary/业务代码捕获的异常与 rejection 也能上报。
 * 只在 main.tsx 启动时调一次；重复调用是幂等的（不会挂两份监听器）。
 */
export function installGlobalClientErrorReporting(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', reportUncaught)
  window.addEventListener('unhandledrejection', reportRejection)
}
