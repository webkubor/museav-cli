import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/Select'
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
  deleteDeadLetter,
  deleteForward,
  getLoggingConfig,
  listDeadLetters,
  listForwards,
  listPlatforms,
  retryDeadLetter,
  updateForward,
  updateLoggingConfig,
} from '@/services/observability'
import type { LoggingConfig, PlatformConfigField } from '@/types'
import { formatDateTime } from '@/lib/format-date'

type DeadLetterStatusFilter = 'all' | 'pending' | 'retrying' | 'ignored'

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
    <div className={`flex items-center justify-between p-5 gap-6 ${isFirst ? '' : 'border-t border-semi-color-border'}`}>
      <div>
        <p className="text-sm font-semibold text-semi-color-text-0 mb-1">
          {title}
        </p>
        <p className="text-xs text-semi-color-text-2">
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
        <Switch checked={checked} disabled={loading} onCheckedChange={onChange} />
      </div>
    </div>
  )
}

// ─── Destinations section ─────────────────────────────────────────────────────

function DestinationsSection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const [platform, setPlatform] = useState('')
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
    mutationFn: (payload: { name: string; config: Record<string, string> }) =>
      createForward(workspaceId, {
        platform: selectedPlatformId,
        name: payload.name,
        config: payload.config,
        enabled: true,
      }),
    onSuccess: () => {
      appToast.success('转发目标已创建')
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '创建失败')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (values: { forwardId: string; enabled: boolean }) =>
      updateForward(workspaceId, values.forwardId, { enabled: values.enabled }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] }),
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '操作失败')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (forwardId: string) => deleteForward(workspaceId, forwardId),
    onSuccess: () => {
      appToast.success('转发目标已删除')
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', workspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '删除失败')
    },
  })

  const forwards = forwardsQuery.data?.items ?? []

  return (
    <>
      {/* Add destination form */}
      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-semi-color-border overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-semi-color-border">
          <h3 className="text-sm font-bold text-semi-color-text-0">添加转发目标</h3>
        </div>
        <div className="p-5">
          <CreateForwardForm
            key={selectedPlatformId}
            platformItems={platformsQuery.data?.items ?? []}
            selectedPlatformId={selectedPlatformId}
            selectedPlatform={selectedPlatform}
            onPlatformChange={setPlatform}
            isSubmitting={createMutation.isPending}
            onSubmit={(name, config) => {
              if (!selectedPlatformId || !name.trim()) return
              createMutation.mutate({ name, config })
            }}
          />
        </div>
      </div>

      {/* Destinations list */}
      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-semi-color-border overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-semi-color-border">
          <h3 className="text-sm font-bold text-semi-color-text-0">已配置的转发目标</h3>
        </div>
        {forwardsQuery.isLoading ? (
          <div className="p-5 space-y-2 animate-pulse">
            <div className="h-4 bg-semi-color-fill-0 rounded w-1/3" />
            <div className="h-4 bg-semi-color-fill-0 rounded w-full" />
            <div className="h-4 bg-semi-color-fill-0 rounded w-2/3" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最近成功</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forwards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-xs italic text-semi-color-text-2">
                    暂无转发目标，请在上方添加
                  </TableCell>
                </TableRow>
              ) : (
                forwards.map((row) => (
                  <TableRow key={row.forward_id}>
                    <TableCell className="font-semibold text-semi-color-text-0 text-[13.5px]">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-xs text-semi-color-text-1">
                      {row.platform}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.enabled ? 'success' : 'outline'}>
                        {row.enabled ? '启用中' : '已暂停'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-semi-color-text-2">
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
                          {row.enabled ? '暂停' : '恢复'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget({ id: row.forward_id, name: row.name })}
                          className="h-7 text-xs"
                        >
                          删除
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>删除转发目标</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteTarget?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
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
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── CreateForwardForm ────────────────────────────────────────────────────────

function CreateForwardForm({
  platformItems,
  selectedPlatformId,
  selectedPlatform,
  onPlatformChange,
  isSubmitting,
  onSubmit,
}: {
  platformItems: { platform: string; display_name: string }[]
  selectedPlatformId: string
  selectedPlatform: { config_schema: { fields: PlatformConfigField[] } } | undefined
  onPlatformChange: (id: string) => void
  isSubmitting: boolean
  onSubmit: (name: string, config: Record<string, string>) => void
}) {
  const fields = selectedPlatform?.config_schema.fields ?? []
  const [name, setName] = useState('')
  const [configValues, setConfigValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, '']))
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-[11px] font-bold text-semi-color-text-1 uppercase tracking-widest mb-2">平台</label>
          <Select
            value={selectedPlatformId}
            onValueChange={onPlatformChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {platformItems.map((item) => (
                <SelectItem key={item.platform} value={item.platform}>
                  {item.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-semi-color-text-1 uppercase tracking-widest mb-2">名称</label>
          <Input
            value={name}
            placeholder="为此目标起一个名称"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>

      {fields.length > 0 && (
        <div className={`grid gap-5 ${fields.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-[11px] font-bold text-semi-color-text-1 uppercase tracking-widest mb-2">
                {field.label}
                {field.required && <span className="text-rose-500 ml-1">*</span>}
              </label>
              <Input
                value={configValues[field.key] ?? ''}
                placeholder={field.label}
                type={field.type === 'secret' ? 'password' : 'text'}
                onChange={(e) => setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          variant="brand"
          loading={isSubmitting}
          onClick={() => onSubmit(name, configValues)}
          className="px-8"
        >
          创建目标
        </Button>
      </div>
    </div>
  )
}

// ─── Dead Letters section ─────────────────────────────────────────────────────

function DeadLettersSection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<DeadLetterStatusFilter>('all')

  const deadLettersQuery = useQuery({
    queryKey: ['observability', 'dead-letters', workspaceId, statusFilter],
    queryFn: () =>
      listDeadLetters(workspaceId, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        page_size: 20,
      }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const retryMutation = useMutation({
    mutationFn: (deadLetterId: string) => retryDeadLetter(workspaceId, deadLetterId),
    onSuccess: () => {
      appToast.success('已触发重试')
      qc.invalidateQueries({ queryKey: ['observability', 'dead-letters', workspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '重试失败')
    },
  })

  const ignoreMutation = useMutation({
    mutationFn: (deadLetterId: string) => deleteDeadLetter(workspaceId, deadLetterId),
    onSuccess: () => {
      appToast.success('已标记为忽略')
      qc.invalidateQueries({ queryKey: ['observability', 'dead-letters', workspaceId] })
    },
    onError: (err: unknown) => {
      appToast.error(err instanceof Error ? err.message : '操作失败')
    },
  })

  const deadLetters = deadLettersQuery.data?.items ?? []

  return (
    <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-semi-color-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-semi-color-border gap-4 flex-wrap">
        <h3 className="text-sm font-bold text-semi-color-text-0">失败重试</h3>
        <div className="w-40 shrink-0">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DeadLetterStatusFilter)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待重试</SelectItem>
              <SelectItem value="retrying">重试中</SelectItem>
              <SelectItem value="ignored">已忽略</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {deadLettersQuery.isLoading ? (
        <div className="p-5 space-y-2 animate-pulse">
          <div className="h-4 bg-semi-color-fill-0 rounded w-1/4" />
          <div className="h-4 bg-semi-color-fill-0 rounded w-full" />
        </div>
      ) : deadLetters.length === 0 ? (
        <div className="py-16 text-center text-xs italic text-semi-color-text-2">
          暂无失败记录
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>平台</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>错误信息</TableHead>
              <TableHead>重试次数</TableHead>
              <TableHead>最近尝试</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deadLetters.map((row) => (
              <TableRow key={row.dead_letter_id}>
                <TableCell className="font-semibold text-semi-color-text-0 text-[13.5px]">
                  {row.platform}
                </TableCell>
                <TableCell>
                  <Badge variant={row.status === 'pending' ? 'warning' : row.status === 'retrying' ? 'secondary' : 'outline'}>
                    {row.status === 'pending' ? '待重试' : row.status === 'retrying' ? '重试中' : '已忽略'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="max-w-xs md:max-w-md">
                    <p className="text-[13px] text-semi-color-text-0 font-medium truncate">{row.error_message}</p>
                    <p className="text-xs text-semi-color-text-2 truncate mt-0.5 font-mono">{row.payload_excerpt}</p>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-semi-color-text-1 font-semibold">
                  {row.attempts}
                </TableCell>
                <TableCell className="text-xs text-semi-color-text-2">
                  {formatDateTime(row.last_attempted_at || row.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  {row.status !== 'ignored' && (
                    <div className="flex justify-end gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        loading={retryMutation.isPending} 
                        onClick={() => retryMutation.mutate(row.dead_letter_id)} 
                        className="h-7 text-xs font-semibold"
                      >
                        重试
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        loading={ignoreMutation.isPending} 
                        onClick={() => ignoreMutation.mutate(row.dead_letter_id)} 
                        className="h-7 text-xs text-semi-color-text-1 hover:text-semi-color-text-0 hover:bg-semi-color-fill-0 font-semibold"
                      >
                        忽略
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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
      appToast.error(err instanceof Error ? err.message : '保存失败')
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
      <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-semi-color-border overflow-hidden">
        <ToggleRow
          title="输入 / 输出日志"
          description="记录每次请求的完整输入和模型输出内容。"
          checked={loggingEnabled}
          loading={saveMutation.isPending}
          onChange={handleLoggingChange}
          isFirst
        />

        {/* Section 2: Broadcast toggle — only when logging is on */}
        {loggingEnabled && (
          <ToggleRow
            title="广播转发"
            description="将日志实时推送到已配置的转发目标（如 Datadog、OpenTelemetry）。"
            checked={broadcastEnabled}
            loading={saveMutation.isPending}
            onChange={handleBroadcastChange}
          />
        )}
      </div>

      {/* Section 3 & 4: Destinations + Dead letters — only when broadcast is on */}
      {loggingEnabled && broadcastEnabled && (
        <>
          <DestinationsSection workspaceId={workspaceId} />
          <DeadLettersSection workspaceId={workspaceId} />
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
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
        <h1 className="text-2xl font-bold tracking-tight text-semi-color-text-0">
          可观测性
        </h1>
        <p className="text-sm text-semi-color-text-1 mt-1.5 font-medium">
          管理日志记录、数据转发目标与失败事件的重试策略。
        </p>
      </div>

      {loggingQuery.isLoading && (
        <div className="card-shadow-adaptive bg-card-bg rounded-xl border border-semi-color-border p-6 max-w-3xl space-y-4 animate-pulse">
          <div className="h-5 bg-semi-color-fill-0 rounded w-1/3" />
          <div className="h-4 bg-semi-color-fill-0 rounded w-full" />
          <div className="h-4 bg-semi-color-fill-0 rounded w-2/3" />
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
