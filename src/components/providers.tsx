import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { isMswEnabled } from '@/lib/msw-runtime'

import { ModelGoApiError } from '@/lib/request'

let mswStartPromise: Promise<unknown> | null = null

async function startMsw() {
  if (import.meta.env.PROD || !isMswEnabled()) return
  if (mswStartPromise) return mswStartPromise
  mswStartPromise = import('@/mocks/browser').then(({ worker }) =>
    worker.start({ onUnhandledRequest: 'bypass', quiet: true })
  )
  return mswStartPromise
}

function logDevError(type: 'query' | 'mutation', error: unknown) {
  if (!import.meta.env.DEV) return
  const prefix = isMswEnabled() ? '[mock]' : '[test]'
  const line =
    error instanceof ModelGoApiError
      ? `${prefix}[${type}] code=${error.code} msg="${error.message}" requestId=${error.requestId ?? '-'}`
      : `${prefix}[${type}] ${error instanceof Error ? error.message : String(error)}`
  fetch('/dev/log', { method: 'POST', body: line }).catch(() => {})
}

function showRequestError(type: 'query' | 'mutation', error: unknown) {
  void logDevError(type, error)
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => showRequestError('query', error),
        }),
        mutationCache: new MutationCache({
          onError: (error) => showRequestError('mutation', error),
        }),
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1 },
        },
      })
  )
  const [mswReady, setMswReady] = useState(import.meta.env.PROD || !isMswEnabled())

  useEffect(() => {
    if (import.meta.env.PROD || !isMswEnabled()) return

    let mounted = true
    startMsw().then(() => {
      if (mounted) setMswReady(true)
    })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {mswReady ? (
        children
      ) : (
        <div style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb'
        }}>
          <div style={{
            height: '24px',
            width: '24px',
            borderRadius: '50%',
            border: '2px solid #e5e7eb',
            borderTopColor: '#4b5563',
            animation: 'spin 1s linear infinite'
          }} />
        </div>
      )}
    </QueryClientProvider>
  )
}
