import { useState } from 'react'
import { Table, Button, Tag, Toast } from '@douyinfe/semi-ui'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cancelRecharge, getRecharge, listRecharges } from '@/services/billing'
import { useAuthStore } from '@/store/auth'
import type { RechargeOrder } from '@/types'

// ─── Styles ──────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  border: '1px solid #f1f5f9',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
}

const detailCardStyle: React.CSSProperties = {
  ...cardStyle,
  padding: '20px',
  minWidth: '320px',
  maxWidth: '360px',
  alignSelf: 'flex-start',
  flexShrink: 0,
}

// ─── Status Config ────────────────────────────────────────────────────────────

type OrderStatus = RechargeOrder['status']

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: '待支付',
  paid: '已支付',
  failed: '支付失败',
  cancelled: '已取消',
  refunded: '已退款',
}

const STATUS_COLOR: Record<OrderStatus, { color: string; bg: string; border: string }> = {
  pending: { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  paid: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  failed: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  cancelled: { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
  refunded: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(val: string | null): string {
  if (!val) return '—'
  return new Date(val).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
}

function formatMoney(order: RechargeOrder): string {
  return `${order.currency} ${parseFloat(order.amount).toFixed(2)}`
}

const CHANNEL_LABEL: Record<string, string> = {
  alipay: '支付宝',
  wechat: '微信支付',
  stripe: 'Stripe',
}

function channelName(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusTag({ status }: { status: OrderStatus }) {
  const cfg = STATUS_COLOR[status]
  return (
    <Tag
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        fontSize: '11px',
        fontWeight: 700,
        padding: '1px 8px',
        borderRadius: '4px',
      }}
    >
      {STATUS_LABEL[status]}
    </Tag>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        borderBottom: '1px solid #f1f5f9',
        paddingBottom: '12px',
        marginBottom: '12px',
      }}
    >
      <span style={{ color: '#94a3b8', fontSize: '12px', whiteSpace: 'nowrap' }}>{label}</span>
      <span
        style={{
          color: '#475569',
          fontSize: '12px',
          fontFamily: 'ui-monospace, monospace',
          textAlign: 'right',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingOrdersPage() {
  const qc = useQueryClient()
  const { activeTenantId } = useAuthStore()
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null)

  const ordersQuery = useInfiniteQuery({
    queryKey: ['billing', 'recharges', activeTenantId],
    queryFn: ({ pageParam }) =>
      listRecharges(activeTenantId!, { cursor: pageParam as string | undefined, page_size: 15 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled: !!activeTenantId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const detailQuery = useQuery({
    queryKey: ['billing', 'recharges', activeTenantId, selectedOrderNo],
    queryFn: () => getRecharge(activeTenantId!, selectedOrderNo!),
    enabled: !!activeTenantId && !!selectedOrderNo,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  const cancelMutation = useMutation({
    mutationFn: (orderNo: string) => cancelRecharge(activeTenantId!, orderNo),
    onSuccess: () => {
      Toast.success('订单已取消')
      qc.invalidateQueries({ queryKey: ['billing', 'recharges', activeTenantId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '取消订单失败')
    },
  })

  const orders = ordersQuery.data?.pages.flatMap((page) => page.items) ?? []
  const selected = detailQuery.data ?? orders.find((order) => order.order_no === selectedOrderNo)

  // ─── Table Columns ──────────────────────────────────────────────────────────

  const columns = [
    {
      title: '订单号',
      dataIndex: 'order_no',
      render: (text: string, record: RechargeOrder) => (
        <span
          style={{
            color: '#334155',
            fontSize: '12px',
            fontFamily: 'ui-monospace, monospace',
            cursor: 'pointer',
          }}
          onClick={() => setSelectedOrderNo(record.order_no)}
        >
          {text}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: OrderStatus) => <StatusTag status={status} />,
    },
    {
      title: '渠道',
      dataIndex: 'channel',
      width: 110,
      render: (channel: string) => (
        <span style={{ color: '#64748b', fontSize: '13px' }}>{channelName(channel)}</span>
      ),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 140,
      render: (_: string, record: RechargeOrder) => (
        <span
          style={{
            color: '#334155',
            fontSize: '13px',
            fontFamily: 'ui-monospace, monospace',
            fontWeight: 500,
          }}
        >
          {formatMoney(record)}
        </span>
      ),
    },
    {
      title: '支付时间',
      dataIndex: 'paid_at',
      width: 180,
      render: (val: string | null) => (
        <span style={{ color: '#64748b', fontSize: '12px' }}>{formatDateTime(val)}</span>
      ),
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 100,
      render: (_: unknown, record: RechargeOrder) => {
        if (record.status !== 'pending') {
          return <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
        }
        return (
          <Button
            size="small"
            loading={cancelMutation.isPending}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              cancelMutation.mutate(record.order_no)
            }}
            style={{
              fontSize: '12px',
              borderRadius: '6px',
              height: '28px',
            }}
          >
            取消
          </Button>
        )
      },
    },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
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
          充值订单
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0, fontWeight: 400 }}>
          查看所有充值订单记录，点击行可查看订单详情。
        </p>
      </div>

      {/* Body: Table + Detail Panel */}
      <div
        style={{
          display: 'flex',
          gap: '20px',
          alignItems: 'flex-start',
        }}
      >
        {/* Table Card */}
        <div style={{ ...cardStyle, flex: 1, minWidth: 0 }}>
          <Table
            columns={columns}
            dataSource={orders}
            loading={ordersQuery.isLoading}
            pagination={false}
            bordered={false}
            rowKey="order_no"
            onRow={(record) => ({
              onClick: () => setSelectedOrderNo((record as RechargeOrder).order_no),
              style: {
                cursor: 'pointer',
                backgroundColor:
                  selectedOrderNo === (record as RechargeOrder).order_no ? '#f8fafc' : undefined,
              },
            })}
            empty={
              <div style={{ padding: '64px 0', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
                暂无充值订单
              </div>
            }
          />

          {ordersQuery.hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
              <Button
                theme="borderless"
                loading={ordersQuery.isFetchingNextPage}
                onClick={() => ordersQuery.fetchNextPage()}
                style={{ color: '#475569', fontSize: '13px', fontWeight: 500 }}
              >
                加载更多
              </Button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div style={detailCardStyle}>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#94a3b8',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: '0 0 16px 0',
            }}
          >
            订单详情
          </p>

          {selected ? (
            <div>
              <DetailRow label="订单号" value={selected.order_no} />
              <DetailRow label="状态" value={<StatusTag status={selected.status} />} />
              <DetailRow label="金额" value={formatMoney(selected)} />
              <DetailRow
                label="到账金额"
                value={`${selected.currency} ${selected.credited_amount}`}
              />
              <DetailRow label="支付渠道" value={channelName(selected.channel)} />
              <DetailRow label="优惠码" value={selected.promo_code ?? '—'} />
              <DetailRow label="支付时间" value={formatDateTime(selected.paid_at)} />

              {selected.invoice_url && (
                <Button
                  block
                  style={{ marginTop: '8px', borderRadius: '8px' }}
                  onClick={() => window.open(selected.invoice_url!, '_blank', 'noopener,noreferrer')}
                >
                  查看发票
                </Button>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              点击左侧订单查看详情
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
