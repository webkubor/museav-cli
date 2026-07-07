import type { QueryParams, TenantItem, TenantSettings } from '@/types'

export interface UpdateTenantRequest {
  name?: string
  settings?: Partial<TenantSettings>
}

/** 成员列表查询参数 */
export interface TenantMemberListParams extends QueryParams {
  /** 关键词搜索 display_name 或 email */
  q?: string
  cursor?: string
  page_size?: number
}

export interface TenantListResponse {
  items: TenantItem[]
  can_create_org?: boolean
}

// ─── Tenant 操作审计（#342）───────────────────────────

/** 审计日志筛选条件，列表与导出共用（导出侧不带 cursor/limit） */
export interface TenantAuditLogFilterParams extends QueryParams {
  /** 操作人 account_id */
  actor?: string
  /** 动作，如 membership.role_changed */
  action?: string
  result?: 'success' | 'failure' | 'denied'
  workspace_id?: string
  /** 起始时间 RFC3339（含） */
  from?: string
  /** 结束时间 RFC3339（不含） */
  to?: string
}

export interface TenantAuditLogListParams extends TenantAuditLogFilterParams {
  /** 上一页 next_cursor */
  cursor?: string
  /** 默认 100，上限 200 */
  limit?: number
}

export type TenantAuditLogExportParams = TenantAuditLogFilterParams
