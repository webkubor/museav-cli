import { useState, useCallback } from 'react'
import copy from 'copy-to-clipboard'

/**
 * 复制到剪贴板 hook。
 * 底层用 copy-to-clipboard（成熟库，内置 IE/Safari/非安全上下文等全套兼容兜底），
 * 本 hook 只负责统一接口 + copied 反馈状态。
 */
export function useCopy(resetMs = 2000) {
  const [copied, setCopied] = useState(false)

  const copyText = useCallback(async (text: string): Promise<boolean> => {
    const ok = await copy(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), resetMs)
    }
    return ok
  }, [resetMs])

  return { copy: copyText, copied }
}
