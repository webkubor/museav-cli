/**
 * 智能客服会话标识（session_id）的持久化读取（shared/modelgo_prd#1057）。
 *
 * #1057 要求 /support/ask 携带稳定且本地持久化的 session_id：刷新 / 再次打开需保留，
 * 否则后端无法记住「已澄清」，多轮续问与「最多澄清一次」都会失效。
 *
 * 复用 storageKeys.csConversationId（key = mg:cs_cid，app 全局）——该 key 早已在
 * 登出 / 切账号时清除（use-support.ts、store/auth.ts），只差生成与写入这一环。
 */

import { storageKeys } from '@/lib/storage'

/** 生成新的会话 id，格式 cs-<uuid>（对齐 #1057 示例 `cs-<uuid>`）。 */
function newSessionId(): string {
  return `cs-${crypto.randomUUID()}`
}

/**
 * 取当前持久化的会话 id；不存在则生成并写入 localStorage 后返回。
 * 隐私模式等 localStorage 不可用时降级为进程内一次性 id（当次可用，不影响功能）。
 */
export function getOrCreateSupportSessionId(): string {
  try {
    const key = storageKeys.csConversationId()
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const created = newSessionId()
    localStorage.setItem(key, created)
    return created
  } catch {
    // localStorage 不可用（隐私模式）：本次会话仍给一个稳定 id，不落盘。
    return newSessionId()
  }
}

/** 清除当前会话 id（用于「新会话」/ 登出 / 切账号）。 */
export function clearSupportSessionId(): void {
  try {
    localStorage.removeItem(storageKeys.csConversationId())
  } catch {
    /* ignore */
  }
}
