/**
 * 日期与耗时格式化测试
 * 路由：全局
 * API：无
 */

import { describe, expect, it } from 'vitest'
import '@/i18n'
import { formatDuration, formatRelativeTime } from '@/lib/format-date'

describe('formatDuration', () => {
  it('毫秒小于一秒时保留 ms', () => {
    expect(formatDuration(350)).toBe('350ms')
  })

  it('毫秒达到一秒时转换为单小数秒', () => {
    expect(formatDuration(10697)).toBe('10.7s')
  })
})

// qa#491：common.json 里所有 key 实际嵌套在顶层 "common" 包裹对象下（跟 nav/header 等其他
// namespace 一致），i18n.t(key, {ns:'common'}) 若漏加 "common." 前缀，i18next 查不到会原样
// 吐回 key 字符串（如 "relativeTime.justNow"）而不是报错——只看返回值类型/是否为空发现不了，
// 必须显式断言真实译文，防止再犯同一类"裸 key 漏译"回归（另一起同类见 shared/modelgo_prd#380）。
describe('formatRelativeTime', () => {
  const minsAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()
  const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

  it('never leaks a raw i18n key', () => {
    expect(formatRelativeTime(minsAgo(5))).not.toContain('relativeTime.')
  })

  it('刚刚', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('刚刚')
  })

  it('X 分钟前', () => {
    expect(formatRelativeTime(minsAgo(5))).toBe('5 分钟前')
  })

  it('X 小时前', () => {
    expect(formatRelativeTime(hoursAgo(3))).toBe('3 小时前')
  })

  it('X 天前（< 一周）', () => {
    expect(formatRelativeTime(daysAgo(3))).toBe('3 天前')
  })

  it('X 周前', () => {
    expect(formatRelativeTime(daysAgo(14))).toBe('2 周前')
  })

  it('X 个月前', () => {
    expect(formatRelativeTime(daysAgo(60))).toBe('2 个月前')
  })

  it('空值返回 —', () => {
    expect(formatRelativeTime(null)).toBe('—')
    expect(formatRelativeTime(undefined)).toBe('—')
  })
})
