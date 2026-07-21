/** ModelGo Web API 统一响应信封 */
export interface ApiEnvelope<T> {
  /** 业务状态码，0 表示成功，非 0 表示业务错误。 */
  code: number
  /** 实际业务数据。 */
  data: T
  /** 给前端展示或调试用的业务提示。 */
  msg: string
  /** 后端请求追踪 id，用于日志排障和客服定位问题。 */
  request_id: string
  /** 分布式链路追踪 id，后端用于跨服务定位问题（如 "04b155f0a86b0706d41a68d076e094c2"）。 */
  trace_id?: string
}

export type ApiResponse<T> = ApiEnvelope<T>

/** cursor-based 分页响应 */
export interface CursorPage<T> {
  /** 当前页数据列表。 */
  items: T[]
  /** 后端本次实际返回的分页大小。 */
  page_size: number
  /** 是否还有下一页。 */
  has_more: boolean
  /** 下一页游标；没有下一页时为 null。 */
  next_cursor: string | null
  /** 当前筛选命中的总条数；仅首页/显式 with_total 请求返回，游标翻页省略（qa#510）。 */
  total?: number
}

/** API 错误 */
export interface ApiError {
  /** 业务错误码。 */
  code: number
  /** 错误提示文案。 */
  msg: string
  /** 后端请求追踪 id，可能在网络错误或非标准响应中缺失。 */
  request_id?: string
  /** 分布式链路追踪 id。 */
  trace_id?: string
  /** 错误附加数据，主要用于表单字段级错误。 */
  data?: {
    field_errors?: Array<{
      /** 出错字段名。 */
      field: string
      /** 字段级错误提示。 */
      message: string
    }>
  } | null
}

export type PaginatedData<T> = CursorPage<T>

/** GET 查询参数；null / undefined 会在请求前被过滤掉。 */
export type QueryParams = Record<string, string | number | boolean | null | undefined>
