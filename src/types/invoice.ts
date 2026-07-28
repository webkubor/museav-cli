/**
 * 发票 / 开票领域类型（V1.2 功能块 B）
 * 字段对照 test Swagger `invoice.*` schema 校准（后端已上线，非占位骨架）。
 */

/** 票种：增值税普票 / 增值税专票 / 国外 Invoice */
export type InvoiceTitleType = 'vat_normal' | 'vat_special' | 'overseas'

/** 发票抬头（购买方）；专票额外含注册地址/电话/开户行/账号 4 项 */
export interface InvoiceTitle {
  id: string
  type: InvoiceTitleType
  company_name: string
  tax_id: string
  email: string
  is_default: boolean
  reg_address?: string
  reg_phone?: string
  bank_name?: string
  bank_account?: string
}

/** 充值单开票状态 */
export type RechargeInvoiceStatus = 'billable' | 'pending' | 'invoicing' | 'invoiced' | 'failed' | 'voided'

/** 申请开票页：可开票 / 已开票的充值单 */
export interface InvoiceableRecharge {
  recharge_id: string
  order_no: string
  amount: string
  currency: string
  invoice_status: RechargeInvoiceStatus
  invoice_no?: string
}

/** 发票记录状态（对齐 Swagger invoice.Status 全 5 值） */
export type InvoiceStatus = 'pending' | 'invoicing' | 'invoiced' | 'failed' | 'voided'

/** 发票记录 */
export interface InvoiceRecord {
  invoice_no: string
  status: InvoiceStatus
  title_type: InvoiceTitleType
  total_amount: string
  currency: string
  company_name: string
  tax_serial?: string
  error_msg?: string
  download_url?: string
  /** 申请时间（UTC RFC3339），列表默认按它倒序（PRD 1.0.4 §8.7.1.1，qa#541） */
  created_at: string
  /** 该发票覆盖的充值单数量（PRD 1.0.4 §8.7.1.1，qa#541） */
  recharge_count: number
}

/** 新增抬头请求体 */
export interface CreateInvoiceTitleRequest {
  type: InvoiceTitleType
  company_name: string
  tax_id: string
  email: string
  reg_address?: string
  reg_phone?: string
  bank_name?: string
  bank_account?: string
}

/** 合并开票请求体 */
export interface CreateInvoiceRequest {
  recharge_ids: string[]
  title_id: string
  title_type: InvoiceTitleType
}
