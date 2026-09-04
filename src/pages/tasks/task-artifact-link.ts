/**
 * 调用日志到任务产物详情的下钻（需求方#954）
 * 路由：/logs?record_type=async&task_id=<gateway_request_id>
 * API：GET /async-tasks/:requestId
 */
import type { TaskDetail, TaskItem } from '@/types'

/** 从当前列表或详情响应取得与 URL 完全对应的任务；绝不因相近 ID 打开错误任务。 */
export function taskForAutoOpen(
  items: TaskItem[],
  taskId: string | undefined,
  detail: TaskDetail | undefined,
): TaskItem | undefined {
  if (!taskId) return undefined
  return items.find((item) => item.gateway_request_id === taskId)
    ?? (detail?.task.gateway_request_id === taskId ? detail.task : undefined)
}
