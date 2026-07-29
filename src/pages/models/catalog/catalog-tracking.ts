/**
 * 模型广场列表页埋点分桶/diff 工具（PRD §10.2，qa#550）。
 * 纯函数，不依赖组件状态，方便单测；风格对齐 billing-tracking.ts 的分桶写法。
 */

/** 搜索词长度分桶，不上报真实搜索词内容 */
export function queryLengthBucket(q: string): string {
  const len = q.trim().length
  if (len <= 0) return '0'
  if (len <= 3) return '1-3'
  if (len <= 8) return '4-8'
  if (len <= 20) return '9-20'
  return '>20'
}

export type FilterAction = 'select' | 'clear' | 'add' | 'remove'

export interface FilterChange {
  filter_name: string
  filter_value: string
  action: FilterAction
}

/**
 * 对比两次 `selected` 筛选 chip 数组（用 `dim:value` 编码），得出本次变化的
 * 筛选维度/值/动作。
 *
 * - 单选维度（vendor/modality/protocol/ctx/price/promo）是替换式：一项加一项减
 *   视为「选中新值」（action=select）；只减不加视为「清除该维度」（action=clear）。
 * - 多选维度（tag）是追加/移除式：只加视为 add，只减视为 remove。
 *
 * 假设每次只变化一项 —— 侧栏/卡片的点击操作本身如此；「清空筛选」批量清空由调用方
 * 走 marketplace_filters_cleared 单独上报，不复用本函数。
 */
export function diffFilterChange(prev: string[], next: string[]): FilterChange | null {
  const prevSet = new Set(prev)
  const nextSet = new Set(next)
  const added = next.find((k) => !prevSet.has(k))
  const removed = prev.find((k) => !nextSet.has(k))

  if (added && removed) {
    const [dim, value] = added.split(':')
    return { filter_name: dim, filter_value: value ?? '', action: 'select' }
  }
  if (added) {
    const [dim, value] = added.split(':')
    return { filter_name: dim, filter_value: value ?? '', action: dim === 'tag' ? 'add' : 'select' }
  }
  if (removed) {
    const [dim, value] = removed.split(':')
    return { filter_name: dim, filter_value: value ?? '', action: dim === 'tag' ? 'remove' : 'clear' }
  }
  return null
}

/** filter_summary：无结果时上报当前生效的筛选维度列表（不含具体值，避免和 filter_changed 的 value 重复暴露） */
export function buildFilterSummary(selected: string[]): string {
  if (selected.length === 0) return 'none'
  const dims = Array.from(new Set(selected.map((k) => k.split(':')[0])))
  return dims.join(',')
}
