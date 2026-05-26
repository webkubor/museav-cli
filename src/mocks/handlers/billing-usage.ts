import { http, HttpResponse } from 'msw'
import { uuid } from '../utils'

const PREFIX = '/api/v1'

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function mockSpendSeries() {
  return Array.from({ length: 30 }, (_, i) => ({
    bucket_start: daysAgo(29 - i),
    value: (Math.random() * 8 + 0.5).toFixed(6),
  }))
}

function mockRequestSeries() {
  return Array.from({ length: 30 }, (_, i) => ({
    bucket_start: daysAgo(29 - i),
    value: String(Math.floor(Math.random() * 800 + 50)),
  }))
}

function readPageSize(url: URL, fallback: number) {
  const value = Number(url.searchParams.get('page_size'))
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), 100)
}

const MODELS = ['gpt-4o', 'claude-3-5-sonnet', 'deepseek-v3', 'gemini-1.5-pro']
const LOG_STATUSES = ['succeeded', 'succeeded', 'succeeded', 'failed', 'succeeded'] as const

const MOCK_TRANSACTIONS = Array.from({ length: 20 }, (_, i) => {
  const isCharge = i % 5 === 0
  const raw = isCharge ? '50.000000' : `-${(Math.random() * 5 + 0.5).toFixed(6)}`
  return {
    transaction_id: `txn_${String(i).padStart(5, '0')}`,
    type: isCharge ? 'recharge' : 'consume',
    amount: { amount: raw, currency: 'USD', signed_amount: isCharge ? `+${raw}` : raw },
    balance_after: { amount: (88.5 - i * 0.8).toFixed(6), currency: 'USD' },
    happened_at: new Date(Date.now() - i * 4 * 3_600_000).toISOString(),
    description: isCharge ? 'Top-up via Alipay' : `API call · ${MODELS[i % MODELS.length]}`,
    related: {
      recharge_order_no: isCharge ? `ORD${i}` : null,
      billing_session_id: isCharge ? null : `sess_${i}`,
      workspace_id: '01HV3KWS000000000000001',
      api_key_id: isCharge ? null : '01HV3KKEY000000000000001',
      model_id: isCharge ? null : MODELS[i % MODELS.length],
    },
    refundable: isCharge,
    invoice_url: isCharge ? `https://example.com/invoice/${i}` : null,
  }
})

const MOCK_BILLING_TRANSACTIONS = Array.from({ length: 42 }, (_, i) => {
  const isRefund = i % 7 === 3
  const amount = isRefund ? '-20.000000' : (50 + (i % 4) * 25).toFixed(6)
  return {
    transaction_id: `bill_txn_${String(i).padStart(5, '0')}`,
    type: isRefund ? 'refund' : 'recharge',
    amount: {
      amount,
      currency: 'USD',
      signed_amount: isRefund ? amount : `+${amount}`,
    },
    balance_after: { amount: (300 - i * 3.5).toFixed(6), currency: 'USD' },
    happened_at: new Date(Date.now() - i * 6 * 3_600_000).toISOString(),
    description: isRefund ? 'Manual refund' : 'Top-up completed',
    related: {
      recharge_order_no: isRefund ? null : `ORD-BILL-${String(i).padStart(4, '0')}`,
      billing_session_id: null,
      workspace_id: null,
      api_key_id: null,
      model_id: null,
    },
    refundable: !isRefund && i % 4 === 0,
    invoice_url: isRefund ? null : `https://example.com/invoice/billing-${i}`,
  }
})

const MOCK_RECHARGES = Array.from({ length: 8 }, (_, i) => ({
  order_no: `ORD-${String(i + 1).padStart(5, '0')}`,
  status: (i === 0 ? 'pending' : i % 4 === 0 ? 'failed' : 'paid') as
    | 'pending'
    | 'paid'
    | 'failed'
    | 'cancelled'
    | 'refunded',
  amount: i % 3 === 0 ? '100.00' : '50.00',
  currency: 'USD',
  channel: i % 2 === 0 ? 'stripe' : 'alipay',
  promo_code: i === 1 ? 'DEMO2024' : null,
  credited_amount: i % 3 === 0 ? '100.00' : '50.00',
  paid_at: i === 0 ? null : new Date(Date.now() - i * 12 * 3_600_000).toISOString(),
  invoice_url: i === 0 ? null : `https://example.com/invoice/recharge-${i}`,
}))

