import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Modal, Select, Skeleton, Switch, Table, Tabs, Toast } from '@douyinfe/semi-ui'
import { useAuthStore } from '@/store/auth'
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DeadLetterStatusFilter = 'all' | 'pending' | 'retrying' | 'ignored'

function formatDT(val: string | null | undefined) {
  if (!val) return '—'
  return new Date(val).toLocaleString('zh-CN', { hour12: false })
}

function deadLetterStatusStyle(status: 'pending' | 'retrying' | 'ignored'): React.CSSProperties {
  const map: Record<string, React.CSSProperties> = {
    pending: { backgroundColor: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: '100px', padding: '2px 10px', fontSize: '12px', fontWeight: 500 },
    retrying: { backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '100px', padding: '2px 10px', fontSize: '12px', fontWeight: 500 },
    ignored: { backgroundColor: 'var(--semi-color-bg-1)', color: 'var(--semi-color-text-2)', border: '1px solid var(--semi-color-border)', borderRadius: '100px', padding: '2px 10px', fontSize: '12px', fontWeight: 500 },
  }
  return map[status] ?? {}
}

function deadLetterStatusLabel(status: 'pending' | 'retrying' | 'ignored') {
  const map: Record<string, string> = { pending: '待重试', retrying: '重试中', ignored: '已忽略' }
  return map[status] ?? status
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  padding: '28px',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  marginBottom: '24px',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: 'var(--semi-color-text-0)',
  margin: '0 0 6px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--semi-color-text-1)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: '8px',
}

// ─── LoggingTab ───────────────────────────────────────────────────────────────

