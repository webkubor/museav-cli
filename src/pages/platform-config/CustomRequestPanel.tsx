import { useState } from 'react'
import { apiBaseUrl } from '@/lib/request'
import type { EndpointState } from './types'

export function CustomRequestPanel() {
  const [method, setMethod] = useState<'GET' | 'POST'>('GET')
  const [url, setUrl] = useState('')
  const [state, setState] = useState<EndpointState>({ status: 'idle', data: null, error: null, duration: null })

  async function handleSend() {
    if (!url.trim()) return
    const resolved = url.startsWith('http') ? url : `${apiBaseUrl()}${url.startsWith('/') ? '' : '/'}${url}`
    setState({ status: 'loading', data: null, error: null, duration: null })
    const t0 = Date.now()
    try {
      const res = await fetch(resolved, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => res.text())
      setState({ status: 'success', data, error: null, duration: Date.now() - t0 })
    } catch (e) {
      setState({ status: 'error', data: null, error: (e as Error).message, duration: Date.now() - t0 })
    }
  }

  return (
    <div className="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border overflow-hidden mb-6">
      <div className="flex items-center gap-2 p-3 border-b border-mg-border/40 bg-mg-bg-1/30">
        {(['GET', 'POST'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={[
              'text-[11px] font-bold font-mono px-2.5 py-1 rounded-md border transition-all duration-150 shrink-0',
              method === m
                ? m === 'GET'
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-500'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                : 'border-mg-border text-mg-text-3 hover:border-mg-border/80',
            ].join(' ')}
          >
            {m}
          </button>
        ))}

        <input
          className="flex-1 bg-transparent text-sm font-mono text-mg-text-1 placeholder:text-mg-text-3/60 outline-none border-none min-w-0"
          placeholder="粘贴路径或完整 URL，例如 /api/v1/auth/session"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
          spellCheck={false}
        />

        {state.duration != null && (
          <span className="text-[10px] font-mono text-mg-text-3 shrink-0">{state.duration}ms</span>
        )}

        <button
          type="button"
          onClick={handleSend}
          disabled={state.status === 'loading' || !url.trim()}
          className="shrink-0 px-4 h-8 rounded-lg text-xs font-bold bg-brand-base text-white hover:bg-brand-deep transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state.status === 'loading' ? '...' : 'Send'}
        </button>
      </div>

      {state.status === 'success' && (
        <div className="relative bg-mg-code-bg overflow-hidden">
          <div className="absolute top-3 right-3 text-[10px] font-bold text-mg-success bg-mg-success/10 border border-mg-success/20 px-2 py-0.5 rounded-sm z-10">
            OK
          </div>
          <pre className="m-0 p-5 text-xs font-mono text-mg-text-2 overflow-auto max-h-[400px] w-full min-w-0 leading-relaxed select-all">
            {JSON.stringify(state.data, null, 2)}
          </pre>
        </div>
      )}
      {state.status === 'error' && (
        <div className="px-5 py-3.5 bg-rose-500/5 border-t border-rose-500/10 flex items-center gap-3">
          <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-sm">ERROR</span>
          <span className="text-xs font-mono text-rose-500 break-all">{state.error}</span>
        </div>
      )}
    </div>
  )
}
