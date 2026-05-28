import { useState } from 'react'
import {
  Table,
  Button,
  Tag,
  Toast,
  Modal,
  Spin,
} from '@douyinfe/semi-ui'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  getBalance,
  createRecharge,
  listRecharges,
  cancelRecharge,
} from '@/services/billing'
import { getPlatformConfig } from '@/services/platform'
import { useAuthStore } from '@/store/auth'
import { isDomestic } from '@/lib/market'
import type { RechargeOrder } from '@/types'

// ─── Sub-components: TopUpModal ───────────────────────────────────────────

const ALL_CHANNELS = [
  { value: 'alipay',  label: '支付宝' },
  { value: 'wechat',  label: '微信支付' },
  { value: 'stripe',  label: 'Stripe' },
]

function TopUpModal({ visible, onClose, tenantId }: {
  visible: boolean
  onClose: () => void
  tenantId: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('100')

  const { data: platformConfig } = useQuery({
    queryKey: ['platform-config'],
    queryFn: getPlatformConfig,
    staleTime: Infinity,
    retry: 1,
  })

  // 优先走 Swagger platform-config 接口，降级到全量
  const CHANNELS = platformConfig?.enabled_channels?.length
    ? ALL_CHANNELS.filter((c) => platformConfig.enabled_channels.includes(c.value))
    : ALL_CHANNELS

  const currency = platformConfig?.settlement_currency ?? 'CNY'
  const currencySymbol = currency === 'USD' ? '$' : '¥'

  const [channel, setChannel] = useState<'alipay' | 'wechat' | 'stripe'>('alipay')
  const effectiveChannel: 'alipay' | 'wechat' | 'stripe' = (
    CHANNELS.some((c) => c.value === channel) ? channel : (CHANNELS[0]?.value ?? 'alipay')
  ) as 'alipay' | 'wechat' | 'stripe'

  const PRESETS = ['10', '50', '100', '500']

  const recharge = useMutation({
    mutationFn: () =>
      createRecharge(tenantId, {
        amount,
        currency,
        channel: effectiveChannel,
        return_url: window.location.href,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
      const url = data.payment.redirect_url ?? data.payment.qr_code_url
      if (url) window.open(url, '_blank', 'noopener')
      onClose()
      Toast.success(t('billing.rechargeModal.success'))
    },
    onError: (err: Error) => Toast.error(err.message || t('billing.rechargeModal.error')),
  })

  const btnBase: React.CSSProperties = {
    flex: 1,
    borderRadius: '8px',
    border: '1px solid var(--semi-color-border)',
    background: 'var(--semi-color-fill-0)',
    color: 'var(--semi-color-text-1)',
    fontSize: '13px',
    padding: '8px 0',
    cursor: 'pointer',
    transition: 'all 0.15s',
  }
  const btnActive: React.CSSProperties = {
    ...btnBase,
    borderColor: 'var(--semi-color-primary)',
    background: 'rgba(var(--semi-color-primary-light-default-rgb), 0.08)',
    color: 'var(--semi-color-primary)',
    fontWeight: 600,
  }

  return (
    <Modal
      title={t('billing.rechargeModal.title')}
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={400}
      closeOnEsc
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', marginBottom: '10px' }}>{t('billing.rechargeModal.amount')}</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setAmount(p)}
                style={amount === p ? btnActive : btnBase}>
                {currencySymbol}{p}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--semi-color-text-2)', fontSize: '14px' }}>{currencySymbol}</span>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: '100%',
                height: '38px',
                paddingLeft: '28px',
                paddingRight: '12px',
                borderRadius: '8px',
                border: '1px solid var(--semi-color-border)',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder={t('billing.rechargeModal.customAmount')}
            />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', marginBottom: '10px' }}>{t('billing.rechargeModal.method')}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {CHANNELS.map((c) => (
              <button key={c.value} type="button" onClick={() => setChannel(c.value as 'alipay' | 'wechat' | 'stripe')}
                style={effectiveChannel === c.value ? btnActive : btnBase}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          theme="solid"
          block
          loading={recharge.isPending}
          disabled={!parseFloat(amount) || parseFloat(amount) <= 0}
          onClick={() => recharge.mutate()}
          style={{ 
            height: '40px', 
            fontSize: '14px', 
            fontWeight: 600,
            background: 'linear-gradient(135deg, var(--brand-base) 0%, var(--brand-deep) 100%)',
            border: 'none',
            boxShadow: '0 4px 12px var(--brand-glow)'
          }}
        >
          {t('billing.rechargeModal.submit', { amount })}
        </Button>
      </div>
    </Modal>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────


// ─── Main Component ─────────────────────────────────────────────────────────

export default function BillingPage() {
  const { t } = useTranslation()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''
  const [topUpVisible, setTopUpVisible] = useState(false)

  // ─── Balance Query ───────────────────────────────────────────────────────
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['balance', tenantId],
    queryFn: () => getBalance(tenantId),
    enabled: !!tenantId,
  })

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--semi-color-text-0)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
          {t('billing.title')}
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0, fontWeight: 400 }}>
          {t('billing.desc')}
        </p>
      </div>

      <TopUpModal visible={topUpVisible} onClose={() => setTopUpVisible(false)} tenantId={tenantId} />

      {/* Balance Section */}
      <div className="card-shadow-adaptive" style={{ padding: '28px 32px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)' }}>{t('billing.balance.title')}</div>
          <Button theme="solid" onClick={() => setTopUpVisible(true)} style={{ borderRadius: '8px', fontWeight: 600 }}>
            {t('billing.balance.recharge')}
          </Button>
        </div>
        {balanceLoading ? (
          <Spin />
        ) : (
          <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginBottom: '6px' }}>{t('billing.balance.available')}</div>
              <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--semi-color-text-0)', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {balance?.available.amount ?? '—'}
                <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--semi-color-text-1)', marginLeft: '6px' }}>
                  {balance?.available.currency ?? ''}
                </span>
              </div>
            </div>
            <div style={{ height: '44px', width: '1px', backgroundColor: 'var(--semi-color-fill-0)' }} />
            <div>
              <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginBottom: '6px' }}>{t('billing.balance.frozen')}</div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--semi-color-text-1)', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {balance?.reserved.amount ?? '—'}
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--semi-color-text-2)', marginLeft: '5px' }}>
                  {balance?.reserved.currency ?? ''}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <OrderTab tenantId={tenantId} />
    </div>
  )
}

