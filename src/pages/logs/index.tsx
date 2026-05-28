import React, { useState } from 'react'
import { Table, Tag, Input, Select, Button, Spin, Typography, SideSheet } from '@douyinfe/semi-ui'
import { IconSearch } from '@douyinfe/semi-icons'
import { useQuery } from '@tanstack/react-query'
import { listCallLogs, getLogStats, getCallLog, getLogPayload } from '@/services/logs'
import { useAuthStore } from '@/store/auth'
import type { CallLogItem, CallLogDetail, LogPayload } from '@/types'
import type { CallLogListParams } from '@/interfaces/logs'
import { formatDateTimeWithSeconds } from '@/lib/format-date'
import { LOG_STATUS_CONFIG } from '@/constants/status'
import { useCurrency } from '@/hooks/use-platform-config'

const { Text } = Typography

type Preset = '1h' | '24h' | '7d'
type StatusFilter = 'all' | 'succeeded' | 'failed' | 'rejected'

function StatusTag({ status }: { status: CallLogItem['status'] }) {
  const cfg = LOG_STATUS_CONFIG[status] ?? LOG_STATUS_CONFIG.accepted
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
        background: 'var(--semi-color-bg-0)',
        borderRadius: '12px',
        border: '1px solid var(--semi-color-fill-0)',
        padding: '20px 24px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '12.5px', color: 'var(--semi-color-text-1)', fontWeight: 500, marginBottom: '10px' }}>
        {label}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--semi-color-text-0)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginTop: '4px' }}>{sub}</div>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--semi-color-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: '12px 14px',
        background: 'var(--semi-color-bg-1)',
        border: '1px solid var(--semi-color-fill-0)',
        borderRadius: '8px',
        fontSize: '12px',
        color: 'var(--semi-color-text-0)',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        overflowX: 'auto',
        maxHeight: '260px',
        overflowY: 'auto',
        lineHeight: 1.6,
      }}
    >
      {value}
    </pre>
  )
}

