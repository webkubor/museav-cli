/**
 * 计费与交易（§十、§十一）
 * 路由：/billing
 * API：GET /tenants/:tenantId/balance、GET|POST /tenants/:tenantId/recharges、
 * GET /tenants/:tenantId/recharges/:orderNo、POST /tenants/:tenantId/recharges/:orderNo/cancel、
 * POST /tenants/:tenantId/promo-codes/redeem
 */
import { get, post, patch } from '@/lib/request'
import { pageItems } from '@/lib/utils'
import type {
  RechargeListParams,
} from '@/interfaces/billing'
import type {
  BalanceInfo,
  CreateRechargeRequest,
  CursorPage,
  Money,
  QueryParams,
  RechargeCreated,
  RechargeOrder,
  RedeemPromoRequest,
  RedeemPromoResult,
} from '@/types'
import type {
  TransactionListResponse,
  TransactionInvoiceURLResponse,
} from '@/types/generated-api-types'

// ─── 余额 ─────────────────────────────────────────

/** 查询 tenant 余额（含 reserved / available / low_balance_threshold） */
export function getBalance(tenantId: string) {
  return get<BalanceInfo>(`tenants/${tenantId}/balance`)
}

/** 余额细分：主余额 / 赠送余额 / 奖励余额（账单页三卡 + 模型体验免费额度复用） */
export interface BalanceBreakdown {
  main: Money
  gift: Money
  reward: Money
}

/** GET /tenants/:tenantId/balance/breakdown — 余额细分（cash/grant/rebate 三桶，#93） */
export function getBalanceBreakdown(tenantId: string): Promise<BalanceBreakdown> {
  return get<BalanceBreakdown>(`tenants/${tenantId}/balance/breakdown`)
}

// ─── 低余额提醒（PRD 1.0.4 §8.5，qa#528 后端已交付） ─────────────────────────

/** 通知人（带后端算好的当前资格，本单暂只用 account_id，其余字段随后端扩展） */
export interface LowBalanceRecipient {
  account_id: string
  [key: string]: unknown
}

export interface LowBalanceAlertConfig {
  enabled: boolean
  /** 生效阈值：per-tenant 覆盖优先，否则回落平台默认 */
  threshold: Money
  recipient_account_ids: string[]
  recipients: LowBalanceRecipient[]
}

/**
 * 三态更新：字段缺省=不动那部分配置，出现=整体替换（recipient_account_ids 传 [] 即清空）。
 * threshold 传 "0"/非正数=清除 per-tenant 覆盖、回落平台默认，不是"设为 0"。
 */
export interface SetLowBalanceAlertRequest {
  enabled?: boolean
  threshold?: string
  recipient_account_ids?: string[]
}

export function getLowBalanceAlert(tenantId: string) {
  return get<LowBalanceAlertConfig>(`tenants/${tenantId}/billing/low-balance-alert`)
}

export function updateLowBalanceAlert(tenantId: string, body: SetLowBalanceAlertRequest) {
  return patch<LowBalanceAlertConfig>(`tenants/${tenantId}/billing/low-balance-alert`, body)
}

// ─── 赠送明细 ─────────────────────────────────────

/** 单条赠金入账记录（grant 桶 journal，#93） */
export interface GiftRecord {
  id: string
  source: string
  amount: string
  currency: string
  credited_at: string
}

export interface GiftRecordsPage {
  items: GiftRecord[]
  page_size: number
  has_more: boolean
  next_cursor: string
}

/** GET /tenants/:tenantId/gift-records — 赠送明细（促销/注册等赠金入账） */
export function listGiftRecords(tenantId: string, params?: { cursor?: string; page_size?: number }) {
  return get<GiftRecordsPage>(`tenants/${tenantId}/gift-records`, params)
}

// ─── 充值订单 ─────────────────────────────────────

/** 创建充值订单（支付宝 / 微信 / Stripe） */
export function createRecharge(tenantId: string, body: CreateRechargeRequest) {
  return post<RechargeCreated>(`tenants/${tenantId}/recharges`, body)
}

/** 查询单个充值订单详情 */
export function getRecharge(tenantId: string, orderNo: string) {
  return get<RechargeOrder>(`tenants/${tenantId}/recharges/${orderNo}`)
}

/** 列出充值订单 */
export function listRecharges(tenantId: string, params?: RechargeListParams) {
  return get<CursorPage<RechargeOrder>>(`tenants/${tenantId}/recharges`, params)
}

