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

interface ToastErrorOptions {
  /** toast 内联操作按钮，如「复制详情」 */
  action?: { label: string; onClick: () => void }
  /** 覆盖默认去重 key（默认 `error:${title}`）。服务端错误用 request_id 去重，避免同标题不同请求被吞掉 */
  dedupKey?: string
}

export const toast = {
  success(title: string, description?: string) {
    const key = `success:${title}`
    if (dedup(key)) return
    sonnerToast.success(title, formattedContent(description))
  },
  error(title: string, description?: string, options?: ToastErrorOptions) {
    const key = options?.dedupKey ?? `error:${title}`
    if (dedup(key)) return
    sonnerToast.error(title, {
      description: description || undefined,
      action: options?.action,
    })
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
