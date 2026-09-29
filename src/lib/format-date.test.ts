/**
 * 日期与耗时格式化测试
 * 路由：全局
 * API：无
 */

import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { formatDuration, formatMonthDayTime, formatRelativeTime } from '@/lib/format-date'

// 故意选一个和开发机（多为 Asia/Shanghai）、CI（多为 UTC）都不同的时区，
// 漏传 timeZone 时输出才会变、测试才会红。
vi.mock('@/lib/timezone', () => ({ resolveTimeZone: () => 'America/New_York' }))

describe('formatDuration', () => {
  it('毫秒小于一秒时保留 ms', () => {
    expect(formatDuration(350)).toBe('350ms')
  })

  it('毫秒达到一秒时转换为单小数秒', () => {
    expect(formatDuration(10697)).toBe('10.7s')
  })

  // 2026-08-19 线上事故：/model-logs/summary 的 avg_ttft_ms 是聚合浮点，毫秒分支
  // 当时直接模板拼接，调用日志 Summary 把「首 Token」显示成 323.90376406674426ms。
  it('聚合来的浮点毫秒必须取整 —— 别把 323.90376406674426ms 吐到页面上', () => {
    expect(formatDuration(323.90376406674426)).toBe('324ms')
    expect(formatDuration(199.90057778262292)).toBe('200ms')
    expect(formatDuration(0.4)).toBe('0ms')
  })

  it('秒档的浮点由 toFixed(1) 收敛，不受影响', () => {
    expect(formatDuration(1274.764935458457)).toBe('1.3s')
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

describe('formatMonthDayTime', () => {
  it('按用户显示时区输出固定 MM-DD HH:mm（跨零点也换日）', () => {
    // 纽约 9 月是 EDT（UTC-4）：02:05Z 是前一天 22:05
    expect(formatMonthDayTime('2026-09-24T02:05:00Z')).toBe('09-23 22:05')
    // 午夜走 h23，不能写成 24:05
    expect(formatMonthDayTime('2026-09-24T04:05:00Z')).toBe('09-24 00:05')
  })

  it('空值与非法值兜底为破折号', () => {
    expect(formatMonthDayTime(undefined)).toBe('—')
    expect(formatMonthDayTime('not-a-date')).toBe('—')
  })
})
