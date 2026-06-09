export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type TaskKind = 'video' | 'image' | 'audio'

/** 异步任务列表项（GET /async-tasks） */
export interface TaskItem {
  gateway_request_id: string
  requested_model: string
  platform: string
  status: TaskStatus
  progress: string
  error_message: string
  api_key_id: string
  workspace_id: string
  tenant_id: string
  account_id: string
  created_at: string
  updated_at: string
  completed_at: string
  actual_cost?: number
  line?: string
  kind?: TaskKind
  vendor?: string
  prompt?: string
  from_image?: boolean
}

/** 异步任务详情（GET /async-tasks/{requestId}） */
export interface TaskDetail {
  task: TaskItem
  provider_meta?: Record<string, unknown>
  call_log_snapshot?: Record<string, unknown>
}

/** 任务列表查询参数 */
export interface TaskListParams {
  workspace_id?: string
  status?: string
  search?: string
  limit?: number
  offset?: number
  [key: string]: string | number | boolean | null | undefined
}

/** 任务列表分页响应 */
export interface TaskListResponse {
  items: TaskItem[]
  total: number
  limit: number
  offset: number
}
