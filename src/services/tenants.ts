/**
 * 租户管理（§五）
 * 路由：/tenants、/tenants/:id
 * API：GET /tenants、GET|PATCH /tenants/:id、GET|POST|PATCH|DELETE /tenants/:id/members、
 * GET|POST /tenants/:id/invite-link、PUT /tenants/:id/logo
 */
import { del, get, patch, post, upload } from '@/lib/request'
import type {
  TenantListResponse,
  TenantMemberListParams,
  UpdateTenantRequest,
} from '@/interfaces/tenants'
import type {
  AddTenantMemberRequest,
  AddTenantMemberResponse,
  CursorPage,
  TenantDetail,
  TenantInviteLink,
  TenantMember,
} from '@/types'
import { useDevStore } from '@/store/use-dev-store'

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

/** 获取 tenant 成员列表 */
/** 开发环境：按 dev 工具栏设定的人数生成 mock 组织成员，便于演示 */
function genMockTenantMembers(n: number): CursorPage<TenantMember> {
  const names = ['张伟', '李娜', '王芳', '刘洋', '陈静', '杨光', '赵磊', '黄敏', '周杰', '吴昊']
  const items: TenantMember[] = Array.from({ length: n }, (_, i) => ({
    account: {
      account_id: `mock-member-${i}`,
      display_name: i < names.length ? names[i] : `${names[i % names.length]} ${Math.floor(i / names.length) + 1}`,
      email: `member${i + 1}@demo.modelgo.com`,
      avatar_url: null,
    },
    role: i === 0 ? 'tenant_owner' : i % 5 === 0 ? 'tenant_admin' : 'tenant_member',
    joined_at: '2025-01-15T08:00:00Z',
    workspace_count: (i % 3) + 1,
    api_key_count: i % 4,
    spend_30d: { amount: String((i * 137) % 5000), currency: 'CNY' },
    status: 'active',
  }))
  return { items, page_size: n, has_more: false, next_cursor: null }
}

export function listTenantMembers(tenantId: string, params?: TenantMemberListParams) {
  if (import.meta.env.DEV) {
    const n = useDevStore.getState().mockMemberCount
    if (n > 0) return Promise.resolve(genMockTenantMembers(n))
  }
  return get<CursorPage<TenantMember>>(`tenants/${tenantId}/members`, params)
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

// ─── Tenant 邀请链接 ───────────────────────────────

/** 获取组织邀请链接 */
export function getTenantInviteLink(tenantId: string) {
  return get<TenantInviteLink>(`tenants/${tenantId}/invite-link`)
}

/** 重置组织邀请链接（旧 token 立即失效） */
export function resetTenantInviteLink(tenantId: string) {
  return post<TenantInviteLink>(`tenants/${tenantId}/invite-link/reset`, {})
}
