/**
 * 可观测性转发目标管理面板
 * 路由：/observability；空间详情「日志与转发」页签复用
 * API：GET /workspaces/:id/observability/platforms、
 * GET|DELETE /workspaces/:id/observability/broadcast-destinations
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LuArrowUpRight, LuPencil, LuPlus, LuRadio, LuTrash2 } from 'react-icons/lu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import { appToast } from '@/lib/app-toast'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/format-date'
import { deleteForward, listForwards, listPlatforms } from '@/services/observability'
import type { ForwardItem, PlatformItem } from '@/types'
import { PlatformConfigModal } from './PlatformConfigModal'
import { getForwardEndpoint, type PlatformSelection } from './observability-utils'
import { PlatformLogo, SectionHeader } from './shared'

function DestinationCard({
  forward,
  statusMap,
  canManageForward,
  deleting,
  onEdit,
  onDelete,
}: {
  forward: ForwardItem
  statusMap: Record<string, StatusConfig>
  canManageForward: boolean
  deleting: boolean
  onEdit: (forward: ForwardItem) => void
  onDelete: (forwardId: string) => void
}) {
  const { t } = useTranslation()
  const endpoint = getForwardEndpoint(forward) || t('observability.destinations.endpointUnknown')
  const samplingRate = Math.round(forward.sampling_rate * 100)
  return (
    <li className="rounded-md border border-mg-border/70 bg-mg-bg-0 p-4 transition-colors hover:border-brand-base/35">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand-base/15 bg-brand-base/10 text-brand-base">
            <LuRadio size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-mg-text-1">{forward.name}</p>
            <p className="mt-1 truncate text-xs text-mg-text-3">{endpoint}</p>
          </div>
        </div>
        <StatusBadge status={forward.status ?? ''} statusMap={statusMap} fallback={forward.status || 'Unknown'} />
      </div>
      <div className="mt-4 grid gap-2 text-[11px] text-mg-text-3 sm:grid-cols-3">
        <span>{t('observability.destinations.sampleRate', { rate: samplingRate })}</span>
        <span>
          {forward.privacy_mode_enabled
            ? t('observability.destinations.privacyOn')
            : t('observability.destinations.privacyOff')}
        </span>
        <span>
          {forward.last_success_at
            ? t('observability.destinations.lastSuccess', { time: formatRelativeTime(forward.last_success_at) })
            : t('observability.destinations.noLastSuccess')}
        </span>
      </div>
      {canManageForward && (
        <div className="mt-4 flex justify-end gap-2 border-t border-mg-border/60 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            icon={<LuPencil size={12} />}
            onClick={() => onEdit(forward)}
          >
            {t('common.edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-mg-danger hover:bg-mg-danger/5"
            icon={<LuTrash2 size={12} />}
            disabled={deleting}
            onClick={() => onDelete(forward.forward_id)}
          >
            {t('common.delete')}
          </Button>
        </div>
      )}
    </li>
  )
}

function latestSuccess(forwards: ForwardItem[]) {
  return forwards.reduce<string | null>((latest, forward) => {
    if (!forward.last_success_at) return latest
    if (!latest) return forward.last_success_at
    return new Date(forward.last_success_at).getTime() > new Date(latest).getTime()
      ? forward.last_success_at
      : latest
  }, null)
}

function PlatformRows({
  platforms,
  counts,
  canManageForward,
  onOpen,
}: {
  platforms: PlatformItem[]
  counts: Record<string, number>
  canManageForward: boolean
  onOpen: (platform: PlatformItem) => void
}) {
  const { t } = useTranslation()
  return (
    <ul className="divide-y divide-mg-border/60">
      {platforms.map((platform) => {
        const count = counts[platform.platform] ?? 0
        return (
          <li key={platform.platform}>
            <button
              type="button"
              disabled={!canManageForward}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-mg-fill-0/60 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={() => onOpen(platform)}
            >
              <span className="flex min-w-0 items-center gap-3">
                <PlatformLogo platform={platform} />
                <span className="truncate text-sm font-medium text-mg-text-1">{platform.display_name}</span>
              </span>
              {count > 0 && (
                <Badge variant="success" size="xs" dot className="shrink-0">
                  {t('observability.destinations.configuredCount', { count })}
                </Badge>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** 转发目标与平台管理面板。 */
