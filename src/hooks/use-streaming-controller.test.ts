import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStreamingController, isAbortError } from './use-streaming-controller'

describe('useStreamingController', () => {
  it('begin 返回未中断的 signal，abort 后置为已中断', () => {
    const { result } = renderHook(() => useStreamingController())
    let signal!: AbortSignal
    act(() => { signal = result.current.begin() })
    expect(signal.aborted).toBe(false)
    expect(result.current.isActive()).toBe(true)

    act(() => result.current.abort())
    expect(signal.aborted).toBe(true)
    expect(result.current.isActive()).toBe(false)
  })

  it('同一 key 再次 begin 会掐掉上一次', () => {
    const { result } = renderHook(() => useStreamingController())
    let first!: AbortSignal
    let second!: AbortSignal
    act(() => { first = result.current.begin() })
    act(() => { second = result.current.begin() })
    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
  })

  it('不同 key 互不影响（对比页按列）', () => {
    const { result } = renderHook(() => useStreamingController<number>())
    let col0!: AbortSignal
    let col1!: AbortSignal
    act(() => { col0 = result.current.begin(0) })
    act(() => { col1 = result.current.begin(1) })

    act(() => result.current.abort(0))
    expect(col0.aborted).toBe(true)
    expect(col1.aborted).toBe(false)
    expect(result.current.isActive(1)).toBe(true)
  })

  it('abortAll 掐掉全部在途请求', () => {
    const { result } = renderHook(() => useStreamingController<number>())
    let col0!: AbortSignal
    let col1!: AbortSignal
    act(() => { col0 = result.current.begin(0) })
    act(() => { col1 = result.current.begin(1) })

    act(() => result.current.abortAll())
    expect(col0.aborted).toBe(true)
    expect(col1.aborted).toBe(true)
    expect(result.current.isActive(0)).toBe(false)
  })

  it('卸载时自动中断在途请求', () => {
    const { result, unmount } = renderHook(() => useStreamingController())
    let signal!: AbortSignal
    act(() => { signal = result.current.begin() })
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it('abort 一个没有在途请求的 key 不报错', () => {
    const { result } = renderHook(() => useStreamingController<number>())
    expect(() => act(() => result.current.abort(3))).not.toThrow()
  })
})

describe('isAbortError', () => {
  it('识别 AbortController 抛出的中断错误', () => {
    const controller = new AbortController()
    controller.abort()
    expect(isAbortError(controller.signal.reason)).toBe(true)
  })

  it('普通错误与空值不算中断', () => {
    expect(isAbortError(new Error('网络异常'))).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})