/** 取消未支付订单 */
export function cancelRecharge(tenantId: string, orderNo: string) {
  return post<null>(`tenants/${tenantId}/recharges/${orderNo}/cancel`, {})
}

// ─── Promo Code ───────────────────────────────────

/** 兑换 Promo Code（余额增加，返回兑换金额和余额变更后值） */
export function redeemPromoCode(tenantId: string, body: RedeemPromoRequest) {
  return post<RedeemPromoResult>(`tenants/${tenantId}/promo-codes/redeem`, body)
}

// ─── 交易记录（统一账本） ───────────────────────────

export interface TransactionListParams extends QueryParams {
  /** 交易类型筛选：recharge/consume/refund/adjust_credit/adjust_debit/promo */
  type?: string
  from?: string
  to?: string
  cursor?: string
  page_size?: number
}

/** 交易记录列表（GET /tenants/:id/transactions）—— 充值/消费/退款/调账/兑换 统一账本 */
export function listTransactions(tenantId: string, params?: TransactionListParams) {
  return get<TransactionListResponse>(`tenants/${tenantId}/transactions`, params)
}

/** 取交易对应发票下载链接（GET /tenants/:id/transactions/:txnId/invoice） */
export function getTransactionInvoice(tenantId: string, transactionId: string) {
  return get<TransactionInvoiceURLResponse>(`tenants/${tenantId}/transactions/${transactionId}/invoice`)
}

// ─── 入账记录（收入账本，qa#433 / 后端 #431） ─────────────
//
// 账单页账本重构为单一「入账记录」表：只呈现充值 / 赠送 / 奖励三类收入流。
// 后端 #431（GET /tenants/{id}/income-records）尚未交付（已确认 Swagger 无此接口），
// 因此当前由已存在的「充值订单 listRecharges」+「赠送明细 listGiftRecords」在前端合成。
// 后端上线后只需把 INCOME_RECORDS_ENDPOINT_READY 置 true —— UI 无需改动。

/** 入账类型：充值 / 赠送 / 奖励 */
export type IncomeRecordType = 'recharge' | 'gift' | 'reward'

/** 入账状态：已完成 / 处理中 / 失败（PRD 1.0.4 §8.6.1 三态） */
export type IncomeRecordStatus = 'completed' | 'processing' | 'failed'

/** 归属余额桶（canonical code，UI 侧翻译；真接口若返回任意字符串则原样透传） */
export type IncomeBalanceBucket = 'main' | 'gift' | 'reward' | (string & {})

/** 发票信息（可选）；status 对齐 PRD available/processing/issued */
export interface IncomeInvoiceRef {
  status: 'available' | 'processing' | 'issued'
  url?: string
}

/** 单条入账记录（对齐后端 #431 契约） */
export interface IncomeRecord {
  id: string
  type: IncomeRecordType
  /** 渠道 canonical code（alipay/admin/promo/activity/referral）或原始标签 */
  channel: string
  /** 入账号（充值单号 / 赠金流水号） */
  record_ref: string
  balance_bucket: IncomeBalanceBucket
  amount: Money
  status: IncomeRecordStatus
  created_at: string
  invoice?: IncomeInvoiceRef
}

export interface IncomeRecordListParams extends QueryParams {
  /** 类型筛选 */
  type?: IncomeRecordType
  /** 余额桶筛选 */
  bucket?: IncomeBalanceBucket
  from?: string
  to?: string
  cursor?: string
  page_size?: number
}

/**
 * 服务开关：后端 #431 交付后置 true，listIncomeRecords 直连真接口；
 * 当前为 false，走前端合成回落。
 */
const INCOME_RECORDS_ENDPOINT_READY = false

/** 充值渠道 → canonical channel code（未知则透传后端标签） */
function rechargeChannelCode(o: RechargeOrder): string {
  const c = (o.channel || '').toLowerCase()
  if (c === 'alipay') return 'alipay'
  if (c === 'admin' || c === 'manual' || (o.source ?? '').toLowerCase() === 'admin') return 'admin'
  return o.channel_label || o.channel || 'alipay'
}

/** 赠送来源 → 入账类型（含推荐/返佣/奖励关键字归为 reward，否则 gift） */
function giftRecordType(source: string | undefined): IncomeRecordType {
  const s = source ?? ''
  return /推荐|referral|reward|返佣|奖励|rebate/i.test(s) ? 'reward' : 'gift'
}

