import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useCursorPager } from './use-cursor-pager'

describe('useCursorPager', () => {
  it('starts on page 1 with no cursor', () => {
    const { result } = renderHook(() => useCursorPager())
    expect(result.current.page).toBe(1)
    expect(result.current.cursor).toBeUndefined()
  })

  it('advances on next() and carries the cursor for the next page', () => {
    const { result } = renderHook(() => useCursorPager())
    act(() => result.current.next('c1'))
    expect(result.current.page).toBe(2)
    expect(result.current.cursor).toBe('c1')
    act(() => result.current.next('c2'))
    expect(result.current.page).toBe(3)
    expect(result.current.cursor).toBe('c2')
  })

  it('ignores a falsy next cursor (no further pages)', () => {
    const { result } = renderHook(() => useCursorPager())
    act(() => result.current.next(undefined))
    act(() => result.current.next(null))
    act(() => result.current.next(''))
    expect(result.current.page).toBe(1)
  })

  it('walks back with prev() and restores the page cursor', () => {
    const { result } = renderHook(() => useCursorPager())
    act(() => result.current.next('c1'))
    act(() => result.current.next('c2'))
    act(() => result.current.prev())
    expect(result.current.page).toBe(2)
    expect(result.current.cursor).toBe('c1')
    act(() => result.current.prev())
    expect(result.current.page).toBe(1)
    expect(result.current.cursor).toBeUndefined()
  })

  it('clamps prev() at page 1', () => {
    const { result } = renderHook(() => useCursorPager())
    act(() => result.current.prev())
    expect(result.current.page).toBe(1)
  })

  it('reset() returns to the first page', () => {
    const { result } = renderHook(() => useCursorPager())
    act(() => result.current.next('c1'))
    act(() => result.current.next('c2'))
    act(() => result.current.reset())
    expect(result.current.page).toBe(1)
    expect(result.current.cursor).toBeUndefined()
  })

  it('next() after prev() truncates the forward stack (re-paging from a back step)', () => {
    const { result } = renderHook(() => useCursorPager())
    act(() => result.current.next('c1')) // page 2
    act(() => result.current.next('c2')) // page 3
    act(() => result.current.prev()) // back to page 2
    act(() => result.current.next('c1b')) // re-page forward with a fresh cursor
    expect(result.current.page).toBe(3)
    expect(result.current.cursor).toBe('c1b')
  })
})
