import { toast as sonnerToast } from 'sonner'

// 相同 type+content 防重复
const recentKeys = new Set<string>()

function dedup(key: string, ttl = 4000): boolean {
  if (recentKeys.has(key)) return true
  recentKeys.add(key)
  setTimeout(() => recentKeys.delete(key), ttl)
  return false
}

function formattedContent(description?: string) {
  return {
    description: description || undefined,
  }
}

export const toast = {
  success(title: string, description?: string) {
    const key = `success:${title}`
    if (dedup(key)) return
    sonnerToast.success(title, formattedContent(description))
  },
  error(title: string, description?: string) {
    const key = `error:${title}`
    if (dedup(key)) return
    sonnerToast.error(title, formattedContent(description))
  },
  warning(title: string, description?: string) {
    const key = `warning:${title}`
    if (dedup(key)) return
    sonnerToast.warning(title, formattedContent(description))
  },
  info(title: string, description?: string) {
    const key = `info:${title}`
    if (dedup(key)) return
    sonnerToast.info(title, formattedContent(description))
  },
}
