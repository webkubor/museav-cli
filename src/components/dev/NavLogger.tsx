import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

function sendNavLog(from: string, to: string) {
  const payload = JSON.stringify({ kind: 'nav', from, to })
  const blob = new Blob([payload], { type: 'application/json' })
  if (navigator.sendBeacon?.('/dev/log', blob)) return
  fetch('/dev/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }).catch(() => {})
}

export function NavLogger() {
  const location = useLocation()
  const prevRef = useRef<string>('')

  useEffect(() => {
    const to = `${location.pathname}${location.search}${location.hash}`
    const from = prevRef.current
    if (to !== from) {
      sendNavLog(from, to)
      prevRef.current = to
    }
  }, [location])

  return null
}
