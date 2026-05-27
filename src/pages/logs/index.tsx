import { useState } from 'react'
import { Table, Tag, Input, Select, Button, Spin, Typography } from '@douyinfe/semi-ui'
import { IconSearch } from '@douyinfe/semi-icons'
import { useQuery } from '@tanstack/react-query'
import { listCallLogs, getLogStats } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import type { CallLogItem } from '@/types'
import type { CallLogListParams } from '@/interfaces/logs'

const { Text } = Typography

type Preset = '1h' | '24h' | '7d'
type StatusFilter = 'all' | 'succeeded' | 'failed' | 'rejected'

const STATUS_CONFIG: Record<
  CallLogItem['status'],
  { bg: string; color: string; border: string; label: string }
> = {
  succeeded: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', label: '成功' },
  failed:    { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: '失败' },
  rejected:  { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa', label: '拒绝' },
  accepted:  { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', label: '接受' },
}

function StatusTag({ status }: { status: CallLogItem['status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.accepted
  return (
    <Tag
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        fontSize: '11px',
        fontWeight: 700,
        padding: '1px 8px',
        borderRadius: '12px',
      }}
    >
      {cfg.label}
    </Tag>
  )
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #f1f5f9',
        padding: '20px 24px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 500, marginBottom: '10px' }}>
        {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{sub}</div>
      )}
    </div>
  )
}

