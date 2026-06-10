import { useState, useCallback } from 'react'

export function useCopy(resetMs = 2000) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), resetMs)
      return true
    } catch {
      return false
    }
  }, [resetMs])

  return { copy, copied }
}
