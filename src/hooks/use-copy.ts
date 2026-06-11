import { useState, useCallback } from 'react'

/**
 * 写入剪贴板，带兜底。
 * navigator.clipboard 仅在安全上下文（https / localhost）可用，
 * 非安全上下文 / 权限被拒 / 老浏览器会抛错——此时回退到 textarea + execCommand。
 */
async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 落到下方 execCommand 兜底
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function useCopy(resetMs = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text: string): Promise<boolean> => {
    const ok = await writeClipboard(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), resetMs)
    }
    return ok
  }, [resetMs])

  return { copy, copied }
}
