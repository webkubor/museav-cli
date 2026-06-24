/**
 * 登录注册前端拦截工具层
 * 路由：/login、/signup
 * API 来源：无；只在请求发出前做本地失败冷却判断
 */

import { storageKeys } from '@/lib/storage'

/** 前端拦截覆盖的鉴权动作。 */
export type AuthGuardAction = 'login-email' | 'login-password' | 'signup' | 'signup-code'

/** UI 层需要呈现的拦截状态。 */
export type AuthGuardUiState = 'idle' | 'cooldown' | 'blocked'

/** 前端拦截原因，只用于本地分支，不直接展示给用户。 */
export type AuthGuardReason = 'cooldown'

/** 前端拦截输入。 */
export interface AuthGuardInput {
  /** 当前鉴权动作。 */
  action: AuthGuardAction
  /** 用户标识，通常是邮箱；仅用于生成本地哈希 scope，不明文进入 key。 */
  subject: string
  /** 当前时间，测试可注入。 */
  now?: number
}

/** 前端拦截判断结果。 */
export interface AuthGuardDecision {
  /** 是否允许继续请求后端。 */
  allowed: boolean
  /** UI 层展示状态。 */
  uiState: AuthGuardUiState
  /** 通用提示文案。 */
  message?: string
  /** 需要等待的毫秒数。 */
  retryAfterMs?: number
  /** 拦截原因。 */
  reason?: AuthGuardReason
}

interface GuardState {
  failures: number
  blockedUntil: number
}

const FAILURE_THRESHOLD = 3
const FIRST_COOLDOWN_MS = 30_000
const MAX_COOLDOWN_MS = 5 * 60_000

function currentTime(now?: number): number {
  return now ?? Date.now()
}

function normalizeSubject(subject: string): string {
  return subject.trim().toLowerCase() || 'anonymous'
}

function hashSubject(subject: string): string {
  let hash = 2_166_136_261
  for (const char of normalizeSubject(subject)) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

function guardStorageKey(action: AuthGuardAction, subject: string): string {
  return storageKeys.authGuard(`${action}:${hashSubject(subject)}`)
}

function readState(action: AuthGuardAction, subject: string): GuardState {
  if (typeof window === 'undefined') return { failures: 0, blockedUntil: 0 }

  const raw = window.localStorage.getItem(guardStorageKey(action, subject))
  if (!raw) return { failures: 0, blockedUntil: 0 }

  try {
    const parsed = JSON.parse(raw) as Partial<GuardState>
    return {
      failures: typeof parsed.failures === 'number' ? parsed.failures : 0,
      blockedUntil: typeof parsed.blockedUntil === 'number' ? parsed.blockedUntil : 0,
    }
  } catch {
    window.localStorage.removeItem(guardStorageKey(action, subject))
    return { failures: 0, blockedUntil: 0 }
  }
}

function writeState(action: AuthGuardAction, subject: string, state: GuardState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(guardStorageKey(action, subject), JSON.stringify(state))
}

function cooldownMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return `操作过于频繁，请稍后等待 ${seconds} 秒后重试。`
}

function cooldownForFailures(failures: number): number {
  if (failures < FAILURE_THRESHOLD) return 0
  const exponent = failures - FAILURE_THRESHOLD
  return Math.min(FIRST_COOLDOWN_MS * 2 ** exponent, MAX_COOLDOWN_MS)
}

/** 检查当前鉴权动作是否允许提交到后端。 */
export function checkAuthGuard(input: AuthGuardInput): AuthGuardDecision {
  const now = currentTime(input.now)

  const state = readState(input.action, input.subject)
  if (state.blockedUntil > now) {
    const retryAfterMs = state.blockedUntil - now
    return {
      allowed: false,
      uiState: 'cooldown',
      message: cooldownMessage(retryAfterMs),
      retryAfterMs,
      reason: 'cooldown',
    }
  }

  return { allowed: true, uiState: 'idle' }
}

/** 记录一次失败，用于触发本地递增冷却。 */
export function recordAuthGuardFailure(input: Pick<AuthGuardInput, 'action' | 'subject' | 'now'>): void {
  const now = currentTime(input.now)
  const state = readState(input.action, input.subject)
  const failures = state.failures + 1
  const cooldownMs = cooldownForFailures(failures)

  writeState(input.action, input.subject, {
    failures,
    blockedUntil: cooldownMs > 0 ? now + cooldownMs : state.blockedUntil,
  })
}

/** 读取某动作 + 主体当前的连续失败次数（只读，不改状态）。按 subject(邮箱) 各自计数。 */
export function getAuthGuardFailures(input: Pick<AuthGuardInput, 'action' | 'subject'>): number {
  return readState(input.action, input.subject).failures
}

/** 清除本地失败状态，通常在后端鉴权成功后调用。 */
export function clearAuthGuard(input: Pick<AuthGuardInput, 'action' | 'subject'>): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(guardStorageKey(input.action, input.subject))
}