export function DestinationsPanel({
  workspaceId,
  broadcastEnabled,
  canManageForward,
  panelClass = 'card-shadow-adaptive overflow-hidden rounded-lg border border-mg-border bg-card-bg',
}: {
  workspaceId: string
  broadcastEnabled: boolean
  canManageForward: boolean
  /** 面板外观类，随宿主（独立页/页签）切换；页签内为扁平子面板避免卡中卡。 */
  panelClass?: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [activePlatform, setActivePlatform] = useState<PlatformSelection | null>(null)
  const [editingForward, setEditingForward] = useState<ForwardItem | null>(null)

  const platformsQuery = useQuery({
    queryKey: ['observability', 'platforms', workspaceId],
    queryFn: () => listPlatforms(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  })
  const forwardsQuery = useQuery({
    queryKey: ['observability', 'forwards', workspaceId],
    queryFn: () => listForwards(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  })
  const platforms = platformsQuery.data?.items ?? []
  const forwards = forwardsQuery.data?.items ?? []
  const counts = forwards.reduce<Record<string, number>>((acc, forward) => {
    return { ...acc, [forward.platform]: (acc[forward.platform] ?? 0) + 1 }
  }, {})
  const latestSuccessAt = latestSuccess(forwards)
  const deliveryLabel = !broadcastEnabled
    ? t('observability.destinations.recentOff')
    : latestSuccessAt
      ? t('observability.destinations.recentAt', { time: formatRelativeTime(latestSuccessAt) })
      : t('observability.destinations.recentNone')
  const statusMap: Record<string, StatusConfig> = {
    active: { label: t('observability.status.active'), variant: 'success', dot: true },
    error: { label: t('observability.status.error'), variant: 'danger', dot: true },
    warning: { label: t('observability.status.warning'), variant: 'warning', dot: true },
  }

  const deleteMutation = useMutation({
    mutationFn: (forwardId: string) => deleteForward(workspaceId, forwardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] })
      appToast.success(t('observability.toast.deleteSuccess'))
    },
    onError: (err: unknown) => appToast.requestError(err, t('observability.toast.saveError')),
  })

  function openPlatform(platform: PlatformItem) {
    setEditingForward(null)
    setActivePlatform({ id: platform.platform, name: platform.display_name })
  }

  function handleAddDestination() {
    if (platforms[0]) openPlatform(platforms[0])
  }

  function handleEditForward(forward: ForwardItem) {
    const platform = platforms.find((item) => item.platform === forward.platform)
    setEditingForward(forward)
    setActivePlatform({ id: forward.platform, name: platform?.display_name ?? forward.name })
  }

  return (
    // self-start：右栏按内容自然高度，不被栅格拉伸（PRD align-self:start）。
    <aside className={cn('self-start', panelClass)}>
      <SectionHeader
        title={t('observability.destinations.panelTitle')}
        description={deliveryLabel}
        action={
          canManageForward && (
            <Button
              variant="outline"
              size="sm"
              icon={<LuPlus size={13} />}
              disabled={platformsQuery.isLoading || platforms.length === 0}
              onClick={handleAddDestination}
            >
              {t('observability.destinations.addButton')}
            </Button>
          )
        }
      />

      <div className="space-y-4 p-5">
        {forwardsQuery.isLoading ? (
          <EmptyState title={t('common.loading')} className="py-10" />
        ) : forwards.length === 0 ? (
          <EmptyState
            title={t('observability.destinations.emptyTitle')}
            description={t('observability.destinations.emptyDesc')}
            className="rounded-md border border-dashed border-mg-border/70 bg-mg-fill-0/30 py-10"
            action={
              canManageForward && (
                <Button
                  variant="brand"
                  size="sm"
                  icon={<LuPlus size={13} />}
                  disabled={platforms.length === 0}
                  onClick={handleAddDestination}
                >
                  {t('observability.destinations.addButton')}
                </Button>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {forwards.map((forward) => (
              <DestinationCard
                key={forward.forward_id}
                forward={forward}
                statusMap={statusMap}
                canManageForward={canManageForward}
                deleting={deleteMutation.isPending}
                onEdit={handleEditForward}
                onDelete={(forwardId) => deleteMutation.mutate(forwardId)}
              />
            ))}
          </ul>
        )}

        <Button asChild variant="outline" size="sm" className="w-full justify-center">
          <Link to="/logs">
            {t('observability.destinations.viewLogs')}
            <LuArrowUpRight size={13} />
          </Link>
        </Button>

        {/* 可用平台：扁平分区（去掉内层边框盒，避免面板内再套卡）。 */}
        <div className="border-t border-mg-border/60 pt-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-mg-text-3">
              {t('observability.destinations.availablePlatforms')}
            </p>
            <Badge variant="outline" size="xs">{platforms.length}</Badge>
          </div>
          {platformsQuery.isLoading ? (
            <EmptyState title={t('common.loading')} className="py-8" />
          ) : platforms.length === 0 ? (
            <EmptyState title={t('observability.destinations.noPlatforms')} className="py-8" />
          ) : (
            <PlatformRows platforms={platforms} counts={counts} canManageForward={canManageForward} onOpen={openPlatform} />
          )}
        </div>
      </div>

      <PlatformConfigModal
        key={editingForward?.forward_id ?? activePlatform?.id ?? 'none'}
        platform={activePlatform}
        workspaceId={workspaceId}
        editingForward={editingForward}
        onClose={() => {
          setActivePlatform(null)
          setEditingForward(null)
        }}
      />
    </aside>
  )
}
