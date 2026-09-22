import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSupportSessionId, getOrCreateSupportSessionId } from './session-id'
import { storageKeys } from '@/lib/storage'

describe('support session-id（#1057 会话持久化）', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('首次调用生成 cs-<uuid> 并写入 localStorage', () => {
    const id = getOrCreateSupportSessionId()
    expect(id).toMatch(/^cs-/)
    // 已落盘：满足「刷新/重开保留」的存储前提
    expect(localStorage.getItem(storageKeys.csConversationId())).toBe(id)
  })

  it('同一会话内重复调用返回稳定同一 id（多轮续问不换会话）', () => {
    const first = getOrCreateSupportSessionId()
    const second = getOrCreateSupportSessionId()
    expect(second).toBe(first)
  })

  it('模拟刷新（重新读取）仍拿到同一 id', () => {
    const before = getOrCreateSupportSessionId()
    // 不清 localStorage，等价于刷新后重新进入
    const afterReload = getOrCreateSupportSessionId()
    expect(afterReload).toBe(before)
  })

  it('清除后再取会生成新的 id（切账号/新会话）', () => {
    const first = getOrCreateSupportSessionId()
    clearSupportSessionId()
    expect(localStorage.getItem(storageKeys.csConversationId())).toBeNull()
    const second = getOrCreateSupportSessionId()
    expect(second).not.toBe(first)
    expect(second).toMatch(/^cs-/)
  })
})
