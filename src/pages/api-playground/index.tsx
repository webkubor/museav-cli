import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { LuSend, LuCopy, LuRotateCcw, LuKey, LuEye, LuEyeOff } from 'react-icons/lu'
import { listModels } from '@/services/catalog'
import { pageItems } from '@/lib/utils'
import { appToast } from '@/lib/app-toast'
import { Checkbox } from '@/components/ui/Checkbox'
import { GATEWAY_ENDPOINTS } from '@/config/gateway'

const OPENAI_DEFAULT_BODY = JSON.stringify(
  {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello!' }],
    temperature: 0.7,
    max_tokens: 256,
  },
  null,
  2
)

const ANTHROPIC_DEFAULT_BODY = JSON.stringify(
  {
    model: 'claude-3-5-sonnet',
    messages: [{ role: 'user', content: 'Hello!' }],
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
  const { t, i18n } = useTranslation()

  const modelsQuery = useQuery({
    queryKey: ['catalog-models'],
    queryFn: () => listModels({ limit: 100 }),
    staleTime: 5 * 60_000,
  })

  const models = pageItems(modelsQuery.data)

  const [selectedKey, setSelectedKey] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [requestBody, setRequestBody] = useState(OPENAI_DEFAULT_BODY)
  const [sending, setSending] = useState(false)
  const [log, setLog] = useState<RequestLog | null>(null)

  const [showKey, setShowKey] = useState(false)
  const [saveToLocal, setSaveToLocal] = useState(true)
  const [streamEnabled, setStreamEnabled] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const [protocol, setProtocol] = useState<'openai' | 'anthropic'>('openai')

  // 0. 本地缓存 API Key 的生命周期管理逻辑
  useEffect(() => {
    const flag = localStorage.getItem('mg_playground_save_flag')
    const shouldSave = flag === null ? true : flag === 'true'
    setSaveToLocal(shouldSave)
    
    if (shouldSave) {
      const savedKey = localStorage.getItem('mg_playground_key')
      if (savedKey) {
        setSelectedKey(savedKey)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('mg_playground_save_flag', String(saveToLocal))
    if (saveToLocal) {
      if (selectedKey) {
        localStorage.setItem('mg_playground_key', selectedKey)
      } else {
        localStorage.removeItem('mg_playground_key')
      }
    } else {
      localStorage.removeItem('mg_playground_key')
    }
  }, [selectedKey, saveToLocal])

  const endpoint = protocol === 'openai' ? GATEWAY_ENDPOINTS[0] : GATEWAY_ENDPOINTS[1]
  const baseUrl = endpoint.baseUrl

  function handleProtocolChange(val: string) {
    const nextProto = val as 'openai' | 'anthropic'
    setProtocol(nextProto)
    if (nextProto === 'openai') {
      setRequestBody(OPENAI_DEFAULT_BODY)
      const found = models.find(m => m.model_id.toLowerCase().includes('gpt'))
      if (found) {
        setSelectedModel(found.model_id)
      } else if (models.length > 0) {
        setSelectedModel(models[0].model_id)
      }
    } else {
      setRequestBody(ANTHROPIC_DEFAULT_BODY)
      const found = models.find(m => m.model_id.toLowerCase().includes('claude'))
      if (found) {
        setSelectedModel(found.model_id)
      } else if (models.length > 0) {
        setSelectedModel(models[0].model_id)
      }
    }
  }

  // 1. 模型列表加载成功后，自动将第一个模型设为默认选择模型
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].model_id)
    }
  }, [models, selectedModel])

  // 2. 双向绑定：监听下拉框所选模型的改变，同步替换 JSON 请求体中的 model 字段
  useEffect(() => {
    if (!selectedModel || selectedModel === 'none') return
    try {
      const parsed = JSON.parse(requestBody)
      if (parsed && parsed.model !== selectedModel) {
        parsed.model = selectedModel
        setRequestBody(JSON.stringify(parsed, null, 2))
      }
    } catch {
      // 忽略用户正在输入时的无效 JSON
    }
  }, [selectedModel])

  // 3. 双向绑定：监听 JSON 请求体的修改，反向自动同步下拉框的模型选项
  useEffect(() => {
    try {
      const parsed = JSON.parse(requestBody)
      if (parsed && typeof parsed.model === 'string') {
        const found = models.find(m => m.model_id === parsed.model)
        if (found && selectedModel !== parsed.model) {
          setSelectedModel(parsed.model)
        } else if (!found && selectedModel !== 'none') {
          setSelectedModel('none')
        }
      }
    } catch {
      // 忽略用户正在输入时的无效 JSON
    }
  }, [requestBody, models, selectedModel])

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
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const targetUrl = protocol === 'openai'
        ? `${baseUrl.replace(/\/+$/, '')}/chat/completions`
        : `${baseUrl.replace(/\/+$/, '')}/v1/messages`

      if (streamEnabled) {
        parsed.stream = true
      } else {
        parsed.stream = false
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${selectedKey}`,
        },
        body: JSON.stringify(parsed),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const text = await res.text()
        let pretty = text
        try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch { /* keep raw */ }
        setLog({
          ts: Date.now(),
          status: res.status,
          duration: Date.now() - start,
          body: JSON.stringify(parsed, null, 2),
          response: pretty
        })
        return
      }

      if (streamEnabled && res.body) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let responseText = ''

        setLog({
          ts: Date.now(),
          status: res.status,
          duration: 0,
          body: JSON.stringify(parsed, null, 2),
          response: 'Connecting...'
        })

        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const combined = buffer + chunk
          const lines = combined.split('\n')

          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            if (trimmed === 'data: [DONE]') continue

            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6)
              try {
                const dataJson = JSON.parse(dataStr)
                if (protocol === 'openai') {
                  const delta = dataJson.choices?.[0]?.delta?.content ?? ''
                  responseText += delta
                } else {
                  if (dataJson.type === 'content_block_delta') {
                    responseText += dataJson.delta?.text ?? ''
                  } else if (dataJson.delta?.text) {
                    responseText += dataJson.delta.text
                  }
                }
                setLog(prev => prev ? {
                  ...prev,
                  duration: Date.now() - start,
                  response: responseText
                } : null)
              } catch {
                // 忽略非完整 JSON 行
              }
            }
          }
        }

        if (buffer && buffer.trim().startsWith('data: ')) {
          const trimmed = buffer.trim()
          if (trimmed !== 'data: [DONE]') {
            const dataStr = trimmed.slice(6)
            try {
              const dataJson = JSON.parse(dataStr)
              if (protocol === 'openai') {
                responseText += dataJson.choices?.[0]?.delta?.content ?? ''
              } else {
                if (dataJson.type === 'content_block_delta') {
                  responseText += dataJson.delta?.text ?? ''
                } else if (dataJson.delta?.text) {
                  responseText += dataJson.delta.text
                }
              }
            } catch {}
          }
        }

        setLog(prev => prev ? {
          ...prev,
          duration: Date.now() - start,
          response: responseText || 'No stream response content returned.'
        } : null)

      } else {
        const duration = Date.now() - start
        const text = await res.text()
        let pretty = text
        try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch { /* keep raw */ }
        setLog({
          ts: Date.now(),
          status: res.status,
          duration,
          body: JSON.stringify(parsed, null, 2),
          response: pretty
        })
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setLog({
          ts: Date.now(),
          status: null,
          duration: Date.now() - start,
          body: JSON.stringify(parsed, null, 2),
          response: '',
          error: String(e)
        })
      } else {
        setLog(prev => prev ? {
          ...prev,
          duration: Date.now() - start,
          response: prev.response + '\n\n[Request interrupted by user.]'
        } : null)
      }
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  function copyResponse() {
    if (!log) return
    navigator.clipboard.writeText(log.response || log.error || '').then(() => appToast.success(t('apiPlayground.toast.copied')))
  }



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
              <SectionLabel>{i18n.language.startsWith('zh') ? "接口协议规范" : "Protocol Specification"}</SectionLabel>
              <Select
                value={protocol}
                onChange={handleProtocolChange}
                className="w-full"
              >
                <Select.Option value="openai">OpenAI 兼容协议 (v1/chat/completions)</Select.Option>
                <Select.Option value="anthropic">Anthropic 兼容协议 (v1/messages)</Select.Option>
              </Select>
            </div>

            <div>
              <SectionLabel>Base URL</SectionLabel>
              <Input
                readOnly
                value={baseUrl ? `${baseUrl.replace(/\/+$/, '')}` : '—'}
                className="w-full font-mono text-xs bg-mg-bg-1/20 text-mg-text-2 cursor-default select-all"
                suffix={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      const val = baseUrl ? `${baseUrl.replace(/\/+$/, '')}` : ''
                      if (val) {
                        navigator.clipboard.writeText(val).then(() => appToast.success(t('apiPlayground.toast.copied') || '已复制'))
                      }
                    }}
                    className="text-mg-text-2 hover:text-mg-text-0 focus:outline-none transition-colors duration-150 cursor-pointer shrink-0 p-0.5"
                  >
                    <LuCopy size={14} />
                  </button>
                }
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>API Key</SectionLabel>
                <div className="flex items-center gap-4">
                  <div 
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                    onClick={() => setSaveToLocal(!saveToLocal)}
                  >
                    <Checkbox 
                      checked={saveToLocal}
                      onCheckedChange={(checked) => setSaveToLocal(checked === true)}
                    />
                    <span className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wide">
                      {i18n.language.startsWith('zh') ? "本地缓存" : "Save Local"}
                    </span>
                  </div>

                  <div 
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                    onClick={() => setStreamEnabled(!streamEnabled)}
                  >
                    <Checkbox 
                      checked={streamEnabled}
                      onCheckedChange={(checked) => setStreamEnabled(checked === true)}
                    />
                    <span className="text-[10px] font-bold text-mg-text-2 uppercase tracking-wide">
                      {i18n.language.startsWith('zh') ? "流式输出" : "Stream"}
                    </span>
                  </div>
                </div>
              </div>
              <Input
                type={showKey ? "text" : "password"}
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                placeholder={i18n.language.startsWith('zh') ? "请输入你的 API Key (sk-...)" : "Enter your API Key (sk-...)"}
                prefix={<LuKey size={14} />}
                suffix={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowKey(!showKey)
                    }}
                    className="text-mg-text-2 hover:text-mg-text-0 focus:outline-none transition-colors duration-150 cursor-pointer shrink-0 p-0.5"
                  >
                    {showKey ? <LuEyeOff size={15} /> : <LuEye size={15} />}
                  </button>
                }
                className="w-full"
              />
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
                onClick={() => { setRequestBody(protocol === 'openai' ? OPENAI_DEFAULT_BODY : ANTHROPIC_DEFAULT_BODY); setLog(null) }}
              >
                <LuRotateCcw className="w-4 h-4 mr-1.5" />
                {t('apiPlayground.button.reset')}
              </Button>
              {sending ? (
                <Button
                  variant="destructive"
                  onClick={() => abortRef.current?.abort()}
                >
                  {t('chatTest.button.stop') || '停止'}
                </Button>
              ) : (
                <Button
                  variant="brand"
                  onClick={handleSend}
                >
                  <LuSend className="w-4 h-4 mr-1.5" />
                  {t('apiPlayground.button.send')}
                </Button>
              )}
            </div>
          </div>
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
