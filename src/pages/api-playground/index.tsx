import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Select, Tag, Toast, Typography } from '@douyinfe/semi-ui'
import { LuSend, LuCopy, LuRotateCcw } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { listApiKeys } from '@/services/api-keys'
import { listModels } from '@/services/catalog'
import { pageItems } from '@/lib/utils'

const { Text } = Typography

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
      Toast.warning('请先选择 API Key')
      return
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(requestBody)
    } catch {
      Toast.error('请求体不是合法 JSON')
      return
    }

    if (selectedModel) parsed.model = selectedModel

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
    navigator.clipboard.writeText(log.response || log.error || '').then(() => Toast.success('已复制'))
  }

  const curlCmd = selectedKey
    ? `curl -X POST ${baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ${selectedKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBody.replace(/\n/g, ' ')}'`
    : ''

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>接口调试</h1>
        <p style={{ fontSize: '14px', color: 'var(--semi-color-text-1)', margin: '6px 0 0' }}>
          使用工作区 API Key 直接发送测试请求，验证模型接入效果。
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* 左侧：请求配置 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={panelStyle}>
            <SectionLabel>API Key</SectionLabel>
            <Select
              value={selectedKey}
              onChange={(v) => setSelectedKey(v as string)}
              placeholder="选择 API Key"
              style={{ width: '100%' }}
              loading={apiKeysQuery.isLoading}
            >
              {apiKeys.map(k => (
                <Select.Option key={k.api_key_id} value={k.api_key_id}>
                  <span style={{ fontWeight: 600 }}>{k.name}</span>
                  <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: '12px', color: 'var(--semi-color-text-2)' }}>{k.masked}</span>
                  <Tag size="small" style={{ marginLeft: 6 }} color={k.env === 'live' ? 'green' : 'grey'}>{k.env}</Tag>
                </Select.Option>
              ))}
            </Select>

            <SectionLabel style={{ marginTop: '14px' }}>模型（可选，覆盖 body 中 model 字段）</SectionLabel>
            <Select
              value={selectedModel}
              onChange={(v) => setSelectedModel(v as string)}
              placeholder="使用 body 中的 model"
              showClear
              style={{ width: '100%' }}
              loading={modelsQuery.isLoading}
            >
              {models.map(m => (
                <Select.Option key={m.model_id} value={m.model_id}>
                  {m.display_name}
                </Select.Option>
              ))}
            </Select>

            <SectionLabel style={{ marginTop: '14px' }}>请求体 (JSON)</SectionLabel>
            <textarea
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              style={{
                width: '100%',
                minHeight: '220px',
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--semi-color-fill-1)',
                backgroundColor: 'var(--semi-color-fill-0)',
                color: 'var(--semi-color-text-0)',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
                lineHeight: 1.6,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button icon={<LuRotateCcw size={14} />} onClick={() => { setRequestBody(DEFAULT_BODY); setLog(null) }}>重置</Button>
              <Button theme="solid" type="primary" icon={<LuSend size={14} />} loading={sending} onClick={handleSend}>
                发送请求
              </Button>
            </div>
          </div>

          {curlCmd && (
            <div style={panelStyle}>
              <SectionLabel>cURL 命令</SectionLabel>
              <pre style={{ margin: 0, fontSize: '11px', fontFamily: 'monospace', color: 'var(--semi-color-text-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7, background: 'var(--semi-color-fill-0)', padding: '12px', borderRadius: '6px', border: '1px solid var(--semi-color-fill-1)' }}>
                {curlCmd}
              </pre>
            </div>
          )}
        </div>

        {/* 右侧：响应 */}
        <div style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <SectionLabel style={{ margin: 0 }}>响应</SectionLabel>
            {log && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontSize: '12px', padding: '2px 10px', borderRadius: '100px', fontWeight: 600,
                  backgroundColor: log.status && log.status < 300 ? 'var(--semi-color-success-light-default)' : 'var(--semi-color-danger-light-default)',
                  color: log.status && log.status < 300 ? 'var(--semi-color-success)' : 'var(--semi-color-danger)',
                }}>
                  {log.status ?? 'ERR'}
                </span>
                <Text style={{ fontSize: '12px', color: 'var(--semi-color-text-2)' }}>{log.duration}ms</Text>
                <Button size="small" icon={<LuCopy size={12} />} onClick={copyResponse}>复制</Button>
              </div>
            )}
          </div>

          {!log ? (
            <div style={{ minHeight: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--semi-color-border)', borderRadius: '8px', color: 'var(--semi-color-text-3)', fontSize: '13px' }}>
              点击「发送请求」查看响应
            </div>
          ) : log.error ? (
            <pre style={responseStyle}>{log.error}</pre>
          ) : (
            <pre style={{ ...responseStyle, color: log.status && log.status < 300 ? 'var(--semi-color-text-0)' : 'var(--semi-color-danger)' }}>
              {log.response}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  padding: '20px',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  backgroundColor: 'var(--semi-color-bg-1)',
}

const responseStyle: React.CSSProperties = {
  margin: 0,
  minHeight: '380px',
  fontSize: '12px',
  fontFamily: 'monospace',
  color: 'var(--semi-color-text-0)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  lineHeight: 1.6,
  overflowY: 'auto',
  background: 'var(--semi-color-fill-0)',
  padding: '12px',
  borderRadius: '6px',
  border: '1px solid var(--semi-color-fill-1)',
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{
      fontSize: '11px', fontWeight: 700, color: 'var(--semi-color-text-2)',
      letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 6px',
      ...style,
    }}>
      {children}
    </p>
  )
}
