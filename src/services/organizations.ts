/**
 * 企业组织管理（§组织）
 * 路由：/organizations
 * API：POST /organizations
 */
import { post } from '@/lib/request'

export interface CreateOrganizationResponse {
  tenant_id: string
  name: string
  slug: string
  type: 'enterprise'
  default_workspace_id: string
  created_at: string
}

/** 创建企业组织（slug 由后端从 name 自动派生） */
export function createOrganization(body: { name: string }) {
  return post<CreateOrganizationResponse>('organizations', body)
}