function LogDetailPanel({ detail, payload, payloadLoading }: { detail: CallLogDetail; payload: LogPayload | null; payloadLoading: boolean }) {
  return (
    <div>
      {/* 基础信息 */}
      <DetailRow label="Request ID">
        <span style={{ fontFamily: 'monospace', fontSize: '12.5px', color: 'var(--semi-color-text-1)', wordBreak: 'break-all' }}>
          {detail.request_id}
        </span>
      </DetailRow>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <DetailRow label="模型">
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--semi-color-text-0)' }}>{detail.model.display_name}</span>
        </DetailRow>
        <DetailRow label="供应商">
          <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>{detail.provider.name}</span>
        </DetailRow>
        <DetailRow label="耗时">
          <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
            {detail.duration_ms >= 1000 ? `${(detail.duration_ms / 1000).toFixed(2)}s` : `${detail.duration_ms}ms`}
          </span>
        </DetailRow>
        <DetailRow label="费用">
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--semi-color-text-0)' }}>
            {detail.cost.currency} {parseFloat(detail.cost.amount).toFixed(6)}
          </span>
        </DetailRow>
        <DetailRow label="输入 Token">
          <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>{detail.usage.input_tokens.toLocaleString()}</span>
        </DetailRow>
        <DetailRow label="输出 Token">
          <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>{detail.usage.output_tokens.toLocaleString()}</span>
        </DetailRow>
      </div>

      <DetailRow label="开始时间">
        <span style={{ fontSize: '13px', color: 'var(--semi-color-text-1)' }}>
          {formatDateTimeWithSeconds(detail.started_at)}
        </span>
      </DetailRow>

      {detail.error && (
        <DetailRow label="错误信息">
          <CodeBlock value={detail.error} />
        </DetailRow>
      )}

      {/* Payload */}
      <div style={{ borderTop: '1px solid var(--semi-color-fill-0)', paddingTop: '20px', marginTop: '4px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-0)', marginBottom: '16px' }}>请求 / 响应内容</div>
        {payloadLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}><Spin /></div>
        ) : payload?.prompt ? (
          <>
            <DetailRow label="Prompt">
              <CodeBlock value={JSON.stringify(payload.prompt.messages, null, 2)} />
            </DetailRow>
            {payload.completion && (
              <DetailRow label="Completion">
                <CodeBlock value={payload.completion.content || JSON.stringify(payload.completion.tool_calls, null, 2)} />
              </DetailRow>
            )}
          </>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--semi-color-text-2)', padding: '12px 0' }}>
            未开启 Input/Output Logging，无法查看原始内容。
          </div>
        )}
      </div>
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
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)

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

  // ─── Detail queries ─────────────────────────────────────────────────
  const detailQuery = useQuery({
    queryKey: ['call-log-detail', selectedLogId],
    queryFn: () => getCallLog(selectedLogId!),
    enabled: !!selectedLogId,
  })

  const payloadQuery = useQuery({
    queryKey: ['call-log-payload', detailQuery.data?.request_id],
    queryFn: () => getLogPayload(detailQuery.data!.request_id),
    enabled: !!detailQuery.data?.request_id,
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
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '12.5px' }}>
          {formatDateTimeWithSeconds(val)}
        </span>
      ),
    },
    {
      title: '模型',
      dataIndex: 'model',
      render: (_: unknown, record: CallLogItem) => (
        <span style={{ color: 'var(--semi-color-text-0)', fontWeight: 500, fontSize: '13px' }}>
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
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>
          {val >= 1000 ? `${(val / 1000).toFixed(2)}s` : `${val}ms`}
        </span>
      ),
    },
    {
      title: 'Token',
      dataIndex: 'usage',
      width: 100,
      render: (_: unknown, record: CallLogItem) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>
          {record.usage.total_tokens.toLocaleString()}
        </span>
      ),
    },
    {
      title: '费用',
      dataIndex: 'cost',
      width: 100,
      render: (_: unknown, record: CallLogItem) => (
        <span style={{ color: 'var(--semi-color-text-0)', fontSize: '13px', fontWeight: 500 }}>
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
            color: 'var(--semi-color-text-1)',
            fontFamily: 'monospace',
            fontSize: '12px',
            backgroundColor: 'var(--semi-color-bg-1)',
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid var(--semi-color-fill-0)',
          }}
        >
          {record.api_key.masked || record.api_key.name}
        </span>
      ),
    },
  ]

  // ─── Stats values ────────────────────────────────────────────────────
  const totals = statsQuery.data?.totals
  const totalRequests = totals?.total_requests ?? 0
  const totalTokens = totals?.total_tokens ?? 0
  const { symbol: currencySymbol } = useCurrency()
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
            color: 'var(--semi-color-text-0)',
            margin: '0 0 6px 0',
            letterSpacing: '-0.02em',
          }}
        >
          调用日志
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0, fontWeight: 400 }}>
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
              border: `1px solid ${preset === p ? 'var(--semi-color-text-0)' : 'var(--semi-color-border)'}`,
              backgroundColor: preset === p ? 'var(--semi-color-text-0)' : 'var(--semi-color-bg-0)',
              color: preset === p ? 'var(--semi-color-bg-0)' : 'var(--semi-color-text-1)',
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
                  ? `${totalCost.currency || currencySymbol}${parseFloat(totalCost.amount).toFixed(4)}`
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
          prefix={<IconSearch style={{ color: 'var(--semi-color-text-2)' }} />}
          value={requestIdSearch}
          onChange={handleSearchChange}
          style={{
            width: '290px',
            borderRadius: '9999px',
            border: '1px solid var(--semi-color-border)',
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
        onRow={(record) => ({
          onClick: () => setSelectedLogId(record!.call_log_id),
          style: { cursor: 'pointer' },
        })}
        style={{ marginTop: '4px' }}
        empty={
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <Text style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>暂无调用日志</Text>
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
              border: '1px solid var(--semi-color-border)',
              color: 'var(--semi-color-text-1)',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: 'var(--semi-color-bg-0)',
              cursor: 'pointer',
            }}
          >
            加载更多
          </Button>
        </div>
      )}

      {/* 日志详情侧边抽屉 */}
      <SideSheet
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>调用详情</span>
            {detailQuery.data && (
              <StatusTag status={detailQuery.data.status} />
            )}
          </div>
        }
        visible={!!selectedLogId}
        onCancel={() => setSelectedLogId(null)}
        width={560}
        placement="right"
        closable
        style={{ borderRadius: '0' }}
        bodyStyle={{ padding: '24px', overflowY: 'auto' }}
      >
        {detailQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <Spin />
          </div>
        ) : detailQuery.data ? (
          <LogDetailPanel detail={detailQuery.data} payload={payloadQuery.data ?? null} payloadLoading={payloadQuery.isLoading} />
        ) : null}
      </SideSheet>
    </div>
  )
}
