import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import { LuLink } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import {
  getLoggingConfig,
  updateLoggingConfig,
} from '@/services/observability'
import type { LoggingConfig } from '@/types'

// ─── 可用平台列表（mock） ──────────────────────────────────────────────────────

const AVAILABLE_PLATFORMS = [
  { id: 'arize',     name: 'Arize AI' },
  { id: 'braintrust', name: 'Braintrust' },
  { id: 'clickhouse', name: 'ClickHouse' },
  { id: 'comet',     name: 'Comet Opik' },
  { id: 'datadog',   name: 'Datadog' },
  { id: 'grafana',   name: 'Grafana Cloud' },
  { id: 'langfuse',  name: 'Langfuse' },
  { id: 'langsmith', name: 'LangSmith' },
  { id: 'newrelic',  name: 'New Relic AI' },
  { id: 'otel',      name: 'OpenTelemetry Collector' },
  { id: 'posthog',   name: 'PostHog' },
]

// 每个平台对应一个色调，用于 logo 占位块
const PLATFORM_COLORS: Record<string, string> = {
  arize:      'bg-violet-500/15 text-violet-600',
  braintrust: 'bg-amber-500/15 text-amber-600',
  clickhouse: 'bg-yellow-500/15 text-yellow-600',
  comet:      'bg-sky-500/15 text-sky-600',
  datadog:    'bg-purple-500/15 text-purple-600',
  grafana:    'bg-orange-500/15 text-orange-600',
  langfuse:   'bg-emerald-500/15 text-emerald-600',
  langsmith:  'bg-blue-500/15 text-blue-600',
  newrelic:   'bg-teal-500/15 text-teal-600',
  otel:       'bg-indigo-500/15 text-indigo-600',
  posthog:    'bg-pink-500/15 text-pink-600',
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  title,
  description,
  checked,
  loading,
  onChange,
  isFirst = false,
}: {
  title: string
  description: string
  checked: boolean
  loading: boolean
  onChange: (v: boolean) => void
  isFirst?: boolean
}) {
  return (
    <div className={`flex items-center justify-between p-5 gap-6 ${isFirst ? '' : 'border-t border-mg-border'}`}>
      <div>
        <p className="text-sm font-semibold text-mg-text-0 mb-1">
          {title}
        </p>
        <p className="text-xs text-mg-text-2">
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {loading && (
          <svg className="animate-spin h-4 w-4 text-brand-base" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        <Switch checked={checked} disabled={loading} onChange={onChange} />
      </div>
    </div>
  )
}

// ─── 平台配置 Modal ──────────────────────────────────────────────────────────

function PlatformConfigModal({
  platform,
  onClose,
}: {
  platform: { id: string; name: string } | null
  onClose: () => void
}) {
  const [name, setName] = useState(platform?.name ?? '')
  const [url, setUrl] = useState('')
  const [method, setMethod] = useState('POST')
  const [headers, setHeaders] = useState('')

  function handleTest() {
    appToast.success('连接测试成功')
  }
  function handleSendTrace() {
    appToast.success('测试 Trace 已发送')
  }
  function handleSave() {
    appToast.success('配置已保存')
    onClose()
  }

  return (
    <Modal
      open={!!platform}
      onClose={onClose}
      title={platform?.name ?? ''}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="brand" onClick={handleSave}>保存</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
        {/* 左：说明 */}
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-mg-text-0">
            <LuLink size={15} className="text-brand-base" />
            连接配置
          </div>
          <p className="mt-2 text-xs text-mg-text-2 leading-relaxed">
            配置凭证与端点，保存前可测试连接。
          </p>
        </div>

        {/* 右：表单 */}
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">名称</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Webhook" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">URL</label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/traces" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">方法（可选）</label>
            <Select value={method} onChange={setMethod} className="w-full">
              <Select.Option value="POST">POST</Select.Option>
              <Select.Option value="GET">GET</Select.Option>
              <Select.Option value="PUT">PUT</Select.Option>
              <Select.Option value="PATCH">PATCH</Select.Option>
            </Select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">请求头（可选）</label>
            <Textarea
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              rows={3}
              placeholder={'{"Authorization": "Bearer token", "X-Webhook-Signature": "your-webhook-secret"}'}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleTest}>测试连接</Button>
            <Button variant="outline" size="sm" onClick={handleSendTrace}>发送测试 Trace</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── 可用平台列表区块 ──────────────────────────────────────────────────────────

function AvailablePlatformsSection() {
  const [activePlatform, setActivePlatform] = useState<{ id: string; name: string } | null>(null)

  return (
    <>
      <div className="rounded-xl border border-mg-border overflow-hidden bg-card-bg">
        <div className="px-5 py-3 border-b border-mg-border">
          <p className="text-[11px] font-bold text-mg-text-2 uppercase tracking-widest">可用平台</p>
        </div>
        <ul>
          {AVAILABLE_PLATFORMS.map((p, idx) => {
            const colorClass = PLATFORM_COLORS[p.id] ?? 'bg-mg-fill-0 text-mg-text-1'
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-mg-fill-0/40 transition-colors ${idx !== 0 ? 'border-t border-mg-border' : ''}`}
                onClick={() => setActivePlatform(p)}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${colorClass}`}>
                    {p.name.charAt(0)}
                  </span>
                  <span className="text-sm font-medium text-mg-text-0">{p.name}</span>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-mg-text-2 hover:text-brand-base transition-colors"
                  onClick={(e) => { e.stopPropagation(); setActivePlatform(p) }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Add Destination
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <PlatformConfigModal
        key={activePlatform?.id ?? 'none'}
        platform={activePlatform}
        onClose={() => setActivePlatform(null)}
      />
    </>
  )
}

// ─── Main content (requires loaded config) ────────────────────────────────────

function ObservabilityContent({
  workspaceId,
  config,
}: {
  workspaceId: string
  config: LoggingConfig
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [loggingEnabled, setLoggingEnabled] = useState(config.input_output_logging_enabled)
  const [broadcastEnabled, setBroadcastEnabled] = useState(config.broadcast_enabled)

  const saveMutation = useMutation({
    mutationFn: (patch: { input_output_logging_enabled: boolean; broadcast_enabled: boolean }) =>
      updateLoggingConfig(workspaceId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observability', 'logging', workspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('observability.toast.saveError'))
    },
  })

  function handleLoggingChange(v: boolean) {
    const next = { input_output_logging_enabled: v, broadcast_enabled: v ? broadcastEnabled : false }
    setLoggingEnabled(v)
    if (!v) setBroadcastEnabled(false)
    saveMutation.mutate(next)
  }

  function handleBroadcastChange(v: boolean) {
    setBroadcastEnabled(v)
    saveMutation.mutate({ input_output_logging_enabled: loggingEnabled, broadcast_enabled: v })
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* 输入/输出日志 + 广播转发：两个并列开关（同级，不嵌套） */}
      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden">
        <ToggleRow
          title={t('observability.logging.title')}
          description={t('observability.logging.desc')}
          checked={loggingEnabled}
          loading={saveMutation.isPending}
          onChange={handleLoggingChange}
          isFirst
        />
        <ToggleRow
          title={t('observability.broadcast.title')}
          description={t('observability.broadcast.desc')}
          checked={broadcastEnabled}
          loading={saveMutation.isPending}
          onChange={handleBroadcastChange}
        />
      </div>

      {/* 可用平台：常驻展示（对齐原型，不依赖广播开关） */}
      <AvailablePlatformsSection />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const loggingQuery = useQuery({
    queryKey: ['observability', 'logging', activeWorkspaceId],
    queryFn: () => getLoggingConfig(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-mg-text-0">
          {t('observability.title')}
        </h1>
        <p className="text-sm text-mg-text-1 mt-1.5 font-medium">
          {t('observability.desc')}
        </p>
      </div>

      {loggingQuery.isLoading && (
        <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border p-6 max-w-3xl space-y-4 animate-pulse">
          <div className="h-5 bg-mg-fill-0 rounded w-1/3" />
          <div className="h-4 bg-mg-fill-0 rounded w-full" />
          <div className="h-4 bg-mg-fill-0 rounded w-2/3" />
        </div>
      )}

      {loggingQuery.data && activeWorkspaceId && (
        <ObservabilityContent
          key={activeWorkspaceId}
          workspaceId={activeWorkspaceId}
          config={loggingQuery.data}
        />
      )}
    </div>
  )
}