/** 赠送来源 → canonical channel code */
function giftChannelCode(source: string | undefined, type: IncomeRecordType): string {
  const s = source ?? ''
  if (/推荐|referral|返佣|rebate/i.test(s)) return 'referral'
  if (/优惠码|promo|兑换|redeem|code/i.test(s)) return 'promo'
  if (/活动|activity|campaign|注册|register|welcome|赠送/i.test(s)) return 'activity'
  return source || (type === 'reward' ? 'referral' : 'activity')
}

/**
 * 充值订单 → 入账记录。paid/pending/failed 三态纳入（PRD 1.0.4 §8.6.1 状态枚举含 failed，
 * 失败的充值尝试也需要在账本里可见）；取消/退款不是"入账"事件本身，仍然排除。
 */
function rechargeToIncome(o: RechargeOrder): IncomeRecord | null {
  if (o.status === 'cancelled' || o.status === 'refunded') return null
  const status: IncomeRecordStatus =
    o.status === 'paid' ? 'completed' : o.status === 'failed' ? 'failed' : 'processing'
  return {
    id: o.order_no,
    type: 'recharge',
    channel: rechargeChannelCode(o),
    record_ref: o.order_no,
    balance_bucket: 'main',
    amount: { amount: o.credited_amount || o.amount, currency: o.currency },
    status,
    created_at: o.paid_at || '',
    invoice: o.invoice_url ? { status: 'available', url: o.invoice_url } : undefined,
  }
}

/** 赠金入账 → 入账记录 */
function giftToIncome(g: GiftRecord): IncomeRecord {
  const type = giftRecordType(g.source)
  return {
    id: g.id,
    type,
    channel: giftChannelCode(g.source, type),
    record_ref: g.id,
    balance_bucket: type === 'reward' ? 'reward' : 'gift',
    amount: { amount: g.amount, currency: g.currency },
    status: 'completed',
    created_at: g.credited_at,
  }
}

/**
 * 前端合成回落：拉充值订单 + 赠送明细，映射为 IncomeRecord，按时间倒序合并，客户端游标分页。
 * TODO(#431): 后端交付 GET /tenants/{id}/income-records 后删除本回落，改走真接口。
 * 说明：回落各源最多取 100 条（合理上限），后端接口上线后不再受此限制。
 */
async function composeIncomeRecordsFallback(
  tenantId: string,
  params?: IncomeRecordListParams,
): Promise<CursorPage<IncomeRecord>> {
  const FETCH_CAP = 100
  const [recharges, gifts] = await Promise.all([
    listRecharges(tenantId, { page_size: FETCH_CAP }).catch(() => null),
    listGiftRecords(tenantId, { page_size: FETCH_CAP }).catch(() => null),
  ])

  const merged: IncomeRecord[] = [
    ...pageItems<RechargeOrder>(recharges)
      .map(rechargeToIncome)
      .filter((r): r is IncomeRecord => r !== null),
    ...pageItems<GiftRecord>(gifts).map(giftToIncome),
  ]

  // 时间倒序（ISO 字符串可直接比较；缺失时间沉底）
  merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  // 客户端筛选
  const filtered = merged.filter((r) => {
    if (params?.type && r.type !== params.type) return false
    if (params?.bucket && r.balance_bucket !== params.bucket) return false
    if (params?.from && r.created_at && r.created_at < params.from) return false
    if (params?.to && r.created_at && r.created_at > params.to) return false
    return true
  })

  // 客户端游标分页：cursor 即偏移量字符串
  const pageSize = params?.page_size ?? 15
  const offset = params?.cursor ? Number(params.cursor) || 0 : 0
  const slice = filtered.slice(offset, offset + pageSize)
  const nextOffset = offset + pageSize
  const hasMore = nextOffset < filtered.length

  return {
    items: slice,
    page_size: pageSize,
    has_more: hasMore,
    next_cursor: hasMore ? String(nextOffset) : null,
  }
}

/**
 * 入账记录列表（收入账本，qa#433）。
 * 单一入口/开关：INCOME_RECORDS_ENDPOINT_READY 为真时直连后端 #431，
 * 否则走前端合成回落（充值 + 赠送/奖励）。UI 只依赖本函数，无需感知数据来源。
 */
export function listIncomeRecords(
  tenantId: string,
  params?: IncomeRecordListParams,
): Promise<CursorPage<IncomeRecord>> {
  if (INCOME_RECORDS_ENDPOINT_READY) {
    // TODO(#431): 后端上线后启用；契约 = cursor page of IncomeRecord
    return get<CursorPage<IncomeRecord>>(`tenants/${tenantId}/income-records`, params)
  }
  return composeIncomeRecordsFallback(tenantId, params)
}
