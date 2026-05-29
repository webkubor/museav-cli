import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { LuSend, LuCopy, LuRotateCcw } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { listApiKeys } from '@/services/api-keys'
import { listModels } from '@/services/catalog'
import { pageItems } from '@/lib/utils'
import { appToast } from '@/lib/app-toast'

const DEFAULT_BODY = JSON.stringify(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello!' }],
    temperature: 0.7,
    max_tokens: 256,
  },
  null,
  2
)

interface RequestLog {
  ts: number
  status: number | null
  duration: number
  body: string
  response: string
  error?: string
}

export default function ApiPlaygroundPage() {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', activeWorkspaceId],
    queryFn: () => listApiKeys(activeWorkspaceId!),
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
  })
  const modelsQuery = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ limit: 100 }),
    staleTime: 5 * 60_000,
  })

  const apiKeys = pageItems(apiKeysQuery.data).filter(k => k.status === 'active')
  const models = pageItems(modelsQuery.data)

  const [selectedKey, setSelectedKey] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [requestBody, setRequestBody] = useState(DEFAULT_BODY)
  const [sending, setSending] = useState(false)
  const [log, setLog] = useState<RequestLog | null>(null)

  const baseUrl = window.location.origin.replace('console.', 'api.')

  async function handleSend() {
    if (!selectedKey) {
      appToast.error(t('apiPlayground.toast.noKey'))
      return
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(requestBody)
    } catch {
      appToast.error(t('apiPlayground.toast.invalidJson'))
      return
    }

    if (selectedModel && selectedModel !== 'none') parsed.model = selectedModel

    setSending(true)
    const start = Date.now()
    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedKey}`,
        },
        body: JSON.stringify(parsed),
      })
      const duration = Date.now() - start
      const text = await res.text()
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch { /* keep raw */ }
      setLog({ ts: Date.now(), status: res.status, duration, body: JSON.stringify(parsed, null, 2), response: pretty })
    } catch (e) {
      setLog({ ts: Date.now(), status: null, duration: Date.now() - start, body: JSON.stringify(parsed, null, 2), response: '', error: String(e) })
    } finally {
      setSending(false)
    }
  }

  function copyResponse() {
    if (!log) return
    navigator.clipboard.writeText(log.response || log.error || '').then(() => appToast.success(t('apiPlayground.toast.copied')))
  }

  const curlCmd = selectedKey
    ? `curl -X POST ${baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ${selectedKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBody.replace(/\n/g, ' ')}''`
    : ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">{t('apiPlayground.title')}</h1>
        <p className="text-sm text-mg-text-1 mt-1.5">
          {t('apiPlayground.desc')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 左侧：请求配置 */}
        <div className="flex flex-col gap-6">
          <div className="card-shadow-adaptive p-6 bg-card-bg rounded-xl border border-mg-border space-y-4">
            <div>
              <SectionLabel>API Key</SectionLabel>
              <Select
                value={selectedKey}
                onChange={setSelectedKey}
                placeholder={t('apiPlayground.placeholder.key')}
                className="w-full"
              >
                {apiKeys.map(k => (
                  <Select.Option key={k.api_key_id} value={k.api_key_id}>
                    {k.name} ({k.masked}) [{k.env.toUpperCase()}]
                  </Select.Option>
                ))}
              </Select>
            </div>

            <div>
              <SectionLabel>{t('apiPlayground.label.model')}</SectionLabel>
              <Select
                value={selectedModel}
                onChange={setSelectedModel}
                placeholder={t('apiPlayground.placeholder.model')}
                className="w-full"
              >
                <Select.Option value="none">{t('apiPlayground.option.useBody')}</Select.Option>
                {models.map(m => (
                  <Select.Option key={m.model_id} value={m.model_id}>
                    {m.display_name}
                  </Select.Option>
                ))}
              </Select>
            </div>

            <div>
              <SectionLabel>{t('apiPlayground.label.requestBody')}</SectionLabel>
              <textarea
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                className="w-full min-h-[220px] font-mono text-xs p-3.5 rounded-lg border border-mg-border bg-mg-bg-1/40 text-mg-text-0 resize-y outline-none focus:border-brand-base focus:shadow-focus transition-all duration-200 line-height-relaxed"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => { setRequestBody(DEFAULT_BODY); setLog(null) }}
              >
                <LuRotateCcw className="w-4 h-4 mr-1.5" />
                {t('apiPlayground.button.reset')}
              </Button>
              <Button
                variant="brand"
                loading={sending}
                onClick={handleSend}
              >
                <LuSend className="w-4 h-4 mr-1.5" />
                {t('apiPlayground.button.send')}
              </Button>
            </div>
          </div>

          {curlCmd && (
            <div className="card-shadow-adaptive p-6 bg-card-bg rounded-xl border border-mg-border">
              <SectionLabel>{t('apiPlayground.label.curl')}</SectionLabel>
              <pre className="mt-2 text-xs font-mono text-mg-text-1 bg-mg-bg-1/40 p-4 rounded-lg border border-mg-border overflow-x-auto whitespace-pre-wrap break-all leading-relaxed shadow-inner">
                {curlCmd}
              </pre>
            </div>
          )}
        </div>

        {/* 右侧：响应 */}
        <div className="card-shadow-adaptive p-6 bg-card-bg rounded-xl border border-mg-border flex flex-col min-h-[460px]">
          <div className="flex items-center justify-between border-b border-mg-border pb-4 mb-4">
            <span className="text-[11px] font-bold text-mg-text-2 tracking-widest uppercase">{t('apiPlayground.label.response')}</span>
            {log && (
              <div className="flex items-center gap-3">
                <Badge variant={log.status && log.status < 300 ? 'success' : 'destructive'}>
                  {log.status ?? 'ERR'}
                </Badge>
                <span className="text-xs font-mono text-mg-text-2">{log.duration}ms</span>
                <Button size="sm" variant="outline" onClick={copyResponse}>
                  <LuCopy className="w-3.5 h-3.5 mr-1" />
                  {t('apiPlayground.button.copy')}
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {!log ? (
              <div className="flex-1 flex items-center justify-center border border-dashed border-mg-border rounded-lg text-sm text-mg-text-2">
                {t('apiPlayground.empty')}
              </div>
            ) : log.error ? (
              <pre className="flex-1 font-mono text-xs text-[var(--mg-danger)] bg-mg-bg-1/40 p-4 rounded-lg border border-mg-border overflow-y-auto whitespace-pre-wrap break-all leading-relaxed">
                {log.error}
              </pre>
            ) : (
              <pre className={`flex-1 font-mono text-xs bg-mg-bg-1/40 p-4 rounded-lg border border-mg-border overflow-y-auto whitespace-pre-wrap break-all leading-relaxed ${log.status && log.status < 300 ? 'text-mg-text-1' : 'text-[var(--mg-danger)]'}`}>
                {log.response}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold text-mg-text-2 tracking-widest uppercase mb-2">
      {children}
    </p>
  )
}
