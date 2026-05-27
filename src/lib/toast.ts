import { Toast } from '@douyinfe/semi-ui'

const DURATION_S = 4 // Semi UI 用秒

// 相同 type+content 防重复
const recentKeys = new Set<string>()

function dedup(key: string, ttl = 4000): boolean {
  if (recentKeys.has(key)) return true
  recentKeys.add(key)
  setTimeout(() => recentKeys.delete(key), ttl)
  return false
}

function semiContent(title: string, description?: string) {
  if (!description) return title
  return `${title}\n${description}`
}

export const toast = {
  success(title: string, description?: string) {
    const key = `success:${title}`
    if (dedup(key)) return
    Toast.success({ content: semiContent(title, description), duration: DURATION_S })
  },
  error(title: string, description?: string) {
    const key = `error:${title}`
    if (dedup(key)) return
    Toast.error({ content: semiContent(title, description), duration: DURATION_S })
  },
  warning(title: string, description?: string) {
    const key = `warning:${title}`
    if (dedup(key)) return
    Toast.warning({ content: semiContent(title, description), duration: DURATION_S })
  },
  info(title: string, description?: string) {
    const key = `info:${title}`
    if (dedup(key)) return
    Toast.info({ content: semiContent(title, description), duration: DURATION_S })
  },
}
