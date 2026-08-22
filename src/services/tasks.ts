import { get } from '@/lib/request'
import type {
  AsyncTasksSummary,
  TaskDetail,
  TaskListParams,
  TaskListResponse,
  TaskSummaryParams,
} from '@/types'

export function listTasks(params?: TaskListParams) {
  return get<TaskListResponse>('async-tasks', params)
}

/**
 * 异步任务 Summary（需求方#668 的「异步任务」六项指标）。
 *
 * 端点必须是 `async-tasks/summary`（后端 qa#605 新增），参数与 `async-tasks` 同口径 ——
 * PRD 硬性要求「Summary 始终按当前视图范围、记录类型及全部筛选条件计算，与列表结果完全一致」。
 * 调用方请用 TaskSummaryParams（= 列表参数 Omit 掉分页）直接从列表参数派生，
 * 不要另拼一份：#668 早期同步侧就是因为端点/参数各写一套，误接到 model-logs/stats，
 * 数值与列表差了 20 倍才被发现。
 *
 * ⚠️ 已知后端缺陷（不影响计数类指标）：响应的 total_spend 跨币种裸求和、currency
 * 取少数派币种（后端单 qa#669）。前端只用金额、币种走租户结算币种，详见 types/tasks.ts。
 */
export function getAsyncTasksSummary(params?: TaskSummaryParams) {
  return get<AsyncTasksSummary>('async-tasks/summary', params)
}

export function getTask(requestId: string) {
  return get<TaskDetail>(`async-tasks/${encodeURIComponent(requestId)}`)
}
