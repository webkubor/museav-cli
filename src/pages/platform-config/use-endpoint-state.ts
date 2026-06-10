import { useState } from 'react'
import type { EndpointState } from './types'

export function useEndpointState() {
  const [states, setStates] = useState<Record<string, EndpointState>>({})

  const call = async (key: string, fn: () => Promise<unknown>) => {
    setStates((s) => ({ ...s, [key]: { status: 'loading', data: null, error: null, duration: null } }))
    const t0 = Date.now()
    try {
      const data = await fn()
      setStates((s) => ({ ...s, [key]: { status: 'success', data, error: null, duration: Date.now() - t0 } }))
    } catch (e) {
      setStates((s) => ({ ...s, [key]: { status: 'error', data: null, error: (e as Error).message, duration: Date.now() - t0 } }))
    }
  }

  return { states, call }
}
