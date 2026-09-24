/**
 * 版本比对的边界（qa#741）。核心约束是：宁可不提示，也不能因为拿不到数据
 * 就一直弹更新提示 —— 无 git 环境构建时 __BUILD_COMMIT__ 会是空串，
 * version.json 也可能没带 commit 字段。
 */
import { describe, expect, it } from 'vitest'
import { getRefreshAction, hasNewVersion } from './version-check'

describe('hasNewVersion', () => {
  it('版本一致时不提示', () => {
    expect(hasNewVersion('abc1234', 'abc1234')).toBe(false)
  })

  it('版本不同才提示', () => {
    expect(hasNewVersion('def5678', 'abc1234')).toBe(true)
  })

  it('线上没返回 commit 时不提示', () => {
    expect(hasNewVersion(undefined, 'abc1234')).toBe(false)
    expect(hasNewVersion('', 'abc1234')).toBe(false)
  })

  it('本地构建没有 commit（无 git 环境）时不提示', () => {
    expect(hasNewVersion('def5678', '')).toBe(false)
  })

  it('两侧都拿不到时不提示', () => {
    expect(hasNewVersion(undefined, '')).toBe(false)
  })
})

describe('getRefreshAction', () => {
  it('发现新版且尚未尝试时自动刷新', () => {
    expect(getRefreshAction('def5678', 'abc1234', null)).toBe('refresh')
  })

  it('相同新版已经刷新过时停止重试', () => {
    expect(getRefreshAction('def5678', 'abc1234', 'def5678', 'reload')).toBe('already-attempted')
  })

  it('复制标签页继承标记但不是 reload 导航时仍自动刷新', () => {
    expect(getRefreshAction('def5678', 'abc1234', 'def5678', 'navigate')).toBe('refresh')
  })

  it('无法识别导航类型时保守停止重试', () => {
    expect(getRefreshAction('def5678', 'abc1234', 'def5678', undefined)).toBe('already-attempted')
    expect(getRefreshAction('def5678', 'abc1234', 'def5678', '')).toBe('already-attempted')
    expect(getRefreshAction('def5678', 'abc1234', 'def5678', 'future-type')).toBe('already-attempted')
  })

  it('当前版本已更新时不再刷新', () => {
    expect(getRefreshAction('abc1234', 'abc1234', 'def5678')).toBe('none')
  })
})
