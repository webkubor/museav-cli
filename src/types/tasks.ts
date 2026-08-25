export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'completed' | 'failed' | 'cancelled'
export type TaskKind = 'video' | 'image' | 'audio'
export type TaskBillingState = 'settled' | 'pending' | 'unbilled' | 'partial'
export type TaskArtifactState = 'generating' | 'available' | 'expired' | 'failed'

/** 异步任务在 ModelGo / 上游各状态首次出现的时间。 */
export interface TaskStatusTimestamps {
  submitted?: string
  queued?: string
  running?: string
  succeeded?: string
  failed?: string
}

export interface TaskResultMeta {
  result_expires_at?: string
  result_ttl_seconds?: number
  status_timestamps?: TaskStatusTimestamps
  // TODO(#446): 产物文件名/格式/分辨率/时长 后端未交付，字段可选、缺省展示占位「—」
  result_filename?: string
  result_format?: string
  result_resolution?: string
  result_duration_seconds?: number
}

/** 异步任务输入的脱敏摘要；由后端从提示词提取，非原始请求载荷。 */
export interface TaskRequestSummary {
  prompt?: string
  parameters?: Record<string, string>
  reference_image_count?: number
  input_file_count?: number
  redaction_state?: 'captured' | 'redacted' | 'not_captured'
}

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
  /** 新契约计费状态：settled / pending / unbilled / partial */
  billing_state?: TaskBillingState
  /** 旧字段兼容：仅用于后端尚未切换的环境 */
  billing_status?: string
  /** 新契约产物状态：generating / available / expired / failed */
  artifact_state?: TaskArtifactState
  /** 产物数量；成功但仍为 0 时表示产物尚未落库。 */
  artifact_count?: number
  /** 计费币种 CNY/USD */
  currency?: string
  // ── 以下为后端扩展字段（非核心 Row，待接入）─────────
  line?: string
  kind?: TaskKind
  vendor?: string
  prompt?: string
  from_image?: boolean
  /** 产物有效期信息（后端填充后才有值） */
  result_meta?: TaskResultMeta
}

/** 异步任务详情（GET /async-tasks/{requestId}） */
export interface TaskDetail {
  task: TaskItem
  request_summary?: TaskRequestSummary
  provider_meta?: Record<string, unknown>
  /** 上游原始响应透传（未类型化），视频任务的产物 URL 一般在其中（如 Ark 的 content.video_url） */
  provider_response?: Record<string, unknown>
  call_log_snapshot?: Record<string, unknown>
  /** 产物有效期信息（详情接口独立返回，可能与 task.result_meta 不同步） */
  result_meta?: TaskResultMeta
}

/** 任务列表查询参数 */
export interface TaskListParams {
  workspace_id?: string
  status?: string
  search?: string
  /** 时间窗口预设，后端仅支持这三档（无 from/to 自定义区间） */
  preset?: '1h' | '24h' | '7d'
  /** 新契约产物状态筛选 */
  artifact_state?: TaskArtifactState
  /** 新契约计费状态筛选 */
  billing_state?: TaskBillingState
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

/**
 * 异步任务 Summary 查询参数（需求方#668）。
 * 就是列表参数去掉分页 —— Swagger 实测 /async-tasks/summary 接受的 query 与
 * /async-tasks 完全一致，只少 limit/offset。用 Omit 派生而非另写一份，是为了
 * 让「Summary 与列表同口径」这个硬性要求在类型层就成立：列表加了新筛选，
 * 这里自动跟上，不会像 #668 早期那样两边口径悄悄分叉。
 */
export type TaskSummaryParams = Omit<TaskListParams, 'limit' | 'offset'>

/** 按币种分组的费用（qa#669 后端新增，混币窗口下唯一权威的费用口径） */
export interface AsyncSpendByCurrency {
  currency: string
  amount: string
}

/**
 * 异步任务 Summary 响应（后端 qa#605，费用口径经 qa#669 修正）。
 *
 * **费用只认 spend_by_currency**：qa#669 修完后，后端按币种分组返回，
 * 混币窗口下 total_spend / currency **返回空字符串**（不再吐跨币种裸求和的误导标量），
 * 只有单币种窗口才给这两个标量。所以 total_spend 必须判空——`Number('')` 是 0，
 * 直接 formatMoney 会把「5203.30 元 + 3.04 美元」渲染成 ¥0（比原来的币种标错更糟）。
 *
 * 历史（留着防回退）：qa#669 修复前 total_spend 是跨币种裸求和、currency 取少数派币种，
 * QA 2026-08-19 实测 CNY 2365 条 5172.540982 + USD 15 条 3.04 → total_spend 5175.580982、currency "USD"。
 */
export interface AsyncTasksSummary {
  total_tasks?: number
  succeeded_tasks?: number
  queued_tasks?: number
  running_tasks?: number
  failed_tasks?: number
  expired_tasks?: number
  /** 后端已实测等于 failed_tasks + expired_tasks，直接用，不在前端重算 */
  failed_or_expired_tasks?: number
  /** 按币种分组的费用；混币窗口下这是唯一可用的费用口径 */
  spend_by_currency?: AsyncSpendByCurrency[]
  /** 仅单币种窗口有值；混币时后端返回空字符串 */
  total_spend?: string
  /** 仅单币种窗口有值；混币时后端返回空字符串 */
  currency?: string
  pending_billing_tasks?: number
  available_products?: number
  expired_products?: number
}
