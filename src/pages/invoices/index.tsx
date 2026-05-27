import { useState } from 'react'
import { Table, Button, Select, Tag, Toast, DatePicker } from '@douyinfe/semi-ui'
import { useQuery } from '@tanstack/react-query'
import { listTransactions, getInvoiceUrl } from '@/services/billing'
import { useAuthStore } from '@/store/auth'
import type { TransactionItem } from '@/types'
import type { TransactionListParams } from '@/interfaces/billing'

// ─── Styles ─────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  padding: '28px 32px',
}

// ─── Type Config ─────────────────────────────────────────────────────────────

type TxType = TransactionItem['type'] | 'all'

const TYPE_LABEL: Record<TransactionItem['type'], string> = {
  recharge: '充值',
  consume: '消费',
  refund: '退款',
  adjust_credit: '手动充值',
  adjust_debit: '手动扣款',
  promo: '优惠码',
}

const TYPE_COLOR: Record<TransactionItem['type'], { bg: string; color: string; border: string }> = {
  recharge: { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  consume: { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  refund: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  adjust_credit: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  adjust_debit: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  promo: { bg: '#fdf4ff', color: '#9333ea', border: '#e9d5ff' },
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''

  const [typeFilter, setTypeFilter] = useState<TxType>('all')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [allItems, setAllItems] = useState<TransactionItem[]>([])
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // Build query params
  const queryParams: TransactionListParams = {
    page_size: 20,
    cursor: cursor ?? undefined,
    ...(typeFilter !== 'all' && { type: typeFilter }),
    ...(fromDate && { from: fromDate }),
    ...(toDate && { to: toDate }),
  }

  const { data: page, isFetching } = useQuery({
    queryKey: ['transactions', tenantId, typeFilter, fromDate, toDate, cursor],
    queryFn: () => listTransactions(tenantId, queryParams),
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
  })

  const displayItems: TransactionItem[] =
    cursor === null
      ? page?.items ?? []
      : [...allItems, ...(page?.items ?? [])]

  function handleFilterChange() {
    // Reset pagination when filters change
    setCursor(null)
    setAllItems([])
  }

  function handleTypeChange(val: TxType) {
    setTypeFilter(val)
    setCursor(null)
    setAllItems([])
  }

  function handleFromDate(val: string | null) {
    setFromDate(val ?? '')
    setCursor(null)
    setAllItems([])
  }

  function handleToDate(val: string | null) {
    setToDate(val ?? '')
    setCursor(null)
    setAllItems([])
  }

  function handleLoadMore() {
    if (!page?.next_cursor) return
    setAllItems(displayItems)
    setCursor(page.next_cursor)
  }

  async function handleDownloadInvoice(transactionId: string) {
    setDownloadingId(transactionId)
    try {
      const result = await getInvoiceUrl(tenantId, transactionId)
      window.open(result.invoice_url, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      Toast.error(err?.message || '获取发票链接失败')
    } finally {
      setDownloadingId(null)
    }
  }

  // ─── Table Columns ────────────────────────────────────────────────────────

  const columns = [
    {
      title: '时间',
      dataIndex: 'happened_at',
      width: 180,
      render: (text: string) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>
          {new Date(text).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (type: TransactionItem['type']) => {
        const cfg = TYPE_COLOR[type]
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
            {TYPE_LABEL[type]}
          </Tag>
        )
      },
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 150,
      render: (money: TransactionItem['amount']) => {
        const isPositive = money.signed_amount.startsWith('+')
        return (
          <span
            style={{
              fontWeight: 600,
              fontSize: '13px',
              color: isPositive ? '#059669' : '#dc2626',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {money.signed_amount} {money.currency}
          </span>
        )
      },
    },
    {
      title: '变动后余额',
      dataIndex: 'balance_after',
      width: 160,
      render: (money: TransactionItem['balance_after']) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
          {money.amount} {money.currency}
        </span>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      render: (text: string) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>{text || '—'}</span>
      ),
    },
    {
      title: '操作',
      dataIndex: 'actions',
      width: 120,
      render: (_: unknown, record: TransactionItem) => {
        if (record.type !== 'recharge') return null
        return (
          <Button
            size="small"
            loading={downloadingId === record.transaction_id}
            onClick={() => handleDownloadInvoice(record.transaction_id)}
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#ffffff',
              borderRadius: '16px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              padding: '4px 14px',
              height: '28px',
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.12)',
            }}
          >
            下载发票
          </Button>
        )
      },
    },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
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
          发票管理
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0, fontWeight: 400 }}>
          查看所有交易记录，并为充值订单下载对应发票。
        </p>
      </div>

      {/* Filters + Table Card */}
      <div style={cardStyle}>
        {/* Filter Bar */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            marginBottom: '24px',
            flexWrap: 'wrap',
          }}
        >
          <DatePicker
            type="date"
            placeholder="开始日期"
            style={{ width: '160px', borderRadius: '9999px' }}
            value={fromDate || undefined}
            onChange={(val) => handleFromDate(val as string | null)}
            onClear={() => handleFromDate(null)}
          />
          <span style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>—</span>
          <DatePicker
            type="date"
            placeholder="结束日期"
            style={{ width: '160px', borderRadius: '9999px' }}
            value={toDate || undefined}
            onChange={(val) => handleToDate(val as string | null)}
            onClear={() => handleToDate(null)}
          />
          <Select
            value={typeFilter}
            onChange={(val) => handleTypeChange(val as TxType)}
            style={{ width: '140px', borderRadius: '9999px' }}
            placeholder="交易类型"
          >
            <Select.Option value="all">全部类型</Select.Option>
            <Select.Option value="recharge">充值</Select.Option>
            <Select.Option value="consume">消费</Select.Option>
            <Select.Option value="refund">退款</Select.Option>
          </Select>
          <Button
            theme="borderless"
            onClick={() => {
              setTypeFilter('all')
              setFromDate('')
              setToDate('')
              handleFilterChange()
            }}
            style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}
          >
            重置
          </Button>
        </div>

        {/* Table */}
        <Table
          columns={columns}
          dataSource={displayItems}
          loading={isFetching}
          pagination={false}
          bordered={false}
          rowKey="transaction_id"
        />

        {page?.has_more && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <Button
              theme="borderless"
              loading={isFetching}
              onClick={handleLoadMore}
              style={{
                color: 'var(--semi-color-text-1)',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              加载更多
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
