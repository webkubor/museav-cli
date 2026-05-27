import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ModelGoApiError } from '@/lib/request'

function logDevError(type: 'query' | 'mutation', error: unknown) {
  if (!import.meta.env.DEV) return
  const line =
    error instanceof ModelGoApiError
      ? `[${type}] code=${error.code} msg="${error.message}" requestId=${error.requestId ?? '-'}`
      : `[${type}] ${error instanceof Error ? error.message : String(error)}`
  fetch('/dev/log', { method: 'POST', body: line }).catch(() => {})
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => logDevError('query', error),
        }),
        mutationCache: new MutationCache({
          onError: (error) => logDevError('mutation', error),
        }),
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1 },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