const MOCK_LOGS = Array.from({ length: 25 }, (_, i) => {
  const status = LOG_STATUSES[i % LOG_STATUSES.length]
  const inputTokens = Math.floor(Math.random() * 1000 + 100)
  const outputTokens = Math.floor(Math.random() * 500 + 50)
  return {
    call_log_id: `log_${String(i).padStart(5, '0')}`,
    request_id: uuid(),
    started_at: new Date(Date.now() - i * 90_000).toISOString(),
    duration_ms: Math.floor(Math.random() * 3000 + 300),
    model: { id: MODELS[i % MODELS.length], display_name: MODELS[i % MODELS.length] },
    provider: { id: 'openai', name: 'OpenAI', type: 'openai' },
    workspace_id: '01HV3KWS000000000000001',
    api_key: {
      api_key_id: '01HV3KKEY000000000000001',
      name: 'Production',
      masked: 'sk-live-****wX9k',
    },
    account: { account_id: '01HV3KACCT000000000000001', display_name: 'Demo User' },
    app_name: null,
    status,
    finish_reason: status === 'succeeded' ? 'stop' : null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      cache_read_tokens: 0,
    },
    usage_type: 'token',
    speed: {
      tps: Math.floor(Math.random() * 40 + 20),
      first_token_ms: Math.floor(Math.random() * 300 + 100),
    },
    cost: { amount: (Math.random() * 0.05 + 0.001).toFixed(6), currency: 'USD' },
    billing_status: 'settled',
    error: status === 'failed' ? 'upstream_timeout' : null,
  }
})

