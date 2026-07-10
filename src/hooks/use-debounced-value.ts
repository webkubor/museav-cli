import { useEffect, useState } from 'react'

/**
 * 防抖值：输入频繁变化（如搜索框每次按键）时，只在停止变化 delay 毫秒后才更新返回值。
 * 用于把高频状态接到查询 key，避免每次按键都触发请求。
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
