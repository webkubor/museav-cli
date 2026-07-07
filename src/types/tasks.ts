export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'completed' | 'failed' | 'cancelled'
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
  /** 输入 token 用量 */
  input_tokens?: number
  /** 输出 token 用量 */
  output_tokens?: number
  /** 实际费用（decimal 字符串，如 "0.000000000000"），配合 currency 显示 */
  final_amount?: string
  /** 计费状态，如 settled */
  billing_status?: string
  /** 计费币种 CNY/USD */
  currency?: string
  // ── 以下为后端扩展字段（非核心 Row，待接入）─────────
  line?: string
  kind?: TaskKind
  vendor?: string
  prompt?: string
  from_image?: boolean
  /** 产物有效期信息（后端填充后才有值） */
  result_meta?: {
    result_expires_at?: string
    result_ttl_seconds?: number
  }
}

/** 异步任务详情（GET /async-tasks/{requestId}） */
export interface TaskDetail {
  task: TaskItem
  provider_meta?: Record<string, unknown>
  /** 上游原始响应透传（未类型化），视频任务的产物 URL 一般在其中（如 Ark 的 content.video_url） */
  provider_response?: Record<string, unknown>
  call_log_snapshot?: Record<string, unknown>
  /** 产物有效期信息（详情接口独立返回，可能与 task.result_meta 不同步） */
  result_meta?: {
    result_expires_at?: string
    result_ttl_seconds?: number
  }
}

/** 任务列表查询参数 */
export interface TaskListParams {
  workspace_id?: string
  status?: string
  search?: string
  /** 时间窗口预设，后端仅支持这三档（无 from/to 自定义区间） */
  preset?: '1h' | '24h' | '7d'
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
