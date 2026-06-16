import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useClientPage, RECORD_PAGE_SIZE } from './use-client-page'

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

describe('useClientPage', () => {
  it('slices to the default page size and reports totals', () => {
    const { result } = renderHook(() => useClientPage(range(23)))
    expect(result.current.pageSize).toBe(RECORD_PAGE_SIZE) // 10
    expect(result.current.total).toBe(23)
    expect(result.current.page).toBe(1)
    expect(result.current.paged).toEqual(range(10)) // 0..9
  })

  it('pages forward to the partial last page', () => {
    const { result } = renderHook(() => useClientPage(range(23)))
    act(() => result.current.setPage(3))
    expect(result.current.page).toBe(3)
    expect(result.current.paged).toEqual([20, 21, 22])
  })

  it('clamps the page when the dataset shrinks below the current page', () => {
    let data = range(23)
    const { result, rerender } = renderHook(() => useClientPage(data))
    act(() => result.current.setPage(3))
    expect(result.current.page).toBe(3)

    data = range(8) // dataset shrank to a single page (org switch / refetch)
    rerender()
    expect(result.current.page).toBe(1) // clamped, never over-slices
    expect(result.current.paged).toEqual(range(8))
  })

  it('honors a custom page size', () => {
    const { result } = renderHook(() => useClientPage(range(10), 4))
    expect(result.current.pageSize).toBe(4)
    expect(result.current.paged).toEqual([0, 1, 2, 3])
  })
})
