/**
 * 可观测性日志采集与转发主体内容
 * 路由：/observability；空间详情「日志与转发」页签复用
 * API：PATCH /workspaces/:id/observability/settings
 */
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LuActivity, LuDatabaseZap, LuLoaderCircle } from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Switch } from '@/components/ui/Switch'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'
import { updateLoggingConfig } from '@/services/observability'
import type { LoggingConfig } from '@/types'
import { DestinationsPanel } from './DestinationsPanel'
import { SectionHeader } from './shared'

function ToggleRow({
  icon,
  title,
  description,
  meta,
  checked,
  loading,
  disabled,
  onChange,
}: {
  icon: ReactNode
  title: string
  description: string
  meta: string
  checked: boolean
  loading: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors',
            checked
              ? 'border-brand-base/20 bg-brand-base/10 text-brand-base'
              : 'border-mg-border/70 bg-mg-fill-0 text-mg-text-3'
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-mg-text-1">{title}</p>
            <Badge variant={checked ? 'success' : 'secondary'} size="xs" dot={checked}>
              {checked ? t('observability.status.enabled') : t('observability.status.disabled')}
            </Badge>
          </div>
          <p className="text-xs leading-5 text-mg-text-3">{description}</p>
          <p className="mt-1 text-[11px] leading-4 text-mg-text-4">{meta}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {loading && <LuLoaderCircle className="h-4 w-4 animate-spin text-brand-base" />}
        <Switch checked={checked} disabled={loading || disabled} onChange={onChange} />
      </div>
    </div>
  )
}

/** 工作空间日志采集和转发主体内容。 */
export function ObservabilityContent({
  workspaceId,
  config,
  canEditLogging,
  canManageForward,
}: {
  workspaceId: string
  config: LoggingConfig
  canEditLogging: boolean
  canManageForward: boolean
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
      appToast.requestError(err, t('observability.toast.saveError'))
    },
  })

  function handleLoggingChange(value: boolean) {
    const next = { input_output_logging_enabled: value, broadcast_enabled: value ? broadcastEnabled : false }
    setLoggingEnabled(value)
    if (!value) setBroadcastEnabled(false)
    saveMutation.mutate(next)
  }

  function handleBroadcastChange(value: boolean) {
    setBroadcastEnabled(value)
    saveMutation.mutate({ input_output_logging_enabled: loggingEnabled, broadcast_enabled: value })
  }

  return (
    <div className="grid max-w-6xl grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="card-shadow-adaptive overflow-hidden rounded-lg border border-mg-border bg-card-bg">
        <SectionHeader title={t('observability.settingsTitle')} description={t('observability.settingsDesc')} />
        <div className="divide-y divide-mg-border/70">
          <ToggleRow
            icon={<LuActivity size={17} />}
            title={t('observability.logging.title')}
            description={t('observability.logging.desc')}
            meta={t('observability.logging.meta')}
            checked={loggingEnabled}
            loading={saveMutation.isPending}
            disabled={!canEditLogging}
            onChange={handleLoggingChange}
          />
          {!loggingEnabled && (
            <div className="mx-5 mb-5 rounded-md border border-mg-warning/20 bg-mg-warning/10 px-4 py-3 text-xs leading-5 text-mg-warning">
              {t('observability.loggingOffWarning')}
            </div>
          )}
          <ToggleRow
            icon={<LuDatabaseZap size={17} />}
            title={t('observability.broadcast.title')}
            description={t('observability.broadcast.desc')}
            meta={t('observability.broadcast.meta')}
            checked={broadcastEnabled}
            loading={saveMutation.isPending}
            disabled={!canEditLogging || !loggingEnabled}
            onChange={handleBroadcastChange}
          />
        </div>
      </section>

      <DestinationsPanel
        workspaceId={workspaceId}
        broadcastEnabled={broadcastEnabled}
        canManageForward={canManageForward}
      />
    </div>
  )
}
