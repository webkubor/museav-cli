import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import { TagInput } from '@/components/ui/TagInput'
import { listApiKeys } from '@/services/api-keys'
import Select from '@/components/ui/Select'
import { LuLink } from 'react-icons/lu'
import { useAuthStore } from '@/store/auth'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { appToast } from '@/lib/app-toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { StatusConfig } from '@/components/ui/StatusBadge'
import {
  getLoggingConfig,
  updateLoggingConfig,
  listPlatforms,
  createForward,
  updateForward,
  deleteForward,
  listForwards,
} from '@/services/observability'
import type { ForwardItem, LoggingConfig } from '@/types'

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  title,
  description,
  checked,
  loading,
  disabled = false,
  onChange,
  isFirst = false,
}: {
  title: string
  description: string
  checked: boolean
  loading: boolean
  disabled?: boolean
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
        <Switch checked={checked} disabled={loading || disabled} onChange={onChange} />
      </div>
    </div>
  )
}

// ─── 平台配置 Modal ──────────────────────────────────────────────────────────

function PlatformConfigModal({
  platform,
  workspaceId,
  editingForward,
  onClose,
}: {
  platform: { id: string; name: string } | null
  workspaceId: string
  editingForward?: ForwardItem | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(editingForward)
  const [name, setName] = useState(editingForward?.name ?? platform?.name ?? '')
  const [url, setUrl] = useState((editingForward?.config?.endpoint as string) ?? '')
  const [method, setMethod] = useState((editingForward?.config?.method as string) ?? 'POST')
  const [headers, setHeaders] = useState(editingForward?.config?.headers ? JSON.stringify(editingForward.config.headers) : '')
  const [privacyMode, setPrivacyMode] = useState(editingForward?.privacy_mode_enabled ?? false)
  const [sampling, setSampling] = useState(editingForward ? String(Math.round(editingForward.sampling_rate * 100)) : '100')
  const [apiKeyIds, setApiKeyIds] = useState<string[]>(editingForward?.api_key_ids ?? [])
  const keysQuery = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () => listApiKeys(workspaceId, { page_size: 100 }),
    enabled: Boolean(platform) && Boolean(workspaceId),
  })
  const keyOptions = (keysQuery.data?.items ?? []).map((k) => ({ id: k.api_key_id, name: k.name }))

  const buildConfig = () => {
    const config: Record<string, unknown> = { endpoint: url.trim() }
    if (headers) {
      try { config.headers = JSON.parse(headers) } catch { /* ignore */ }
    }
    return config
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        platform: editingForward?.platform ?? platform!.id,
        name,
        config: buildConfig(),
        enabled: true,
        sampling_rate: Number(sampling) / 100,
        api_key_ids: apiKeyIds,
        privacy_mode_enabled: privacyMode,
      }
      if (isEdit && editingForward) {
        return updateForward(workspaceId, editingForward.forward_id, body)
      }
      return createForward(workspaceId, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] })
      appToast.success(t('observability.toast.saveSuccess'))
      onClose()
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('observability.toast.saveError'))
    },
  })



  function handleSave() {
    if (!name.trim()) {
      appToast.error(t('observability.toast.nameRequired'))
      return
    }
    if (!url.trim()) {
      appToast.error(t('observability.toast.urlRequired'))
      return
    }
    saveMutation.mutate()
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
          <Button variant="brand" onClick={handleSave} loading={saveMutation.isPending}>保存</Button>
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
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/v1/traces" />
            <p className="text-[11px] text-mg-text-2 mt-1 leading-relaxed">需填完整 OTLP traces 地址，以 <code className="text-mg-text-1">/v1/traces</code> 结尾</p>
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
          <div className="flex items-start justify-between gap-4 pt-1">
            <div>
              <p className="text-sm font-semibold text-mg-text-0">隐私模式</p>
              <p className="text-xs text-mg-text-2 mt-0.5 leading-relaxed">开启后，traces 中将排除 prompt 与 completion 数据。</p>
            </div>
            <Switch checked={privacyMode} onChange={setPrivacyMode} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">采样率（%）</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={sampling}
              onChange={(e) => setSampling(e.target.value)}
              placeholder="100"
            />
            <p className="text-xs text-mg-text-2 mt-1.5">按比例采样上报，100 = 全量。</p>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-mg-text-1 uppercase tracking-widest mb-2">按 API Key 过滤（留空 = 全部）</label>
            <TagInput
              value={apiKeyIds.map((id) => keyOptions.find((o) => o.id === id)?.name ?? id)}
              onChange={(names) => setApiKeyIds(names.map((n) => keyOptions.find((o) => o.name === n)?.id).filter(Boolean) as string[])}
              suggestions={keyOptions.filter((o) => !apiKeyIds.includes(o.id)).map((o) => o.name)}
              allowFreeText={false}
              placeholder="选择 API Key…"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── 可用平台列表区块 ──────────────────────────────────────────────────────────

const FORWARD_STATUS_MAP: Record<string, StatusConfig> = {
  active: { label: 'Active', variant: 'success', dot: true },
  error: { label: 'Error', variant: 'danger', dot: true },
  warning: { label: 'Warning', variant: 'warning', dot: true },
}

function AvailablePlatformsSection({ workspaceId, canManageForward }: { workspaceId: string; canManageForward: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [activePlatform, setActivePlatform] = useState<{ id: string; name: string } | null>(null)
  const [editingForward, setEditingForward] = useState<ForwardItem | null>(null)

  const platformsQuery = useQuery({
    queryKey: ['observability', 'platforms', workspaceId],
    queryFn: () => listPlatforms(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  })
  const platforms = platformsQuery.data?.items ?? []

  const forwardsQuery = useQuery({
    queryKey: ['observability', 'forwards', workspaceId],
    queryFn: () => listForwards(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  })
  const forwards = forwardsQuery.data?.items ?? []

  const deleteMutation = useMutation({
    mutationFn: (forwardId: string) => deleteForward(workspaceId, forwardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] })
      appToast.success(t('observability.toast.deleteSuccess'))
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : t('observability.toast.saveError'))
    },
  })

  function handleEditForward(fwd: ForwardItem) {
    const p = platforms.find((pl) => pl.platform === fwd.platform)
    setEditingForward(fwd)
    setActivePlatform({ id: fwd.platform, name: p?.display_name ?? fwd.name })
  }

  function handleCloseModal() {
    setActivePlatform(null)
    setEditingForward(null)
  }

  return (
    <>
      {forwards.length > 0 && (
        <div className="rounded-xl border border-mg-border overflow-hidden bg-card-bg">
          <div className="px-5 py-3 border-b border-mg-border">
            <p className="text-[11px] font-bold text-mg-text-2 uppercase tracking-widest">已配置的 Destination</p>
          </div>
          <ul>
            {forwards.map((fwd, idx) => (
              <li
                key={fwd.forward_id}
                className={`flex items-center justify-between px-5 py-3 hover:bg-mg-fill-0/40 transition-colors ${idx !== 0 ? 'border-t border-mg-border' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge
                    status={fwd.status ?? ''}
                    statusMap={FORWARD_STATUS_MAP}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-mg-text-0 truncate">{fwd.name}</p>
                    <p className="text-xs text-mg-text-2 truncate">{fwd.config?.endpoint as string ?? ''}</p>
                  </div>
                </div>
                {canManageForward && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="text-xs text-mg-text-2 hover:text-brand-base transition-colors"
                      onClick={() => handleEditForward(fwd)}
                    >编辑</button>
                    <button
                      type="button"
                      className="text-xs text-mg-text-2 hover:text-mg-danger transition-colors"
                      onClick={() => deleteMutation.mutate(fwd.forward_id)}
                    >删除</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-mg-border overflow-hidden bg-card-bg">
        <div className="px-5 py-3 border-b border-mg-border">
          <p className="text-[11px] font-bold text-mg-text-2 uppercase tracking-widest">可用平台</p>
        </div>
        {platformsQuery.isLoading ? (
          <EmptyState title="加载中…" className="py-10" />
        ) : platforms.length === 0 ? (
          <EmptyState title="暂无可用平台" className="py-10" />
        ) : (
          <ul>
            {platforms.map((p, idx) => (
              <li
                key={p.platform}
                className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-mg-fill-0/40 transition-colors ${idx !== 0 ? 'border-t border-mg-border' : ''}`}
                onClick={() => setActivePlatform({ id: p.platform, name: p.display_name })}
              >
                <div className="flex items-center gap-3">
                  {p.logo_url ? (
                    <img src={p.logo_url} alt={p.display_name} className="w-8 h-8 rounded-lg object-contain bg-mg-fill-0 shrink-0" />
                  ) : (
                    <span className="w-8 h-8 rounded-lg bg-mg-fill-0 text-mg-text-1 flex items-center justify-center text-sm font-bold shrink-0">
                      {p.display_name.charAt(0)}
                    </span>
                  )}
                  <span className="text-sm font-medium text-mg-text-0">{p.display_name}</span>
                </div>
                {canManageForward && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-mg-text-2 hover:text-brand-base transition-colors"
                    onClick={(e) => { e.stopPropagation(); setActivePlatform({ id: p.platform, name: p.display_name }) }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Add Destination
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PlatformConfigModal
        key={editingForward?.forward_id ?? activePlatform?.id ?? 'none'}
        platform={activePlatform}
        workspaceId={workspaceId}
        editingForward={editingForward}
        onClose={handleCloseModal}
      />
    </>
  )
}

// ─── Main content (requires loaded config) ────────────────────────────────────

function ObservabilityContent({
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
          disabled={!canEditLogging}
          onChange={handleLoggingChange}
          isFirst
        />
        {!loggingEnabled && (
          <p className="px-5 pb-3 text-xs text-mg-warning">
            {t('observability.loggingOffWarning')}
          </p>
        )}
        <ToggleRow
          title={t('observability.broadcast.title')}
          description={t('observability.broadcast.desc')}
          checked={broadcastEnabled}
          loading={saveMutation.isPending}
          disabled={!canEditLogging}
          onChange={handleBroadcastChange}
        />
      </div>

      {/* 可用平台：常驻展示（对齐原型，不依赖广播开关） */}
      <AvailablePlatformsSection workspaceId={workspaceId} canManageForward={canManageForward} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const { t } = useTranslation()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const { hasPermission } = usePermissions()
  const canEditLogging = hasPermission(PERMS.OBSERVABILITY_LOGGING_EDIT)
  const canManageForward = hasPermission(PERMS.OBSERVABILITY_FORWARD_MANAGE)

  const loggingQuery = useQuery({
    queryKey: ['observability', 'logging', activeWorkspaceId],
    queryFn: () => getLoggingConfig(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('observability.title')}
        description={t('observability.desc')}
      />

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
          canEditLogging={canEditLogging}
          canManageForward={canManageForward}
        />
      )}
    </div>
  )
}
