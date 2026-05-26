import type { QueryParams, WorkspaceItem } from '@/types'

/** Workspace 成员列表查询参数 */
export interface WorkspaceMemberListParams extends QueryParams {
  cursor?: string
  page_size?: number
}

export interface WorkspaceListResponse {
  items: WorkspaceItem[]
}
