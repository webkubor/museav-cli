import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/Table'
import { useAuthStore } from '@/store/auth'
import { appToast } from '@/lib/app-toast'
import {
  createForward,
  deleteForward,
  getLoggingConfig,
  listForwards,
  listPlatforms,
  updateForward,
  updateLoggingConfig,
} from '@/services/observability'
import { listApiKeys } from '@/services/api-keys'
import { pageItems } from '@/lib/utils'
import type { LoggingConfig, PlatformConfigField } from '@/types'
import { formatDateTime } from '@/lib/format-date'


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

// ─── Destinations section ─────────────────────────────────────────────────────

function DestinationsSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [platform, setPlatform] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const platformsQuery = useQuery({
    queryKey: ['observability', 'platforms', workspaceId],
    queryFn: () => listPlatforms(workspaceId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const forwardsQuery = useQuery({
    queryKey: ['observability', 'forwards', workspaceId],
    queryFn: () => listForwards(workspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const selectedPlatformId = platform || platformsQuery.data?.items[0]?.platform || ''
  const selectedPlatform = useMemo(
    () => platformsQuery.data?.items.find((item) => item.platform === selectedPlatformId),
    [platformsQuery.data, selectedPlatformId]
  )

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string
      config: Record<string, string>
      sampling_rate?: number
      api_key_ids?: string[]
      privacy_mode_enabled?: boolean
    }) =>
      createForward(workspaceId, {
        platform: selectedPlatformId,
        name: payload.name,
        config: payload.config,
        enabled: true,
        sampling_rate: payload.sampling_rate,
        api_key_ids: payload.api_key_ids,
        privacy_mode_enabled: payload.privacy_mode_enabled,
      }),
    onSuccess: () => {
      appToast.success(t('observability.toast.forwardCreated'))
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('observability.toast.forwardCreateError'))
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (values: { forwardId: string; enabled: boolean }) =>
      updateForward(workspaceId, values.forwardId, { enabled: values.enabled }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] }),
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('observability.toast.toggleError'))
    },
  })

  const removeMutation = useMutation({
    mutationFn: (forwardId: string) => deleteForward(workspaceId, forwardId),
    onSuccess: () => {
      appToast.success(t('observability.toast.forwardDeleted'))
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('observability.toast.forwardDeleteError'))
    },
  })

  const forwards = forwardsQuery.data?.items ?? []

  return (
    <>
      {/* Add destination form — 默认收起 */}
      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden mb-5">
        <div
          className="px-5 py-3.5 flex items-center justify-between cursor-pointer select-none hover:bg-mg-fill-0/30 transition-colors"
          onClick={() => setFormOpen((o) => !o)}
        >
          <h3 className="text-sm font-bold text-mg-text-0">{t('observability.destinations.addTitle')}</h3>
          <svg width="14" height="14" viewBox="0 0 14 14" className={`text-mg-text-2 transition-transform duration-200 ${formOpen ? 'rotate-180' : ''}`}>
            <path d="M3 5.5L7 9.5L11 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
        {formOpen && (
          <div className="p-5 border-t border-mg-border/60">
            <CreateForwardForm
              key={selectedPlatformId}
              platformItems={platformsQuery.data?.items ?? []}
              selectedPlatformId={selectedPlatformId}
              selectedPlatform={selectedPlatform}
              onPlatformChange={setPlatform}
              isSubmitting={createMutation.isPending}
              workspaceId={workspaceId}
              onSubmit={(payload) => {
                if (!selectedPlatformId || !payload.name.trim()) return
                createMutation.mutate(payload)
              }}
            />
          </div>
        )}
      </div>

      {/* Destinations list */}
      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-mg-border">
          <h3 className="text-sm font-bold text-mg-text-0">{t('observability.destinations.listTitle')}</h3>
        </div>
        {forwardsQuery.isLoading ? (
          <div className="p-5 space-y-2 animate-pulse">
            <div className="h-4 bg-mg-fill-0 rounded w-1/3" />
            <div className="h-4 bg-mg-fill-0 rounded w-full" />
            <div className="h-4 bg-mg-fill-0 rounded w-2/3" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('observability.destinations.table.name')}</TableHead>
                <TableHead>{t('observability.destinations.table.platform')}</TableHead>
                <TableHead>{t('observability.destinations.table.status')}</TableHead>
                <TableHead>{t('observability.destinations.table.lastSuccess')}</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forwards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-xs italic text-mg-text-2">
                    {t('observability.destinations.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                forwards.map((row) => (
                  <TableRow key={row.forward_id}>
                    <TableCell className="font-semibold text-mg-text-0 text-[13.5px]">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-1">
                      {row.platform}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.enabled ? 'success' : 'outline'}>
                        {row.enabled ? t('observability.destinations.table.enabled') : t('observability.destinations.table.paused')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-mg-text-2">
                      {formatDateTime(row.last_success_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleMutation.mutate({ forwardId: row.forward_id, enabled: !row.enabled })}
                          className="h-7 text-xs font-semibold"
                        >
                          {row.enabled ? t('observability.destinations.table.pause') : t('observability.destinations.table.resume')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget({ id: row.forward_id, name: row.name })}
                          className="h-7 text-xs"
                        >
                          {t('observability.destinations.table.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('observability.destinations.deleteModal.title')}
        description={t('observability.destinations.deleteModal.description', { name: deleteTarget?.name })}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('observability.destinations.deleteModal.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={removeMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  removeMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null)
                  })
                }
              }}
            >
              {t('observability.destinations.deleteModal.confirm')}
            </Button>
          </>
        }
      />
    </>
  )
}