export default function LogsPage() {
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  const [preset, setPreset] = useState<Preset>('24h')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [requestIdSearch, setRequestIdSearch] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [allItems, setAllItems] = useState<CallLogItem[]>([])

  // ─── Stats query ────────────────────────────────────────────────────
  const statsQuery = useQuery({
    queryKey: ['log-stats', activeWorkspaceId, preset],
    queryFn: () =>
      getLogStats({
        preset,
        workspace_id: activeWorkspaceId ?? undefined,
      }),
    enabled: !!activeWorkspaceId,
  })

  // ─── Log list query ─────────────────────────────────────────────────
  const params: CallLogListParams = {
    preset,
    workspace_id: activeWorkspaceId ?? undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    request_id: requestIdSearch.trim() || undefined,
    limit: 20,
    cursor: cursor ?? undefined,
  }

  const logsQuery = useQuery({
    queryKey: ['call-logs', activeWorkspaceId, preset, statusFilter, requestIdSearch, cursor],
    queryFn: async () => {
      const page = await listCallLogs(params)
      if (cursor === null) {
        // first page or filter reset
        setAllItems(page.items)
      } else {
        setAllItems((prev) => [...prev, ...page.items])
      }
      return page
    },
    enabled: !!activeWorkspaceId,
  })

  // ─── Handlers ───────────────────────────────────────────────────────
  function handlePresetChange(p: Preset) {
    setPreset(p)
    setCursor(null)
    setAllItems([])
  }

  function handleStatusChange(val: StatusFilter) {
    setStatusFilter(val)
    setCursor(null)
    setAllItems([])
  }

  function handleSearchChange(val: string) {
    setRequestIdSearch(val)
    setCursor(null)
    setAllItems([])
  }

  function handleLoadMore() {
    const nextCursor = logsQuery.data?.next_cursor ?? null
    if (nextCursor) {
      setCursor(nextCursor)
    }
  }

  // ─── Table columns ───────────────────────────────────────────────────
  const columns = [
    {
      title: '时间',
      dataIndex: 'started_at',
      width: 160,
      render: (val: string) => (
        <span style={{ color: '#475569', fontSize: '12.5px' }}>
          {new Date(val).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}
        </span>
      ),
    },
    {
      title: '模型',
      dataIndex: 'model',
      render: (_: unknown, record: CallLogItem) => (
        <span style={{ color: '#0f172a', fontWeight: 500, fontSize: '13px' }}>
          {record.model.display_name}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (val: CallLogItem['status']) => <StatusTag status={val} />,
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      width: 90,
      render: (val: number) => (
        <span style={{ color: '#475569', fontSize: '13px' }}>
          {val >= 1000 ? `${(val / 1000).toFixed(2)}s` : `${val}ms`}
        </span>
      ),
    },
    {
      title: 'Token',
      dataIndex: 'usage',
      width: 100,
      render: (_: unknown, record: CallLogItem) => (
        <span style={{ color: '#475569', fontSize: '13px' }}>
          {record.usage.total_tokens.toLocaleString()}
        </span>
      ),
    },
    {
      title: '费用',
      dataIndex: 'cost',
      width: 100,
      render: (_: unknown, record: CallLogItem) => (
        <span style={{ color: '#0f172a', fontSize: '13px', fontWeight: 500 }}>
          {record.cost.currency} {parseFloat(record.cost.amount).toFixed(6)}
        </span>
      ),
    },
    {
      title: 'API Key',
      dataIndex: 'api_key',
      render: (_: unknown, record: CallLogItem) => (
        <span
          style={{
            color: '#475569',
            fontFamily: 'monospace',
            fontSize: '12px',
            backgroundColor: '#f8fafc',
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid #f1f5f9',
          }}
        >
          {record.api_key.masked || record.api_key.name}
        </span>
      ),
    },
  ]

  // ─── Expanded row renderer ───────────────────────────────────────────
  function expandedRowRender(record?: CallLogItem) {
    if (!record) return null;
    return (
      <div
        style={{
          padding: '16px 24px',
          background: '#f8fafc',
          borderRadius: '8px',
          margin: '4px 0',
        }}
      >
        <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
              REQUEST ID
            </div>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12.5px',
                color: '#334155',
                backgroundColor: '#ffffff',
                padding: '3px 10px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
              }}
            >
              {record.request_id}
            </span>
          </div>

          {record.error && (
            <div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                ERROR
              </div>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12.5px',
                  color: '#dc2626',
                  backgroundColor: '#fef2f2',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  border: '1px solid #fecaca',
                }}
              >
                {record.error}
              </span>
            </div>
          )}

          <div>
            <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
              TOKENS IN / OUT
            </div>
            <span style={{ fontSize: '12.5px', color: '#334155' }}>
              {record.usage.input_tokens.toLocaleString()} / {record.usage.output_tokens.toLocaleString()}
            </span>
          </div>

          <div>
            <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
              API KEY
            </div>
            <span style={{ fontSize: '12.5px', color: '#334155' }}>
              {record.api_key.name}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ─── Stats values ────────────────────────────────────────────────────
  const totals = statsQuery.data?.totals
  const totalRequests = totals?.total_requests ?? 0
  const totalTokens = totals?.total_tokens ?? 0
  const totalCost = totals?.total_cost
  const errorRate = totals?.error_rate ?? 0

  const hasMore = logsQuery.data?.has_more ?? false

  return (
    <div>
      {/* 页头 */}
      <div style={{ marginBottom: '28px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#0f172a',
            margin: '0 0 6px 0',
            letterSpacing: '-0.02em',
          }}
        >
          调用日志
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0, fontWeight: 400 }}>
          查看工作空间内所有模型调用记录，追踪请求状态、Token 用量与费用消耗。
        </p>
      </div>

      {/* 时间预设切换 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {(['1h', '24h', '7d'] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePresetChange(p)}
            style={{
              padding: '6px 18px',
              borderRadius: '9999px',
              border: `1px solid ${preset === p ? '#1e293b' : '#e2e8f0'}`,
              backgroundColor: preset === p ? '#0f172a' : '#ffffff',
              color: preset === p ? '#ffffff' : '#475569',
              fontSize: '13px',
              fontWeight: preset === p ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {p === '1h' ? '近 1 小时' : p === '24h' ? '近 24 小时' : '近 7 天'}
          </button>
        ))}
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '28px' }}>
        {statsQuery.isLoading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '88px',
            }}
          >
            <Spin />
          </div>
        ) : (
          <>
            <StatCard label="总请求数" value={totalRequests.toLocaleString()} sub="次调用" />
            <StatCard label="总 Token" value={totalTokens.toLocaleString()} sub="input + output" />
            <StatCard
              label="总费用"
              value={
                totalCost
                  ? `${totalCost.currency} ${parseFloat(totalCost.amount).toFixed(4)}`
                  : '—'
              }
              sub="已结算金额"
            />
            <StatCard
              label="错误率"
              value={`${(errorRate * 100).toFixed(1)}%`}
              sub="failed + rejected"
            />
          </>
        )}
      </div>

      {/* 操作栏：搜索 + 状态筛选 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <Input
          placeholder="按 Request ID 搜索"
          prefix={<IconSearch style={{ color: '#94a3b8' }} />}
          value={requestIdSearch}
          onChange={handleSearchChange}
          style={{
            width: '290px',
            borderRadius: '9999px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        />

        <Select
          value={statusFilter}
          onChange={(val) => handleStatusChange(val as StatusFilter)}
          style={{ width: '140px', borderRadius: '8px' }}
        >
          <Select.Option value="all">全部状态</Select.Option>
          <Select.Option value="succeeded">succeeded</Select.Option>
          <Select.Option value="failed">failed</Select.Option>
          <Select.Option value="rejected">rejected</Select.Option>
        </Select>
      </div>

      {/* 日志表格 */}
      <Table
        columns={columns}
        dataSource={allItems}
        loading={logsQuery.isLoading && cursor === null}
        pagination={false}
        bordered={false}
        rowKey="call_log_id"
        expandedRowRender={expandedRowRender}
        style={{ marginTop: '4px' }}
        empty={
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <Text style={{ color: '#94a3b8', fontSize: '13px' }}>暂无调用日志</Text>
          </div>
        }
      />

      {/* 加载更多 */}
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
          <Button
            loading={logsQuery.isFetching}
            onClick={handleLoadMore}
            style={{
              borderRadius: '9999px',
              padding: '8px 32px',
              border: '1px solid #e2e8f0',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: '#ffffff',
              cursor: 'pointer',
            }}
          >
            加载更多
          </Button>
        </div>
      )}
    </div>
  )
}