function LoggingTab() {
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const loggingQuery = useQuery({
    queryKey: ['observability', 'logging', activeWorkspaceId],
    queryFn: () => getLoggingConfig(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  if (loggingQuery.isLoading) {
    return (
      <div style={{ ...cardStyle, maxWidth: '640px' }}>
        <Skeleton.Title style={{ width: '40%', marginBottom: '12px' }} />
        <Skeleton.Paragraph rows={3} />
      </div>
    )
  }

  if (!loggingQuery.data || !activeWorkspaceId) {
    return (
      <div style={{ ...cardStyle, maxWidth: '640px', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: '14px', padding: '48px' }}>
        暂无配置
      </div>
    )
  }

  return (
    <LoggingForm
      key={activeWorkspaceId}
      workspaceId={activeWorkspaceId}
      config={loggingQuery.data}
      onSaved={() => qc.invalidateQueries({ queryKey: ['observability', 'logging', activeWorkspaceId] })}
    />
  )
}

function LoggingForm({
  workspaceId,
  config,
  onSaved,
}: {
  workspaceId: string
  config: LoggingConfig
  onSaved: () => void
}) {
  const [loggingEnabled, setLoggingEnabled] = useState(config.input_output_logging_enabled)
  const [broadcastEnabled, setBroadcastEnabled] = useState(config.broadcast_enabled)

  const saveMutation = useMutation({
    mutationFn: () =>
      updateLoggingConfig(workspaceId, {
        input_output_logging_enabled: loggingEnabled,
        broadcast_enabled: broadcastEnabled,
      }),
    onSuccess: () => {
      Toast.success('日志配置已保存')
      onSaved()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '保存失败'
      Toast.error(msg)
    },
  })

  return (
    <div style={{ ...cardStyle, maxWidth: '640px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h3 style={sectionTitleStyle}>日志记录</h3>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0 }}>
          配置请求输入/输出的日志采集与广播行为。
        </p>
      </div>

      <div
        style={{
          borderRadius: '10px',
          border: '1px solid var(--semi-color-fill-0)',
          overflow: 'hidden',
          marginBottom: '24px',
        }}
      >
        {/* Row 1 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid var(--semi-color-bg-1)',
          }}
        >
          <div>
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--semi-color-text-0)', margin: '0 0 3px' }}>
              输入 / 输出日志
            </p>
            <p style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', margin: 0 }}>
              记录每次请求的完整输入和模型输出内容。
            </p>
          </div>
          <Switch checked={loggingEnabled} onChange={(v) => setLoggingEnabled(v)} />
        </div>

        {/* Row 2 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
          }}
        >
          <div>
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--semi-color-text-0)', margin: '0 0 3px' }}>
              广播转发
            </p>
            <p style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', margin: 0 }}>
              将日志实时推送到已配置的转发目标（如 Datadog、OpenTelemetry）。
            </p>
          </div>
          <Switch checked={broadcastEnabled} onChange={(v) => setBroadcastEnabled(v)} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          theme="solid"
          type="primary"
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          保存配置
        </Button>
      </div>
    </div>
  )
}

// ─── DestinationsTab ──────────────────────────────────────────────────────────

function DestinationsTab() {
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const [platform, setPlatform] = useState('')

  const platformsQuery = useQuery({
    queryKey: ['observability', 'platforms', activeWorkspaceId],
    queryFn: () => listPlatforms(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })

  const forwardsQuery = useQuery({
    queryKey: ['observability', 'forwards', activeWorkspaceId],
    queryFn: () => listForwards(activeWorkspaceId!),
    enabled: Boolean(activeWorkspaceId),
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
      createForward(activeWorkspaceId!, {
        platform: selectedPlatformId,
        name: payload.name,
        config: payload.config,
        enabled: true,
      }),
    onSuccess: () => {
      Toast.success('转发目标已创建')
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '创建失败'
      Toast.error(msg)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (values: { forwardId: string; enabled: boolean }) =>
      updateForward(activeWorkspaceId!, values.forwardId, { enabled: values.enabled }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', activeWorkspaceId] }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '操作失败'
      Toast.error(msg)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (forwardId: string) => deleteForward(activeWorkspaceId!, forwardId),
    onSuccess: () => {
      Toast.success('转发目标已删除')
      qc.invalidateQueries({ queryKey: ['observability', 'forwards', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '删除失败'
      Toast.error(msg)
    },
  })

  const forwards = forwardsQuery.data?.items ?? []

  const forwardColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (v: string) => (
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--semi-color-text-0)' }}>{v}</span>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      render: (v: string) => <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>{v}</span>,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      render: (v: boolean) => (
        <span
          style={
            v
              ? { backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', borderRadius: '100px', padding: '2px 10px', fontSize: '12px', fontWeight: 500 }
              : { backgroundColor: 'var(--semi-color-bg-1)', color: 'var(--semi-color-text-2)', border: '1px solid var(--semi-color-border)', borderRadius: '100px', padding: '2px 10px', fontSize: '12px', fontWeight: 500 }
          }
        >
          {v ? '启用中' : '已暂停'}
        </span>
      ),
    },
    {
      title: '最近成功',
      dataIndex: 'last_success_at',
      render: (v: string | null) => (
        <span style={{ fontSize: '13px', color: 'var(--semi-color-text-2)' }}>{formatDT(v)}</span>
      ),
    },
    {
      title: '',
      dataIndex: 'forward_id',
      render: (_: unknown, row: { forward_id: string; enabled: boolean; name: string }) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
          <Button
            size="small"
            onClick={() => toggleMutation.mutate({ forwardId: row.forward_id, enabled: !row.enabled })}
            style={{ fontSize: '12px', color: 'var(--semi-color-text-1)' }}
          >
            {row.enabled ? '暂停' : '恢复'}
          </Button>
          <Button
            size="small"
            type="danger"
            onClick={() => {
              Modal.confirm({
                title: '删除转发目标',
                content: `确定要删除「${row.name}」吗？此操作不可撤销。`,
                okText: '确认删除',
                cancelText: '取消',
                onOk: () => removeMutation.mutate(row.forward_id),
              })
            }}
            style={{ fontSize: '12px' }}
          >
            删除
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Create form card */}
      <div style={cardStyle}>
        <h3 style={{ ...sectionTitleStyle, marginBottom: '20px' }}>添加转发目标</h3>
        <CreateForwardForm
          key={selectedPlatformId}
          platformItems={platformsQuery.data?.items ?? []}
          selectedPlatformId={selectedPlatformId}
          selectedPlatform={selectedPlatform}
          onPlatformChange={setPlatform}
          isSubmitting={createMutation.isPending}
          onSubmit={(name, config) => {
            if (!activeWorkspaceId || !selectedPlatformId || !name.trim()) return
            createMutation.mutate({ name, config })
          }}
        />
      </div>

      {/* List card */}
      <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--semi-color-fill-0)' }}>
          <h3 style={{ ...sectionTitleStyle, margin: 0 }}>已配置的转发目标</h3>
        </div>
        {forwardsQuery.isLoading ? (
          <div style={{ padding: '24px' }}>
            <Skeleton.Paragraph rows={3} />
          </div>
        ) : (
          <Table
            columns={forwardColumns}
            dataSource={forwards}
            rowKey="forward_id"
            pagination={false}
            empty={
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: '13px', fontStyle: 'italic' }}>
                暂无转发目标，请在上方添加
              </div>
            }
            style={{ borderRadius: 0 }}
          />
        )}
      </div>
    </div>
  )
}

// ─── CreateForwardForm (inlined) ──────────────────────────────────────────────

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

  function handleSubmit() {
    onSubmit(name, configValues)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px' }}>
        <div>
          <label style={labelStyle}>平台</label>
          <Select
            value={selectedPlatformId}
            onChange={(v) => onPlatformChange(v as string)}
            style={{ width: '100%' }}
          >
            {platformItems.map((item) => (
              <Select.Option key={item.platform} value={item.platform}>
                {item.display_name}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div>
          <label style={labelStyle}>名称</label>
          <Input
            value={name}
            placeholder="为此目标起一个名称"
            onChange={(v) => setName(v)}
            size="large"
          />
        </div>
      </div>

      {fields.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: fields.length > 1 ? '1fr 1fr' : '1fr',
            gap: '20px',
          }}
        >
          {fields.map((field) => (
            <div key={field.key}>
              <label style={labelStyle}>
                {field.label}
                {field.required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
              </label>
              <Input
                value={configValues[field.key] ?? ''}
                placeholder={field.label}
                mode={field.type === 'secret' ? 'password' : undefined}
                onChange={(v) => setConfigValues((prev) => ({ ...prev, [field.key]: v }))}
                size="large"
              />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          theme="solid"
          type="primary"
          loading={isSubmitting}
          onClick={handleSubmit}
          style={{ paddingLeft: '32px', paddingRight: '32px' }}
        >
          创建目标
        </Button>
      </div>
    </div>
  )
}

// ─── FailuresTab ──────────────────────────────────────────────────────────────

function FailuresTab() {
  const qc = useQueryClient()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const [statusFilter, setStatusFilter] = useState<DeadLetterStatusFilter>('all')

  const deadLettersQuery = useQuery({
    queryKey: ['observability', 'dead-letters', activeWorkspaceId, statusFilter],
    queryFn: () =>
      listDeadLetters(activeWorkspaceId!, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        page_size: 20,
      }),
    enabled: Boolean(activeWorkspaceId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const retryMutation = useMutation({
    mutationFn: (deadLetterId: string) => retryDeadLetter(activeWorkspaceId!, deadLetterId),
    onSuccess: () => {
      Toast.success('已触发重试')
      qc.invalidateQueries({ queryKey: ['observability', 'dead-letters', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '重试失败'
      Toast.error(msg)
    },
  })

  const ignoreMutation = useMutation({
    mutationFn: (deadLetterId: string) => deleteDeadLetter(activeWorkspaceId!, deadLetterId),
    onSuccess: () => {
      Toast.success('已标记为忽略')
      qc.invalidateQueries({ queryKey: ['observability', 'dead-letters', activeWorkspaceId] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '操作失败'
      Toast.error(msg)
    },
  })

  const deadLetters = deadLettersQuery.data?.items ?? []

  const columns = [
    {
      title: '平台',
      dataIndex: 'platform',
      render: (v: string) => (
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--semi-color-text-0)' }}>{v}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: 'pending' | 'retrying' | 'ignored') => (
        <span style={deadLetterStatusStyle(v)}>{deadLetterStatusLabel(v)}</span>
      ),
    },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      render: (v: string, row: { payload_excerpt: string }) => (
        <div>
          <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: '0 0 3px', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v}
          </p>
          <p style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', margin: 0, maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.payload_excerpt}
          </p>
        </div>
      ),
    },
    {
      title: '重试次数',
      dataIndex: 'attempts',
      render: (v: number) => <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>{v}</span>,
    },
    {
      title: '最近尝试',
      dataIndex: 'last_attempted_at',
      render: (v: string, row: { created_at: string }) => (
        <span style={{ fontSize: '13px', color: 'var(--semi-color-text-2)' }}>{formatDT(v || row.created_at)}</span>
      ),
    },
    {
      title: '',
      dataIndex: 'dead_letter_id',
      render: (_: unknown, row: { dead_letter_id: string; status: 'pending' | 'retrying' | 'ignored' }) =>
        row.status !== 'ignored' ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            <Button
              size="small"
              loading={retryMutation.isPending}
              onClick={() => retryMutation.mutate(row.dead_letter_id)}
              style={{ fontSize: '12px' }}
            >
              重试
            </Button>
            <Button
              size="small"
              loading={ignoreMutation.isPending}
              onClick={() => ignoreMutation.mutate(row.dead_letter_id)}
              style={{ fontSize: '12px', color: 'var(--semi-color-text-1)' }}
            >
              忽略
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--semi-color-fill-0)',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ ...sectionTitleStyle, margin: 0 }}>失败重试</h3>
        <Select
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as DeadLetterStatusFilter)}
          style={{ width: '160px' }}
        >
          <Select.Option value="all">全部状态</Select.Option>
          <Select.Option value="pending">待重试</Select.Option>
          <Select.Option value="retrying">重试中</Select.Option>
          <Select.Option value="ignored">已忽略</Select.Option>
        </Select>
      </div>

      {deadLettersQuery.isLoading ? (
        <div style={{ padding: '24px' }}>
          <Skeleton.Paragraph rows={4} />
        </div>
      ) : deadLetters.length === 0 ? (
        <div
          style={{
            padding: '64px',
            textAlign: 'center',
            color: 'var(--semi-color-text-2)',
            fontSize: '13px',
            fontStyle: 'italic',
          }}
        >
          暂无失败记录
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={deadLetters}
          rowKey="dead_letter_id"
          pagination={false}
          style={{ borderRadius: 0 }}
        />
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  return (
    <div style={{ padding: '32px', maxWidth: '1280px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: 0 }}>
          可观测性
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--semi-color-text-1)', margin: '6px 0 0' }}>
          管理日志记录、数据转发目标与失败事件的重试策略。
        </p>
      </div>

      <Tabs defaultActiveKey="logging">
        <Tabs.TabPane tab="日志记录" itemKey="logging">
          <div style={{ paddingTop: '24px' }}>
            <LoggingTab />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="转发目标" itemKey="destinations">
          <div style={{ paddingTop: '24px' }}>
            <DestinationsTab />
          </div>
        </Tabs.TabPane>
        <Tabs.TabPane tab="失败重试" itemKey="failures">
          <div style={{ paddingTop: '24px' }}>
            <FailuresTab />
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}
