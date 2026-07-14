/**
 * 日期与耗时格式化测试
 * 路由：全局
 * API：无
 */

import { describe, expect, it } from 'vitest'
import { formatDuration } from '@/lib/format-date'

describe('formatDuration', () => {
  it('毫秒小于一秒时保留 ms', () => {
    expect(formatDuration(350)).toBe('350ms')
  })

  it('毫秒达到一秒时转换为单小数秒', () => {
    expect(formatDuration(10697)).toBe('10.7s')
  })
})
