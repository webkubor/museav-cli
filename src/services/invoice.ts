/**
 * 发票 / 开票服务（V1.2 功能块 B）
 * 后端接口已上线（test Swagger `/tenants/{tenantId}/invoices*`），路径/返回结构已按 Swagger 校准。
 */
import { get, post, patch, del } from '@/lib/request'
import type {
  InvoiceableRecharge,
  InvoiceRecord,
  InvoiceTitle,
  CreateInvoiceTitleRequest,
  CreateInvoiceRequest,
} from '@/types'

interface RecordsPage {
  items: InvoiceRecord[]
  has_more: boolean
  total: number
}

/** 可开票 / 已开票的充值单 */
export function listInvoiceableRecharges(tenantId: string) {
  return get<{ items: InvoiceableRecharge[] }>(`tenants/${tenantId}/invoices/recharges`)
}

/** 发票记录（状态筛选 + 关键词 + 游标分页） */
export function listInvoiceRecords(
  tenantId: string,
  params?: { status?: string; keyword?: string; cursor?: string }
) {
  return get<RecordsPage>(`tenants/${tenantId}/invoices`, params)
}

/** 合并开票 */
export function createInvoice(tenantId: string, body: CreateInvoiceRequest) {
  return post<{ invoice_no: string; status?: string }>(`tenants/${tenantId}/invoices`, body)
}

/** 重新提交开票申请并自动触发销方开票 */
export function retryInvoice(tenantId: string, invoiceNo: string) {
  return post<{ invoice_no?: string; status?: string; ok?: boolean }>(`tenants/${tenantId}/invoices/${invoiceNo}/retry`, {})
}

/** 下载发票（返回文件直链） */
export function getInvoiceDownloadUrl(tenantId: string, invoiceNo: string) {
  return get<{ url: string }>(`tenants/${tenantId}/invoices/${invoiceNo}/download`)
}

/** 抬头列表 */
export function listInvoiceTitles(tenantId: string) {
  return get<{ items: InvoiceTitle[] }>(`tenants/${tenantId}/invoice-titles`)
}

/** 新增抬头 */
export function createInvoiceTitle(tenantId: string, body: CreateInvoiceTitleRequest) {
  return post<{ ok?: boolean }>(`tenants/${tenantId}/invoice-titles`, body)
}

/** 设为默认抬头 */
export function setDefaultInvoiceTitle(tenantId: string, titleId: string) {
  return patch<{ ok?: boolean }>(`tenants/${tenantId}/invoice-titles/${titleId}/default`, {})
}

/** 删除抬头（任意抬头含默认均可删，#426 后端待补 DELETE 接口，先接线） */
export function deleteInvoiceTitle(tenantId: string, titleId: string) {
  return del<{ ok?: boolean }>(`tenants/${tenantId}/invoice-titles/${titleId}`)
}
