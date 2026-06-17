import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { EndpointDef, EndpointState } from './types'

interface EndpointCardProps {
  def: EndpointDef
  state: EndpointState | undefined
  onCall: () => void
}

export function EndpointCard({ def, state, onCall }: EndpointCardProps) {
  const { t } = useTranslation()

  return (
    <div className="card-shadow-adaptive bg-card-bg rounded-md border border-mg-border overflow-hidden mb-3">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-mg-border/40">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm font-mono shrink-0 select-none ${
          def.method === 'GET'
            ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
            : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
        }`}>
          {def.method}
        </span>
        <code className="text-xs font-mono text-mg-text-0 flex-1 truncate select-all">
          {def.path}
        </code>
        <span className="text-xs text-mg-text-2 shrink-0 font-medium">{def.label}</span>
        {state?.duration != null && (
          <span className="text-[10px] font-mono text-mg-text-2 shrink-0">
            {state.duration}ms
          </span>
        )}
        <Button
          size="sm"
          variant={state?.status === 'success' ? 'secondary' : 'default'}
          loading={state?.status === 'loading'}
          onClick={onCall}
          className="font-mono text-xs shrink-0 h-7"
        >
          {state?.status === 'success' ? t('platformConfig.recallBtn') : t('platformConfig.callBtn')}
        </Button>
      </div>

      {state?.status === 'loading' && (
        <div className="py-8 flex justify-center items-center">
          <svg className="animate-spin h-5 w-5 text-brand-base" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {state?.status === 'success' && (
        <div className="relative bg-mg-code-bg overflow-hidden">
          <div className="absolute top-3 right-3 text-[10px] font-bold text-mg-success bg-mg-success/10 border border-mg-success/20 px-2 py-0.5 rounded-sm">
            200 OK
          </div>
          <pre className="m-0 p-5 text-xs font-mono text-mg-text-1 overflow-auto max-h-[360px] leading-relaxed shadow-inner select-all w-full min-w-0">
            {JSON.stringify(state.data, null, 2)}
          </pre>
        </div>
      )}

      {state?.status === 'error' && (
        <div className="px-5 py-3.5 bg-rose-500/5 border-t border-rose-500/10 flex items-center gap-3">
          <span className="text-[10px] font-bold text-rose-600 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-sm">
            ERROR
          </span>
          <span className="text-xs font-mono text-rose-500 break-all">{state.error}</span>
        </div>
      )}
    </div>
  )
}
