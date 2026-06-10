import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'

const SWAGGER_URL = 'https://modelgo-web-api.test.modelgo.com/swagger/doc.json'

interface FlatEndpoint {
  method: string
  path: string
  summary: string
  description: string
  parameters: string
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  POST: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  PUT: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  PATCH: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  DELETE: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
}

function flattenSpec(spec: Record<string, unknown>): FlatEndpoint[] {
  const result: FlatEndpoint[] = []
  const paths = (spec?.paths ?? {}) as Record<string, Record<string, Record<string, unknown>>>
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        result.push({
          method: method.toUpperCase(),
          path,
          summary: (op.summary as string) || '',
          description: (op.description as string) || '',
          parameters: ((op.parameters ?? []) as Array<{ name: string }>).map((p) => p.name).join(', '),
        })
      }
    }
  }
  return result
}

export function SwaggerPanel() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['swagger-spec'],
    queryFn: () => fetch(SWAGGER_URL).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return r.json() as Promise<Record<string, unknown>>
    }),
    staleTime: 5 * 60_000,
  })
  const [search, setSearch] = useState('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const endpoints = useMemo(() => (data ? flattenSpec(data) : []), [data])

  const filtered = useMemo(() => {
    if (!search.trim()) return endpoints
    const q = search.toLowerCase()
    return endpoints.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.parameters.toLowerCase().includes(q) ||
        e.method.includes(q),
    )
  }, [endpoints, search])

  const info = data?.info as Record<string, string> | undefined
  const version = info?.version ?? ''
  const title = info?.title ?? 'Swagger API Spec'

  if (isLoading) {
    return (
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
          <div className="text-sm font-bold text-mg-text-0">Swagger API Spec</div>
          <div className="text-[11px] text-mg-text-2 mt-0.5 font-mono">{SWAGGER_URL}</div>
        </div>
        <div className="py-16 flex justify-center items-center">
          <div className="w-6 h-6 border-2 border-mg-border border-t-brand-base rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40">
          <div className="text-sm font-bold text-mg-text-0">Swagger API Spec</div>
          <div className="text-[11px] text-mg-text-2 mt-0.5 font-mono">{SWAGGER_URL}</div>
        </div>
        <div className="px-5 py-8 flex flex-col items-center gap-3 text-center">
          <span className="text-xs text-rose-500 font-semibold">加载失败：{(error as Error).message}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>重试</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="card-shadow-adaptive border border-mg-border bg-card-bg rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-mg-border bg-mg-bg-1/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-mg-text-0">{title}</span>
          {version && (
            <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border border-brand-base/20 bg-brand-base/5 text-brand-base">
              v{version}
            </span>
          )}
        </div>
        <a
          href={SWAGGER_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-mono text-mg-text-2 hover:text-brand-base transition-colors"
        >
          {SWAGGER_URL}
        </a>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索接口路径、描述、参数..."
            className="flex-1 h-9 px-4 text-xs rounded-lg border border-mg-border bg-mg-bg-0 text-mg-text-0 placeholder:text-mg-text-3 outline-none focus:border-brand-base/40 transition-colors font-mono"
          />
          <span className="text-[11px] text-mg-text-2 shrink-0 tabular-nums">{filtered.length} / {endpoints.length}</span>
        </div>

        <div className="border border-mg-border rounded-xl overflow-hidden divide-y divide-mg-border/40">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-mg-text-2">无匹配接口</div>
          ) : (
            filtered.map((ep) => {
              const idx = endpoints.indexOf(ep)
              const isExpanded = expandedIdx === idx
              return (
                <div key={`${ep.method}-${ep.path}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-mg-fill-0/40 transition-colors cursor-pointer"
                  >
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono shrink-0 select-none border ${METHOD_COLORS[ep.method] ?? 'bg-mg-fill-0 text-mg-text-2 border-mg-border'}`}>
                      {ep.method}
                    </span>
                    <code className="text-[11px] font-mono text-mg-text-0 flex-1 truncate">{ep.path}</code>
                    {ep.summary && <span className="text-[11px] text-mg-text-2 truncate max-w-[300px]">{ep.summary}</span>}
                  </button>
                  {isExpanded && (
                    <div className="px-5 py-3 bg-mg-bg-1/30 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-150">
                      {ep.summary && (
                        <div className="text-xs text-mg-text-0 font-semibold">{ep.summary}</div>
                      )}
                      {ep.description && (
                        <div className="text-[11px] text-mg-text-2 leading-relaxed">{ep.description}</div>
                      )}
                      {ep.parameters && (
                        <div className="text-[11px] text-mg-text-1">
                          <span className="text-mg-text-2 font-bold">参数：</span>
                          <code className="font-mono">{ep.parameters}</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
