export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  description?: string
  duration: number
}

type Listener = (toasts: ToastItem[]) => void

let items: ToastItem[] = []
const listeners = new Set<Listener>()

function notify() {
  const snapshot = [...items]
  listeners.forEach((l) => l(snapshot))
}

const MAX_TOASTS = 3

function add(type: ToastType, title: string, description?: string, duration = 4000): string {
  // 相同 type + title 已存在则不重复弹
  const existing = items.find((t) => t.type === type && t.title === title)
  if (existing) return existing.id

  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const next = [...items, { id, type, title, description, duration }]
  // 超出上限时移除最早的
  items = next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next
  notify()
  return id
}

export function dismiss(id: string) {
  items = items.filter((t) => t.id !== id)
  notify()
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const toast = {
  success: (title: string, description?: string) => add('success', title, description),
  error: (title: string, description?: string) => add('error', title, description),
  warning: (title: string, description?: string) => add('warning', title, description),
  info: (title: string, description?: string) => add('info', title, description),
}
