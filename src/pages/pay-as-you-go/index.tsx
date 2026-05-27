import { useState } from 'react'
import { Table, Button, Input, Toast, Spin, Modal } from '@douyinfe/semi-ui'
import { IconSearch } from '@douyinfe/semi-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getBalance, listBillingTransactions, redeemPromoCode, createRecharge } from '@/services/billing'
import { useAuthStore } from '@/store/auth'
import type { TransactionItem } from '@/types'

// ─── TopUp Modal ────────────────────────────────────────────────────────────

const PRESETS = ['10', '50', '100', '500']
const CHANNELS = [
  { value: 'alipay' as const, label: '支付宝' },
  { value: 'wechat' as const, label: '微信支付' },
  { value: 'stripe' as const, label: 'Stripe' },
]

function TopUpModal({ visible, onClose, tenantId }: {
  visible: boolean
  onClose: () => void
  tenantId: string
}) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('100')
  const [channel, setChannel] = useState<'alipay' | 'wechat' | 'stripe'>('alipay')

  const recharge = useMutation({
    mutationFn: () =>
      createRecharge(tenantId, {
        amount,
        currency: 'CNY',
        channel,
        return_url: window.location.href,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
      const url = data.payment.redirect_url ?? data.payment.qr_code_url
      if (url) window.open(url, '_blank', 'noopener')
      onClose()
      Toast.success('充值订单已创建，请完成支付')
    },
    onError: (err: any) => Toast.error(err?.message || '创建充值订单失败'),
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
      title="账户充值"
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={400}
      closeOnEsc
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', marginBottom: '10px' }}>充值金额</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setAmount(p)}
                style={amount === p ? btnActive : btnBase}>
                ¥{p}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--semi-color-text-2)', fontSize: '14px' }}>¥</span>
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
              placeholder="自定义金额"
            />
          </div>
        </div>

        <div>
          <div style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', marginBottom: '10px' }}>支付方式</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {CHANNELS.map((c) => (
              <button key={c.value} type="button" onClick={() => setChannel(c.value)}
                style={channel === c.value ? btnActive : btnBase}>
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
          style={{ height: '40px', fontSize: '14px', fontWeight: 600 }}
        >
          前往支付 ¥{amount}
        </Button>
      </div>
    </Modal>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-0)',
  borderRadius: '12px',
  border: '1px solid var(--semi-color-fill-0)',
  boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
  padding: '28px 32px',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PayAsYouGoPage() {
  const queryClient = useQueryClient()
  const tenantId = useAuthStore((s) => s.activeTenantId) ?? ''

  const [promoCode, setPromoCode] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [allItems, setAllItems] = useState<TransactionItem[]>([])
  const [topUpVisible, setTopUpVisible] = useState(false)

  // ─── Balance ──────────────────────────────────────────────────────────────

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['balance', tenantId],
    queryFn: () => getBalance(tenantId),
    enabled: !!tenantId,
  })

  // ─── Transactions ─────────────────────────────────────────────────────────

  const { data: page, isFetching: txLoading } = useQuery({
    queryKey: ['billing-transactions', tenantId, cursor],
    queryFn: () =>
      listBillingTransactions(tenantId, { cursor: cursor ?? undefined, page_size: 20 }),
    enabled: !!tenantId,
    placeholderData: (prev) => prev,
  })

  // Accumulate items as we load more pages
  const displayItems: TransactionItem[] =
    cursor === null
      ? page?.items ?? []
      : [...allItems, ...(page?.items ?? [])]

  function handleLoadMore() {
    if (!page?.next_cursor) return
    setAllItems(displayItems)
    setCursor(page.next_cursor)
  }

  // ─── Promo Code ───────────────────────────────────────────────────────────

  const redeemMutation = useMutation({
    mutationFn: () => redeemPromoCode(tenantId, { code: promoCode.trim() }),
    onSuccess: (result) => {
      Toast.success(
        `兑换成功，到账 ${result.credited.amount} ${result.credited.currency}`
      )
      setPromoCode('')
      queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
    },
    onError: (err: any) => {
      Toast.error(err?.message || '兑换失败，请检查 Promo Code 是否有效')
    },
  })

  function handleRedeem() {
    if (!promoCode.trim()) {
      Toast.warning('请输入 Promo Code')
      return
    }
    redeemMutation.mutate()
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
      title: '金额',
      dataIndex: 'amount',
      width: 140,
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
      title: '描述',
      dataIndex: 'description',
      render: (text: string) => (
        <span style={{ color: 'var(--semi-color-text-1)', fontSize: '13px' }}>{text || '—'}</span>
      ),
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
          按量付费
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--semi-color-text-1)', margin: 0, fontWeight: 400 }}>
          查看账户余额、兑换优惠码，并查阅充值与消费流水记录。
        </p>
      </div>

      <TopUpModal visible={topUpVisible} onClose={() => setTopUpVisible(false)} tenantId={tenantId} />

      {/* Balance Card */}
      <div style={{ ...cardStyle, marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-1)' }}>账户余额</div>
          <Button theme="solid" onClick={() => setTopUpVisible(true)} style={{ borderRadius: '8px', fontWeight: 600 }}>
            充值
          </Button>
        </div>
        {balanceLoading ? (
          <Spin size="large" />
        ) : (
          <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginBottom: '6px' }}>
                可用余额
              </div>
              <div
                style={{
                  fontSize: '36px',
                  fontWeight: 700,
                  color: 'var(--semi-color-text-0)',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {balance?.available.amount ?? '—'}
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 500,
                    color: 'var(--semi-color-text-1)',
                    marginLeft: '6px',
                  }}
                >
                  {balance?.available.currency ?? ''}
                </span>
              </div>
            </div>
            <div
              style={{
                height: '44px',
                width: '1px',
                backgroundColor: 'var(--semi-color-fill-0)',
              }}
            />
            <div>
              <div style={{ fontSize: '12px', color: 'var(--semi-color-text-2)', marginBottom: '6px' }}>
                冻结金额
              </div>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 600,
                  color: 'var(--semi-color-text-1)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {balance?.reserved.amount ?? '—'}
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--semi-color-text-2)',
                    marginLeft: '5px',
                  }}
                >
                  {balance?.reserved.currency ?? ''}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Promo Code Card */}
      <div style={{ ...cardStyle, marginBottom: '28px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-0)', marginBottom: '14px' }}>
          兑换优惠码
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Input
            placeholder="输入 Promo Code"
            value={promoCode}
            onChange={(val) => setPromoCode(val)}
            style={{
              width: '320px',
              borderRadius: '9999px',
              border: '1px solid var(--semi-color-border)',
            }}
            onEnterPress={handleRedeem}
          />
          <Button
            theme="solid"
            loading={redeemMutation.isPending}
            onClick={handleRedeem}
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              color: '#ffffff',
              borderRadius: '24px',
              padding: '8px 24px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              height: '38px',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
            }}
          >
            立即兑换
          </Button>
        </div>
      </div>

      {/* Transactions Table */}
      <div style={{ ...cardStyle }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--semi-color-text-0)' }}>充值记录</div>
          <Input
            placeholder="搜索"
            prefix={<IconSearch style={{ color: 'var(--semi-color-text-2)' }} />}
            style={{
              width: '220px',
              borderRadius: '9999px',
              border: '1px solid var(--semi-color-border)',
            }}
            disabled
          />
        </div>

        <Table
          columns={columns}
          dataSource={displayItems}
          loading={txLoading}
          pagination={false}
          bordered={false}
          rowKey="transaction_id"
          style={{ marginTop: '4px' }}
        />

        {page?.has_more && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <Button
              theme="borderless"
              loading={txLoading}
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