// ─── CreateForwardForm ────────────────────────────────────────────────────────

interface CreateFormPayload {
  name: string
  config: Record<string, string>
  sampling_rate?: number
  api_key_ids?: string[]
  privacy_mode_enabled?: boolean
}

function CreateForwardForm({
  platformItems,
  selectedPlatformId,
  selectedPlatform,
  onPlatformChange,
  isSubmitting,
  workspaceId,
  onSubmit,
}: {
  platformItems: { platform: string; display_name: string }[]
  selectedPlatformId: string
  selectedPlatform: { config_schema: { fields: PlatformConfigField[] } } | undefined
  onPlatformChange: (id: string) => void
  isSubmitting: boolean
  workspaceId: string
  onSubmit: (payload: CreateFormPayload) => void
}) {
  const { t } = useTranslation()
  const fields = selectedPlatform?.config_schema.fields ?? []
  const [name, setName] = useState('')
  const [configValues, setConfigValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, '']))
  )
  const [samplingRate, setSamplingRate] = useState('100')
  const [privacyMode, setPrivacyMode] = useState(false)
  const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([])

  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () => listApiKeys(workspaceId).then(pageItems),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
  const apiKeys = apiKeysQuery.data ?? []

  function toggleKey(keyId: string) {
    setSelectedKeyIds((prev) =>
      prev.includes(keyId) ? prev.filter((k) => k !== keyId) : [...prev, keyId]
    )
  }

  function handleSubmit() {
    const rate = parseInt(samplingRate, 10)
    onSubmit({
      name,
      config: configValues,
      sampling_rate: isNaN(rate) ? 1 : rate / 100,
      api_key_ids: selectedKeyIds.length > 0 ? selectedKeyIds : undefined,
      privacy_mode_enabled: privacyMode || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 平台 + 名称 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">{t('observability.form.platformLabel')}</label>
          <Select value={selectedPlatformId} onChange={onPlatformChange} className="w-full">
            {platformItems.map((item) => (
              <Select.Option key={item.platform} value={item.platform}>
                {item.display_name}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">{t('observability.form.nameLabel')}</label>
          <Input
            value={name}
            placeholder="例如：生产环境 Datadog 主通道"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      {/* 平台配置字段 */}
      {fields.length > 0 && (
        <div className={`grid gap-5 ${fields.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">
                {field.label}
                {field.required && <span className="text-rose-500 ml-1">*</span>}
              </label>
              <Input
                value={configValues[field.key] ?? ''}
                placeholder={field.type === 'secret' ? '粘贴密钥，提交后不再明文显示' : `填写 ${field.label}，参考平台文档获取`}
                type={field.type === 'secret' ? 'password' : 'text'}
                onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      {/* 采样率 + 隐私模式 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">
            {t('observability.form.samplingRate')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max="100"
              value={samplingRate}
              placeholder="1~100，数值越小转发越少"
              onChange={(e) => setSamplingRate(e.target.value)}
              className="flex-1"
            />
            <span className="text-xs font-bold text-mg-text-2 shrink-0">%</span>
          </div>
          <p className="text-[10px] text-mg-text-2 mt-1.5">{t('observability.form.samplingHint')}</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">
            {t('observability.form.privacyMode')}
          </label>
          <div className="flex items-center gap-3 mt-1">
            <Switch checked={privacyMode} onChange={setPrivacyMode} />
            <span className="text-xs text-mg-text-2">{t('observability.form.privacyHint')}</span>
          </div>
        </div>
      </div>

      {/* API Key 绑定 */}
      <div>
        <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">
          {t('observability.form.apiKeyFilter')}
        </label>
        <p className="text-[10px] text-mg-text-2 mb-2.5">{t('observability.form.apiKeyFilterHint')}</p>
        {apiKeys.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {apiKeys.filter((k) => k.status === 'active').map((key) => {
              const selected = selectedKeyIds.includes(key.api_key_id)
              return (
                <button
                  key={key.api_key_id}
                  type="button"
                  onClick={() => toggleKey(key.api_key_id)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all cursor-pointer',
                    selected
                      ? 'border-brand-base bg-brand-base/5 text-brand-base'
                      : 'border-mg-border bg-mg-bg-1/40 text-mg-text-1 hover:border-mg-border/80',
                  ].join(' ')}
                >
                  {key.name}
                  <code className="ml-1.5 text-[10px] text-mg-text-2 font-mono">{key.masked?.slice(0, 12)}</code>
                </button>
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-mg-text-2">{t('observability.form.noApiKeys')}</span>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          variant="brand"
          loading={isSubmitting}
          onClick={handleSubmit}
          className="px-8"
        >
          {t('observability.form.submit')}
        </Button>
      </div>
    </div>
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
      {/* Section 1: Logging toggle — always visible */}
      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-mg-border overflow-hidden">
        <ToggleRow
          title={t('observability.logging.title')}
          description={t('observability.logging.desc')}
          checked={loggingEnabled}
          loading={saveMutation.isPending}
          onChange={handleLoggingChange}
          isFirst
        />

        {/* Section 2: Broadcast toggle — only when logging is on */}
        {loggingEnabled && (
          <ToggleRow
            title={t('observability.broadcast.title')}
            description={t('observability.broadcast.desc')}
            checked={broadcastEnabled}
            loading={saveMutation.isPending}
            onChange={handleBroadcastChange}
          />
        )}
      </div>

      {/* Section 3: Destinations — only when broadcast is on */}
      {loggingEnabled && broadcastEnabled && (
        <DestinationsSection workspaceId={workspaceId} />
      )}
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
