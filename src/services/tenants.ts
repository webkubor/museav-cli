/**
 * 租户管理（§五）
 * 路由：/tenants、/tenants/:id
 * API：GET /tenants、GET|PATCH /tenants/:id、GET|POST|PATCH|DELETE /tenants/:id/members、
 * GET|POST /tenants/:id/invite-link、PUT /tenants/:id/logo
 */
import client, { apiBaseUrl, del, get, ModelGoApiError, patch, post, upload } from '@/lib/request'
import type {
  TenantAuditLogExportParams,
  TenantAuditLogListParams,
  TenantListResponse,
  TenantMemberListParams,
  UpdateTenantRequest,
} from '@/interfaces/tenants'
import type {
  AddTenantMemberRequest,
  AddTenantMemberResponse,
  ApiResponse,
  TenantAuditLog,
  TenantAuditLogsResponse,
  TenantDetail,
  TenantInviteLink,
  TenantMembersResponse,
} from '@/types'
/** 当前 account 可访问的所有 tenant 列表（无分页） */
export function listTenants() {
  return get<TenantListResponse>('tenants')
}


/** 获取指定 tenant 详情 */
export function getTenant(tenantId: string) {
  return get<TenantDetail>(`tenants/${tenantId}`)
}

/** 更新 tenant 基本信息或账单设置（仅 tenant_owner / tenant_admin） */
export function updateTenant(tenantId: string, body: UpdateTenantRequest) {
  return patch<TenantDetail>(`tenants/${tenantId}`, body)
}

/** 上传 / 更换组织头像（PUT /tenants/:id/logo） */
export function uploadTenantLogo(tenantId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return upload<{ logo_url: string }>('put', `tenants/${tenantId}/logo`, formData)
}

// ─── Tenant 成员管理 ───────────────────────────────

export function listTenantMembers(tenantId: string, params?: TenantMemberListParams) {
  return get<TenantMembersResponse>(`tenants/${tenantId}/members`, params)
}

/** 批量添加 tenant 成员（发送邀请邮件） */
export function addTenantMembers(tenantId: string, body: AddTenantMemberRequest) {
  return post<AddTenantMemberResponse>(`tenants/${tenantId}/members`, body)
}

/** 修改成员角色（tenant_admin | tenant_member） */
export function updateTenantMemberRole(
  tenantId: string,
  accountId: string,
  role: 'tenant_admin' | 'tenant_member'
) {
  return patch<null>(`tenants/${tenantId}/members/${accountId}`, { role })
}

/** 移除 tenant 成员（同步撤销其 workspace 成员资格和 API Key） */
export function removeTenantMember(tenantId: string, accountId: string) {
  return del<null>(`tenants/${tenantId}/members/${accountId}`)
}

/** 停用 tenant 成员（#340）：暂停登录与访问，不删除成员关系 */
export function suspendTenantMember(tenantId: string, accountId: string) {
  return post<null>(`tenants/${tenantId}/members/${accountId}/suspend`, {})
}

/** 启用（恢复）已停用的 tenant 成员（#340） */
export function reactivateTenantMember(tenantId: string, accountId: string) {
  return post<null>(`tenants/${tenantId}/members/${accountId}/reactivate`, {})
}

/**
 * 重发租户邀请邮件（#176）。仅对 pending 邀请有效——重发并延长有效期。
 * 后端：POST /tenants/:id/invites/:invitationId/resend（非 pending → code=40901）。
 */
export function resendTenantInvite(tenantId: string, invitationId: string) {
  return post<{ email: string; invitation_id: string; status: string }>(
    `tenants/${tenantId}/invites/${invitationId}/resend`,
    {},
  )
}

/** 解散组织（仅 tenant_owner） */
export function dissolveTenant(tenantId: string) {
  return del<null>(`tenants/${tenantId}`)
}

/** 转让组织所有权（仅 tenant_owner）。转让后原 owner 降级为管理员，目标成员成为 tenant_owner，立即生效。 */
export function transferOwnership(tenantId: string, toAccountId: string) {
  return post<null>(`tenants/${tenantId}/transfer-ownership`, { to_account_id: toAccountId })
}

// ─── Tenant 邀请链接 ───────────────────────────────

/** 获取组织邀请链接 */
export function getTenantInviteLink(tenantId: string) {
  return get<TenantInviteLink>(`tenants/${tenantId}/invite-link`)
}

/**
 * 重置组织邀请链接（旧 token 立即失效，新链接为一次性使用）。
 * role/expires_in_hours 让新链接绑定初始角色与有效期。
 * TODO(后端待接 · 凌霄): reset 需接收 role + expires_in_hours 并按其生成链接；
 * 链接语义改为 single_use（一次性），TenantInviteLink 返回 role/expires_at/single_use。
 */
export function resetTenantInviteLink(
  tenantId: string,
  params?: { role?: 'tenant_admin' | 'tenant_member'; expires_in_hours?: number },
) {
  return post<TenantInviteLink>(`tenants/${tenantId}/invite-link/reset`, params ?? {})
}

// ─── Tenant 操作审计（#342）───────────────────────────

function auditSearchParams(params?: TenantAuditLogListParams | TenantAuditLogExportParams) {
  if (!params) return undefined
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)])
  )
}

/** 组织操作审计日志列表（游标分页）。仅 tenant_owner / tenant_admin（需 org.audit:view）可读。 */
export function listTenantAuditLogs(tenantId: string, params?: TenantAuditLogListParams) {
  return get<TenantAuditLogsResponse>(`tenants/${tenantId}/audit-logs`, params)
}

/** 单条审计日志详情（含结构化 changes[]），供右侧详情面板拉取完整字段。 */
export function getTenantAuditLog(tenantId: string, auditId: string) {
  return get<TenantAuditLog>(`tenants/${tenantId}/audit-logs/${auditId}`)
}

/**
 * 导出组织操作审计为 CSV（需 org.audit:export）。
 * 成功时同步返回 text/csv 附件（非 JSON 信封），上限 1 万条，超限响应头
 * X-Audit-Truncated=true；因此不能走 lib/request 的 post()（它无条件 .json()，
 * 遇到 CSV 响应会抛错）——直接用默认导出的 ky client（自带 CSRF/鉴权 hooks），
 * 按 content-type 分流：JSON（40001 参数非法 / 40301 无权限等业务错误）按信封
 * 解析后抛 ModelGoApiError，其余视为 CSV 返回 Blob。
 */
export async function exportTenantAuditLogs(
  tenantId: string,
  params?: TenantAuditLogExportParams,
): Promise<Blob> {
  const url = `${apiBaseUrl()}/api/v1/tenants/${tenantId}/audit-logs/export`
  const httpResp = await client.post(url, { searchParams: auditSearchParams(params) })
  const contentType = httpResp.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const envelope = await httpResp.json<ApiResponse<null>>()
    throw new ModelGoApiError({
      code: envelope.code,
      msg: envelope.msg,
      request_id: envelope.request_id,
      trace_id: envelope.trace_id,
      data: envelope.data ?? null,
    })
  }
  return httpResp.blob()
}