export const billingUsageHandlers = [
  http.get(`${PREFIX}/tenants/:tenantId/overview/billing`, ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        available_balance: { amount: '88.500000', currency: 'USD' },
        frozen_balance: { amount: '1.500000', currency: 'USD' },
        monthly_spend: {
          amount: url.searchParams.get('from') ? '42.180000' : '12.340000',
          currency: 'USD',
        },
      },
    })
  }),

  http.get(`${PREFIX}/tenants/:tenantId/balance`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        balance: { amount: '100.000000', currency: 'USD' },
        reserved: { amount: '1.500000', currency: 'USD' },
        available: { amount: '88.500000', currency: 'USD' },
        low_balance_threshold: { amount: '10.000000', currency: 'USD' },
      },
    })
  }),

  http.get(`${PREFIX}/usage/summary`, () => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        total: {
          spend: { amount: '42.180000', currency: 'USD' },
          requests: 3847,
          tokens: 2_310_000,
          input_tokens: 1_850_000,
          output_tokens: 460_000,
        },
      },
    })
  }),

  http.get(`${PREFIX}/usage/series`, ({ request }) => {
    const metric = new URL(request.url).searchParams.get('metric') ?? 'spend'
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        metric,
        granularity: 'day',
        series: metric === 'requests' ? mockRequestSeries() : mockSpendSeries(),
      },
    })
  }),

  http.get(`${PREFIX}/tenants/:tenantId/transactions`, ({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor')
    const start = cursor ? parseInt(cursor) : 0
    const pageSize = 15
    const items = MOCK_TRANSACTIONS.slice(start, start + pageSize)
    const nextCursor = start + pageSize < MOCK_TRANSACTIONS.length ? String(start + pageSize) : null
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { items, next_cursor: nextCursor, total: MOCK_TRANSACTIONS.length },
    })
  }),

  http.get(`${PREFIX}/tenants/:tenantId/billing/transactions`, ({ request }) => {
    const url = new URL(request.url)
    const cursor = url.searchParams.get('cursor')
    const start = cursor ? parseInt(cursor) : 0
    const pageSize = readPageSize(url, 20)
    const items = MOCK_BILLING_TRANSACTIONS.slice(start, start + pageSize)
    const nextCursor =
      start + pageSize < MOCK_BILLING_TRANSACTIONS.length ? String(start + pageSize) : null
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        items,
        page_size: pageSize,
        has_more: nextCursor !== null,
        next_cursor: nextCursor ?? '',
      },
    })
  }),

  http.get(`${PREFIX}/model-logs`, ({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor')
    const start = cursor ? parseInt(cursor) : 0
    const pageSize = 20
    const items = MOCK_LOGS.slice(start, start + pageSize)
    const nextCursor = start + pageSize < MOCK_LOGS.length ? String(start + pageSize) : null
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { items, next_cursor: nextCursor ?? '', total: MOCK_LOGS.length },
    })
  }),

  http.post(`${PREFIX}/tenants/:tenantId/recharges`, async ({ request }) => {
    const body = (await request.json()) as { amount: string; channel: string }
    const redirectUrl = body.channel === 'stripe' ? 'https://checkout.stripe.com/mock' : undefined
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        order_no: `ORD-${uuid().slice(0, 8).toUpperCase()}`,
        status: 'pending',
        payment: {
          channel: body.channel,
          qr_code_url: redirectUrl ? undefined : `https://mock-qr.example.com/${uuid()}`,
          redirect_url: redirectUrl,
        },
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
    })
  }),

  http.post(`${PREFIX}/account/active-tenant`, () => {
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  // ── Recharge polling ─────────────────────────────────────
  http.get(`${PREFIX}/tenants/:tenantId/recharges/:orderNo`, ({ params }) => {
    const order =
      MOCK_RECHARGES.find((item) => item.order_no === params.orderNo) ?? MOCK_RECHARGES[0]
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: order,
    })
  }),

  http.get(`${PREFIX}/tenants/:tenantId/recharges`, ({ request }) => {
    const cursor = new URL(request.url).searchParams.get('cursor')
    const start = cursor ? parseInt(cursor) : 0
    const pageSize = 5
    const items = MOCK_RECHARGES.slice(start, start + pageSize)
    const nextCursor = start + pageSize < MOCK_RECHARGES.length ? String(start + pageSize) : null
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { items, next_cursor: nextCursor ?? '', total: MOCK_RECHARGES.length },
    })
  }),

  http.post(`${PREFIX}/tenants/:tenantId/recharges/:orderNo/cancel`, ({ params }) => {
    const idx = MOCK_RECHARGES.findIndex((order) => order.order_no === params.orderNo)
    if (idx >= 0) {
      MOCK_RECHARGES[idx] = { ...MOCK_RECHARGES[idx], status: 'cancelled' as const }
    }
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  // ── Promo code ───────────────────────────────────────────
  http.post(`${PREFIX}/tenants/:tenantId/promo-codes/redeem`, async ({ request }) => {
    const body = (await request.json()) as { code?: string }
    if (body.code !== 'DEMO2024') {
      return HttpResponse.json({
        code: 40001,
        msg: '无效的优惠码',
        data: null,
        request_id: uuid(),
      })
    }
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        credited: { amount: '10.000000', currency: 'USD' },
        balance_after: { amount: '110.000000', currency: 'USD' },
      },
    })
  }),

  // ── Invoice & refund ─────────────────────────────────────
  http.get(`${PREFIX}/tenants/:tenantId/transactions/:transactionId/invoice`, ({ params }) => {
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { invoice_url: `https://example.com/invoice/${params.transactionId}` },
    })
  }),

  http.post(`${PREFIX}/tenants/:tenantId/transactions/:transactionId/refund`, () => {
    return HttpResponse.json({ code: 0, msg: 'ok', data: null, request_id: uuid() })
  }),

  // ── Log histogram ─────────────────────────────────────────
  http.get(`${PREFIX}/model-logs/histogram`, ({ request }) => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      bucket_start: new Date(Date.now() - (23 - i) * 3_600_000).toISOString(),
      count: Math.floor(Math.random() * 200 + 10),
      error_count: Math.floor(Math.random() * 5),
    }))
    const metric = new URL(request.url).searchParams.get('metric') ?? 'count'
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: { metric, granularity: 'hour', buckets },
    })
  }),

  // ── Log stats ────────────────────────────────────────────
  http.get(`${PREFIX}/model-logs/stats`, () => {
    const total = MOCK_LOGS.length
    const failed = MOCK_LOGS.filter((l) => l.status === 'failed').length
    const totalTokens = MOCK_LOGS.reduce((s, l) => s + l.usage.total_tokens, 0)
    const avgDuration = Math.round(MOCK_LOGS.reduce((s, l) => s + l.duration_ms, 0) / total)
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        from: new Date(Date.now() - 86400_000).toISOString(),
        to: new Date().toISOString(),
        granularity: 'hour',
        group_by: 'model',
        totals: {
          total_requests: total,
          succeeded: MOCK_LOGS.filter((l) => l.status === 'succeeded').length,
          failed,
          rejected: MOCK_LOGS.filter((l) => (l.status as string) === 'rejected').length,
          error_rate: parseFloat((failed / total).toFixed(4)),
          avg_duration_ms: avgDuration,
          total_tokens: totalTokens,
          total_cost: { amount: (totalTokens * 0.000002).toFixed(6), currency: 'USD' },
        },
      },
    })
  }),

  // ── Log detail ───────────────────────────────────────────
  http.get(`${PREFIX}/model-logs/:callLogId`, ({ params }) => {
    const base = MOCK_LOGS.find((l) => l.call_log_id === params.callLogId) ?? MOCK_LOGS[0]
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        ...base,
        finished_at: new Date(new Date(base.started_at).getTime() + base.duration_ms).toISOString(),
        protocol: 'openai-chat-completions',
        endpoint: '/v1/chat/completions',
        billing: {
          billing_session_id: `bill_${base.call_log_id}`,
          billing_status: base.billing_status,
          preauthorized_amount: '0.100000',
          settled_amount: base.cost.amount,
        },
        prompt: {
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello, what can you do?' },
          ],
          redacted: false,
        },
        completion: {
          content:
            'I can help you with a wide range of tasks including writing, analysis, coding, and more.',
          tool_calls: null,
        },
      },
    })
  }),

  // ── Log payload ──────────────────────────────────────────
  http.get(`${PREFIX}/model-logs/:callLogId/payload`, ({ params }) => {
    const base = MOCK_LOGS.find((l) => l.call_log_id === params.callLogId) ?? MOCK_LOGS[0]
    return HttpResponse.json({
      code: 0,
      msg: 'ok',
      request_id: uuid(),
      data: {
        request_id: base.request_id,
        prompt: {
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello, what can you do?' },
          ],
          redacted: false,
        },
        completion: {
          content:
            'I can help you with a wide range of tasks including writing, analysis, coding, and more.',
          tool_calls: null,
        },
      },
    })
  }),
]
