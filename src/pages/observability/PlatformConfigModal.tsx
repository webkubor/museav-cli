/**
 * 可观测性转发目标配置弹窗
 * 路由：/observability；空间详情「日志与转发」页签复用
 * API：GET /workspaces/:id/api-keys、
 * POST|PATCH /workspaces/:id/observability/broadcast-destinations
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LuLink } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import { Textarea } from '@/components/ui/Textarea'
import { appToast } from '@/lib/app-toast'
import { createForward, updateForward } from '@/services/observability'
import { listApiKeys } from '@/services/api-keys'
import type { ForwardItem } from '@/types'
import { ApiKeyMultiSelect } from './ApiKeyMultiSelect'
import type { PlatformSelection } from './observability-utils'

/** 转发目标新增/编辑弹窗。 */
export function PlatformConfigModal({
  platform,
  workspaceId,
  editingForward,
  onClose,
}: {
  platform: PlatformSelection | null
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
  const [headers, setHeaders] = useState(
    editingForward?.config?.headers ? JSON.stringify(editingForward.config.headers) : ''
  )
  const [privacyMode, setPrivacyMode] = useState(editingForward?.privacy_mode_enabled ?? false)
  const [sampling, setSampling] = useState(
    editingForward ? String(Math.round(editingForward.sampling_rate * 100)) : '100'
  )
  // 多选下拉：回填已存的 Key id 数组，空数组=不指定（转发所有 Key）。
  const [apiKeyIds, setApiKeyIds] = useState<string[]>(editingForward?.api_key_ids ?? [])

  const keysQuery = useQuery({
    queryKey: ['api-keys', workspaceId],
    // 下拉候选需要全量：不带分页参数（page_size:0=不限），避免超过一页时静默截断（#60）
    queryFn: () => listApiKeys(workspaceId),
    enabled: Boolean(platform) && Boolean(workspaceId),
  })
  const keyOptions = (keysQuery.data?.items ?? []).map((key) => ({
    id: key.api_key_id,
    name: key.name,
  }))

  function buildConfig() {
    const config: Record<string, unknown> = { endpoint: url.trim(), method }
    if (!headers) return config
    try {
      return { ...config, headers: JSON.parse(headers) }
    } catch {
      return null
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const config = buildConfig()
      if (!config) return Promise.reject(new Error(t('observability.form.headersInvalid')))
      const body = {
        platform: editingForward?.platform ?? platform!.id,
        name,
        config,
        enabled: true,
        sampling_rate: Number(sampling) / 100,
        api_key_ids: apiKeyIds,
        privacy_mode_enabled: privacyMode,
      }
      return isEdit && editingForward
        ? updateForward(workspaceId, editingForward.forward_id, body)
        : createForward(workspaceId, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] })
      appToast.success(t('observability.toast.saveSuccess'))
      onClose()
    },
    onError: (err: unknown) => {
      appToast.requestError(err, t('observability.toast.saveError'))
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
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="brand" onClick={handleSave} loading={saveMutation.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[180px_1fr]">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-mg-text-1">
            <LuLink size={15} className="text-brand-base" />
            {t('observability.form.connectionTitle')}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-mg-text-3">
            {t('observability.form.connectionDesc')}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-mg-text-2">
              {t('observability.form.nameLabel')}
            </label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('observability.form.namePlaceholder')}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-mg-text-2">URL</label>
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://api.example.com/v1/traces"
            />
            <p className="mt-1 text-xs leading-relaxed text-mg-text-3">{t('observability.form.urlHint')}</p>
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-mg-text-2">
              {t('observability.form.methodLabel')}
            </label>
            <Select value={method} onChange={setMethod} className="w-full">
              <Select.Option value="POST">POST</Select.Option>
              <Select.Option value="GET">GET</Select.Option>
              <Select.Option value="PUT">PUT</Select.Option>
              <Select.Option value="PATCH">PATCH</Select.Option>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-mg-text-2">
              {t('observability.form.headersLabel')}
            </label>
            <Textarea value={headers} onChange={(event) => setHeaders(event.target.value)} rows={3} />
          </div>
          <div className="flex items-start justify-between gap-4 pt-1">
            <div>
              <p className="text-sm font-semibold text-mg-text-1">{t('observability.form.privacyMode')}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-mg-text-3">
                {t('observability.form.privacyHint')}
              </p>
            </div>
            <Switch checked={privacyMode} onChange={setPrivacyMode} />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-mg-text-2">
              {t('observability.form.samplingRate')}
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={sampling}
              onChange={(event) => setSampling(event.target.value)}
              placeholder="100"
            />
            <p className="mt-1.5 text-xs text-mg-text-3">{t('observability.form.samplingHint')}</p>
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-mg-text-2">
              {t('observability.form.apiKeyFilter')}
            </label>
            <ApiKeyMultiSelect
              value={apiKeyIds}
              onChange={setApiKeyIds}
              options={keyOptions}
              loading={keysQuery.isLoading}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-mg-text-3">
              {t('observability.form.apiKeyFilterHint')}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
