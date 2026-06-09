/**
 * 发票 / 开票服务（V1.2 功能块 B）
 *
 * ⚠️ 后端开票/记录/抬头接口尚未上 Swagger（仅有 transactions / account-invoice-profile 零散接口）。
 * 当前为 Mock 实现，让客户端 UI 先对照原型跑通；接口就绪后用 get/post/patch 替换函数体即可，签名不变。
 * 真实路径建议（待后端确认）：
 *   GET    /tenants/:id/invoices/recharges      可开票充值
 *   GET    /tenants/:id/invoices                发票记录
 *   POST   /tenants/:id/invoices                合并开票
 *   POST   /tenants/:id/invoices/:no/retry      重新开具
 *   GET    /tenants/:id/invoices/:no/download   下载
 *   GET    /tenants/:id/invoice-titles          抬头列表
 *   POST   /tenants/:id/invoice-titles          新增抬头
 *   PATCH  /tenants/:id/invoice-titles/:tid/default  设默认
 */
import type {
  InvoiceableRecharge,
  InvoiceRecord,
  InvoiceTitle,
  CreateInvoiceTitleRequest,
  CreateInvoiceRequest,
} from '@/types'

const mockDelay = <T,>(data: T, ms = 400): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), ms))

// ─── Mock 数据（对照原型；接后端后删除）────────────────────────────

const MOCK_RECHARGES: InvoiceableRecharge[] = [
  { recharge_id: 'r1', order_no: 'RC20260601A7F3', amount: '500.00', currency: 'CNY', invoice_status: 'billable' },
  { recharge_id: 'r2', order_no: 'RC20260528K2D9', amount: '100.00', currency: 'CNY', invoice_status: 'billable' },
  { recharge_id: 'r3', order_no: 'RC20260520X4M6', amount: '200.00', currency: 'CNY', invoice_status: 'billable' },
  { recharge_id: 'r4', order_no: 'RC20260515T9E2', amount: '1000.00', currency: 'CNY', invoice_status: 'invoiced', invoice_no: 'INV-0009' },
]

const MOCK_RECORDS: InvoiceRecord[] = [
  { invoice_no: 'INV-0009', status: 'invoiced', title_type: 'vat_special', total_amount: '1000.00', currency: 'CNY', company_name: '上海某某网络科技有限公司', tax_serial: '24317000000123456789' },
  { invoice_no: 'INV-0008', status: 'failed', title_type: 'vat_normal', total_amount: '300.00', currency: 'CNY', company_name: '杭州数智信息技术有限公司', error_msg: '出票失败：开票员未在有效时间内完成人脸认证，请稍后重试或联系客服。' },
  { invoice_no: 'INV-0007', status: 'invoiced', title_type: 'vat_special', total_amount: '2000.00', currency: 'CNY', company_name: '上海某某网络科技有限公司', tax_serial: '24317000000111222333' },
  { invoice_no: 'INV-0006', status: 'voided', title_type: 'vat_normal', total_amount: '500.00', currency: 'CNY', company_name: '杭州数智信息技术有限公司', tax_serial: '24317000000444555666' },
  { invoice_no: 'INV-0005', status: 'invoiced', title_type: 'vat_special', total_amount: '600.00', currency: 'CNY', company_name: '上海某某网络科技有限公司', tax_serial: '24317000000777888999' },
  { invoice_no: 'INV-0004', status: 'invoiced', title_type: 'vat_normal', total_amount: '150.00', currency: 'CNY', company_name: '杭州数智信息技术有限公司', tax_serial: '24317000000000000004' },
]

const MOCK_TITLES: InvoiceTitle[] = [
  {
    id: 't1', type: 'vat_special', company_name: '上海某某网络科技有限公司',
    tax_id: '91310000MA1FL***XY', email: 'finance@demo-corp.com', is_default: true,
    reg_address: '上海市浦东新区张江路 88 号 5 楼', reg_phone: '021-0688 7610',
    bank_name: '招商银行上海张江支行', bank_account: '1219 0688 7610 901',
  },
  {
    id: 't2', type: 'vat_normal', company_name: '杭州数智信息技术有限公司',
    tax_id: '91330100MA2AB***Z9', email: 'ap@demo-tech.com', is_default: false,
  },
]

// ─── 接口（Mock 实现）───────────────────────────────────────────

/** 可开票 / 已开票的充值单 */
export function listInvoiceableRecharges(_tenantId: string) {
  return mockDelay({ items: MOCK_RECHARGES })
}

/** 发票记录（状态筛选 + 关键词 + 游标分页） */
export function listInvoiceRecords(
  _tenantId: string,
  params?: { status?: string; keyword?: string; cursor?: string }
) {
  let items = MOCK_RECORDS
  if (params?.status) items = items.filter((r) => r.status === params.status)
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase()
    items = items.filter(
      (r) => r.invoice_no.toLowerCase().includes(kw) || r.company_name.toLowerCase().includes(kw)
    )
  }
  // 模拟「加载更多（剩 1）」：首页 5 条，第二页剩余
  const page = params?.cursor ? items.slice(5) : items.slice(0, 5)
  return mockDelay({ items: page, has_more: !params?.cursor && items.length > 5, total: items.length })
}

/** 合并开票 */
export function createInvoice(_tenantId: string, _body: CreateInvoiceRequest) {
  return mockDelay({ invoice_no: 'INV-PENDING', status: 'invoicing' as const })
}

/** 重新开具（失败时） */
export function retryInvoice(_tenantId: string, _invoiceNo: string) {
  return mockDelay({ ok: true })
}

/** 下载发票（返回文件直链） */
export function getInvoiceDownloadUrl(_tenantId: string, invoiceNo: string) {
  return mockDelay({ url: `about:blank#${invoiceNo}` })
}

/** 抬头列表 */
export function listInvoiceTitles(_tenantId: string) {
  return mockDelay({ items: MOCK_TITLES })
}

/** 新增抬头 */
export function createInvoiceTitle(_tenantId: string, _body: CreateInvoiceTitleRequest) {
  return mockDelay({ ok: true })
}

/** 设为默认抬头 */
export function setDefaultInvoiceTitle(_tenantId: string, _titleId: string) {
  return mockDelay({ ok: true })
}
