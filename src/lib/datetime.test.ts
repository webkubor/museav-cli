import { afterEach, describe, expect, it, vi } from 'vitest'
import { addFromNowISO, endOfLocalDayISO, nowISO, startOfLocalDayISO } from './datetime'

describe('startOfLocalDayISO / endOfLocalDayISO — 在指定时区构造当天起止边界', () => {
  it('Asia/Shanghai (UTC+8)：当天起止换算成 UTC', () => {
    expect(startOfLocalDayISO('2026-06-30', 'Asia/Shanghai')).toBe('2026-06-29T16:00:00.000Z')
    expect(endOfLocalDayISO('2026-06-30', 'Asia/Shanghai')).toBe('2026-06-30T15:59:59.999Z')
  })

  it('America/New_York (夏令时 UTC-4)：同一日历日落在不同的 UTC 区间', () => {
    expect(startOfLocalDayISO('2026-06-30', 'America/New_York')).toBe('2026-06-30T04:00:00.000Z')
    expect(endOfLocalDayISO('2026-06-30', 'America/New_York')).toBe('2026-07-01T03:59:59.999Z')
  })

  it('UTC：边界即零点与当天最后一毫秒', () => {
    expect(startOfLocalDayISO('2026-06-30', 'UTC')).toBe('2026-06-30T00:00:00.000Z')
    expect(endOfLocalDayISO('2026-06-30', 'UTC')).toBe('2026-06-30T23:59:59.999Z')
  })

  it('时区敏感性：同一截止日，上海与纽约算出的 UTC 边界必然不同', () => {
    // 这正是手搓 new Date() 修不掉的点 —— 边界必须随用户显示时区变化
    expect(endOfLocalDayISO('2026-06-30', 'Asia/Shanghai')).not.toBe(
      endOfLocalDayISO('2026-06-30', 'America/New_York'),
    )
  })
})

describe('addFromNowISO / nowISO — 瞬时点偏移（不依赖时区）', () => {
  afterEach(() => vi.useRealTimers())

  it('从当前时刻按 unit 前后偏移', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-25T00:00:00.000Z'))
    expect(nowISO()).toBe('2026-06-25T00:00:00.000Z')
    expect(addFromNowISO(7, 'day')).toBe('2026-07-02T00:00:00.000Z')
    expect(addFromNowISO(1, 'hour')).toBe('2026-06-25T01:00:00.000Z')
    expect(addFromNowISO(-30, 'day')).toBe('2026-05-26T00:00:00.000Z')
  })
})