// ─── Tab 2: Orders ────────────────────────────────────────────────────────

function OrderTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null)

  const ordersQuery = useInfiniteQuery({
    queryKey: ['billing', 'recharges', tenantId],
    queryFn: ({ pageParam }) => listRecharges(tenantId, { cursor: pageParam as string | undefined, page_size: 15 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled: !!tenantId,
  })

  const cancelMutation = useMutation({
    mutationFn: (orderNo: string) => cancelRecharge(tenantId, orderNo),
    onSuccess: () => {
      Toast.success(t('billing.orders.cancelSuccess'))
      qc.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })
    },
    onError: (err: Error) => Toast.error(err.message || t('billing.orders.cancelError')),
  })

  const orders = ordersQuery.data?.pages.flatMap((page) => page.items) ?? []
  const selected = orders.find((o) => o.order_no === selectedOrderNo)

  const columns = [
    { title: t('billing.orders.table.orderNo'), dataIndex: 'order_no', render: (text: string) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{text}</span> },
    { 
      title: t('billing.orders.table.status'), 
      dataIndex: 'status', 
      render: (status: string) => {
        const labels = t('billing.orders.status', { returnObjects: true }) as Record<string, string>
        return <Tag>{labels[status] || status}</Tag>
      }
    },
    { title: t('billing.orders.table.amount'), dataIndex: 'amount', render: (val: string, record: RechargeOrder) => <span style={{ fontWeight: 600 }}>{record.currency} {val}</span> },
    { title: t('billing.orders.table.paidAt'), dataIndex: 'paid_at', render: (val: string | null) => <span>{val ? new Date(val).toLocaleString() : '—'}</span> },
    {
      title: t('billing.orders.table.actions'),
      render: (_: unknown, record: RechargeOrder) => record.status === 'pending' && (
        <Button size="small" onClick={() => cancelMutation.mutate(record.order_no)}>{t('billing.orders.table.cancel')}</Button>
      )
    }
  ]

  return (
    <div style={{ display: 'flex', gap: '24px', padding: '16px 0' }}>
      <div style={{ flex: 1 }}>
        <Table columns={columns} dataSource={orders} loading={ordersQuery.isLoading} pagination={false} bordered={false} rowKey="order_no" onRow={(r) => ({ onClick: () => setSelectedOrderNo((r as RechargeOrder).order_no) })} />
        {ordersQuery.hasNextPage && <Button theme="borderless" block onClick={() => ordersQuery.fetchNextPage()}>{t('billing.orders.loadMore')}</Button>}
      </div>
      <div style={{ width: '300px', padding: '20px', backgroundColor: 'var(--semi-color-bg-1)', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '14px' }}>{t('billing.orders.detailTitle')}</h3>
        {selected ? (
          <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><span style={{ color: 'var(--semi-color-text-2)' }}>{t('billing.orders.detail.orderNo')}:</span> {selected.order_no}</div>
            <div><span style={{ color: 'var(--semi-color-text-2)' }}>{t('billing.orders.detail.status')}:</span> {selected.status}</div>
            <div><span style={{ color: 'var(--semi-color-text-2)' }}>{t('billing.orders.detail.amount')}:</span> {selected.currency} {selected.amount}</div>
            {isDomestic() && selected.invoice_url && <Button block onClick={() => window.open(selected.invoice_url!, '_blank')}>{t('billing.orders.detail.viewInvoice')}</Button>}
          </div>
        ) : <p style={{ color: 'var(--semi-color-text-2)', fontSize: '13px' }}>{t('billing.orders.detailPlaceholder')}</p>}
      </div>
    </div>
  )
}

